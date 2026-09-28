import { invokeClaude, parseJsonObject, type ClaudeImage } from './aiClient';

export interface Flashcard {
  front: string;
  back: string;
}
export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  topic: string;
}
export interface StudyKit {
  summary: string;
  topics: string[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
}

const SYSTEM_PROMPT = `You are StudySnap, an expert study assistant. From the student's
lecture notes you produce a study kit. Respond with ONLY a single JSON object, no prose,
no markdown fences. The JSON must match exactly:
{
  "summary": "concise summary, max 250 words",
  "topics": ["3-6 short topic labels"],
  "flashcards": [ { "front": "question/term", "back": "answer/definition" } ],
  "quiz": [ { "question": "...", "options": ["a","b","c","d"], "answerIndex": 0, "topic": "one of topics" } ]
}
Rules: EXACTLY 10 flashcards. EXACTLY 5 quiz questions. Each quiz has EXACTLY 4 options and
an answerIndex 0-3. Every quiz "topic" must be one of the "topics". If the notes are an image
and parts are illegible, note that in the summary and work with what is readable.`;

const MAX_NOTES_CHARS = 16000; // keep prompt within a safe token budget

/** Validate the generated kit's shape/counts. Throws on any violation. */
export function validateKit(kit: StudyKit): void {
  if (!kit.summary || typeof kit.summary !== 'string') throw new Error('missing summary');
  if (!Array.isArray(kit.topics) || kit.topics.length < 1) throw new Error('missing topics');
  if (!Array.isArray(kit.flashcards) || kit.flashcards.length !== 10)
    throw new Error(`expected 10 flashcards, got ${kit.flashcards?.length}`);
  if (!Array.isArray(kit.quiz) || kit.quiz.length !== 5)
    throw new Error(`expected 5 quiz questions, got ${kit.quiz?.length}`);
  for (const f of kit.flashcards) {
    if (!f.front || !f.back) throw new Error('flashcard missing front/back');
  }
  for (const q of kit.quiz) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4)
      throw new Error('quiz question needs exactly 4 options');
    if (typeof q.answerIndex !== 'number' || q.answerIndex < 0 || q.answerIndex > 3)
      throw new Error('quiz answerIndex out of range');
    if (!q.topic) throw new Error('quiz question missing topic');
  }
}

interface GenerateInput {
  notesText?: string;
  image?: ClaudeImage;
}

/** Generate a study kit from notes text or an image. Retries once on bad output. */
export async function generateKit(input: GenerateInput): Promise<StudyKit> {
  const userText = input.image
    ? 'Here is a photo of my lecture notes. Generate the study kit as specified.'
    : `Here are my lecture notes:\n\n${(input.notesText ?? '').slice(0, MAX_NOTES_CHARS)}`;

  const attempt = async (): Promise<StudyKit> => {
    const raw = await invokeClaude({
      system: SYSTEM_PROMPT,
      userText,
      images: input.image ? [input.image] : undefined,
      maxTokens: 3000,
    });
    const kit = parseJsonObject<StudyKit>(raw);
    validateKit(kit);
    return kit;
  };

  try {
    return await attempt();
  } catch {
    // One retry — models occasionally miscount or wrap output.
    return await attempt();
  }
}
