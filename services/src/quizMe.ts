import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getUserId } from './lib/auth';
import { ok, badRequest, unauthorized, notFound, serverError } from './lib/http';
import { log } from './lib/logger';
import { invokeAI, parseJsonObject } from './lib/aiClient';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;
const QUIZ_MODEL_ID = process.env.QUIZ_MODEL_ID ?? process.env.AI_MODEL_ID;
const MAX_TURNS_IN_PROMPT = 10;

interface Turn {
  role: 'agent' | 'student';
  text: string;
  topic?: string;
  grade?: 'correct' | 'partial' | 'incorrect';
}

interface MasteryEntry {
  asked: number;
  correct: number;
  partial: number;
  score: number;
}

interface KitItem {
  status: string;
  summary?: string;
  topics?: string[];
}

function masterySK(uploadId: string, topic: string): string {
  return `MASTERY#${uploadId}#${topic}`;
}
function sessionSK(uploadId: string, sessionId: string): string {
  return `SESSION#${uploadId}#${sessionId}`;
}

async function getKit(userId: string, uploadId: string): Promise<KitItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `UPLOAD#${uploadId}` } }),
  );
  return (res.Item as KitItem) ?? null;
}

async function getMasteryMap(
  userId: string,
  uploadId: string,
): Promise<Record<string, MasteryEntry>> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `MASTERY#${uploadId}#`,
      },
    }),
  );
  const map: Record<string, MasteryEntry> = {};
  for (const item of res.Items ?? []) {
    map[item.topic as string] = {
      asked: item.asked ?? 0,
      correct: item.correct ?? 0,
      partial: item.partial ?? 0,
      score: item.score ?? 0,
    };
  }
  return map;
}

/** Pick the topic with the lowest mastery score (least asked breaks ties). */
function weakestTopic(topics: string[], mastery: Record<string, MasteryEntry>): string {
  let best = topics[0];
  let bestScore = Infinity;
  for (const t of topics) {
    const m = mastery[t];
    const score = m ? m.score : -1; // never-asked topics prioritized
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

async function updateMastery(
  userId: string,
  uploadId: string,
  topic: string,
  grade: 'correct' | 'partial' | 'incorrect',
): Promise<Record<string, MasteryEntry>> {
  const inc = grade === 'correct' ? 1 : 0;
  const pInc = grade === 'partial' ? 1 : 0;
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: masterySK(uploadId, topic) },
      UpdateExpression:
        'SET topic = :t, asked = if_not_exists(asked, :z) + :one, correct = if_not_exists(correct, :z) + :c, #partial = if_not_exists(#partial, :z) + :p, updatedAt = :now',
      ExpressionAttributeNames: { '#partial': 'partial' },
      ExpressionAttributeValues: {
        ':t': topic,
        ':z': 0,
        ':one': 1,
        ':c': inc,
        ':p': pInc,
        ':now': now,
      },
    }),
  );
  // Recompute score = (correct + 0.5*partial) / asked and persist it.
  const map = await getMasteryMap(userId, uploadId);
  const m = map[topic];
  if (m) {
    m.score = m.asked > 0 ? (m.correct + 0.5 * m.partial) / m.asked : 0;
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: masterySK(uploadId, topic) },
        UpdateExpression: 'SET score = :s',
        ExpressionAttributeValues: { ':s': m.score },
      }),
    );
  }
  return map;
}

async function askQuestion(
  kit: KitItem,
  topic: string,
  recentTurns: Turn[],
): Promise<string> {
  const history = recentTurns
    .slice(-MAX_TURNS_IN_PROMPT)
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n');
  const raw = await invokeAI({
    modelId: QUIZ_MODEL_ID,
    system:
      'You are an adaptive study tutor. Ask ONE short quiz question on the given topic, ' +
      'grounded in the notes summary. Do not repeat earlier questions. Respond with ONLY ' +
      'JSON: {"question":"..."}.',
    userText:
      `Notes summary:\n${kit.summary ?? ''}\n\nTopic to quiz: ${topic}\n\n` +
      (history ? `Recent conversation:\n${history}\n\n` : '') +
      'Give the next question.',
    maxTokens: 200,
  });
  const parsed = parseJsonObject<{ question: string }>(raw);
  return parsed.question;
}

async function gradeAnswer(
  kit: KitItem,
  topic: string,
  question: string,
  answer: string,
): Promise<{ grade: 'correct' | 'partial' | 'incorrect'; explanation: string }> {
  const raw = await invokeAI({
    modelId: QUIZ_MODEL_ID,
    system:
      'You are a study tutor grading a free-text answer. Grade as "correct", "partial", or ' +
      '"incorrect" and give a 1-2 sentence explanation grounded in the notes. Respond with ' +
      'ONLY JSON: {"grade":"correct|partial|incorrect","explanation":"..."}.',
    userText:
      `Notes summary:\n${kit.summary ?? ''}\n\nTopic: ${topic}\nQuestion: ${question}\n` +
      `Student answer: ${answer}`,
    maxTokens: 250,
    temperature: 0.2,
  });
  const parsed = parseJsonObject<{ grade: string; explanation: string }>(raw);
  const grade =
    parsed.grade === 'correct' || parsed.grade === 'partial' ? parsed.grade : 'incorrect';
  return { grade, explanation: parsed.explanation ?? '' };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const uploadId = event.pathParameters?.uploadId;
  if (!uploadId) return badRequest('uploadId is required');

  let body: { action?: string; sessionId?: string; answer?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }
  const action = body.action;

  try {
    const kit = await getKit(userId, uploadId);
    if (!kit) return notFound('Kit not found');
    if (kit.status !== 'READY') return badRequest('Kit is not ready yet');
    const topics = kit.topics ?? [];
    if (topics.length === 0) return badRequest('Kit has no topics');

    if (action === 'start') {
      const sessionId = ulid();
      const mastery = await getMasteryMap(userId, uploadId);
      const topic = weakestTopic(topics, mastery);
      const question = await askQuestion(kit, topic, []);
      const now = new Date().toISOString();
      const firstTurn: Turn = { role: 'agent', text: question, topic };
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `USER#${userId}`,
            SK: sessionSK(uploadId, sessionId),
            sessionId,
            uploadId,
            currentTopic: topic,
            currentQuestion: question,
            history: [firstTurn],
            createdAt: now,
          },
        }),
      );
      log.info('quizMe start', { requestId, userId, uploadId, sessionId, topic });
      return ok({ sessionId, question: { text: question, topic }, progress: mastery });
    }

    if (action === 'answer') {
      const { sessionId, answer } = body;
      if (!sessionId || !answer) return badRequest('sessionId and answer are required');
      const sres = await ddb.send(
        new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: sessionSK(uploadId, sessionId) },
        }),
      );
      if (!sres.Item) return notFound('Session not found');
      const session = sres.Item as {
        currentTopic: string;
        currentQuestion: string;
        history: Turn[];
      };

      // Grade the answer against the current question/topic.
      const { grade, explanation } = await gradeAnswer(
        kit,
        session.currentTopic,
        session.currentQuestion,
        answer,
      );
      const progress = await updateMastery(userId, uploadId, session.currentTopic, grade);

      // Choose the next topic (weakest) and ask a new question.
      const nextTopic = weakestTopic(topics, progress);
      const historyWithAnswer: Turn[] = [
        ...session.history,
        { role: 'student', text: answer, topic: session.currentTopic, grade },
      ];
      const nextQuestion = await askQuestion(kit, nextTopic, historyWithAnswer);
      const newHistory: Turn[] = [
        ...historyWithAnswer,
        { role: 'agent', text: nextQuestion, topic: nextTopic },
      ];

      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: sessionSK(uploadId, sessionId) },
          UpdateExpression:
            'SET currentTopic = :t, currentQuestion = :q, history = :h, updatedAt = :now',
          ExpressionAttributeValues: {
            ':t': nextTopic,
            ':q': nextQuestion,
            ':h': newHistory,
            ':now': new Date().toISOString(),
          },
        }),
      );

      log.info('quizMe answer', {
        requestId,
        userId,
        uploadId,
        sessionId,
        topic: session.currentTopic,
        grade,
      });
      return ok({
        grade,
        explanation,
        nextQuestion: { text: nextQuestion, topic: nextTopic },
        progress,
      });
    }

    if (action === 'end') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId is required');
      const progress = await getMasteryMap(userId, uploadId);
      const mastery: Record<string, number> = {};
      for (const [t, m] of Object.entries(progress)) mastery[t] = m.score;
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: sessionSK(uploadId, sessionId) },
          UpdateExpression: 'SET endedAt = :now',
          ExpressionAttributeValues: { ':now': new Date().toISOString() },
        }),
      );
      const strong = Object.entries(mastery)
        .filter(([, s]) => s >= 0.7)
        .map(([t]) => t);
      const weak = Object.entries(mastery)
        .filter(([, s]) => s < 0.5)
        .map(([t]) => t);
      const summary =
        `Session complete. Strong topics: ${strong.join(', ') || 'none yet'}. ` +
        `Focus next on: ${weak.join(', ') || 'keep practicing'}.`;
      log.info('quizMe end', { requestId, userId, uploadId, sessionId });
      return ok({ summary, mastery });
    }

    return badRequest('Unknown action. Use start | answer | end.');
  } catch (err) {
    log.error('quizMe failed', {
      requestId,
      userId,
      uploadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
