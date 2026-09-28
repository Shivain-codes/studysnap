import type { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { generateKit } from './lib/kit';
import { log } from './lib/logger';
import type { ClaudeImage } from './lib/aiClient';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

/** s3Key = uploads/<userId>/<uploadId>/<fileName> */
function parseKey(key: string): { userId: string; uploadId: string } | null {
  const parts = decodeURIComponent(key.replace(/\+/g, ' ')).split('/');
  if (parts.length < 4 || parts[0] !== 'uploads') return null;
  return { userId: parts[1], uploadId: parts[2] };
}

async function readObject(bucket: string, key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return { bytes, contentType: res.ContentType ?? 'application/octet-stream' };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // unpdf is serverless-friendly and ships its own pdf.js build.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

async function setStatus(
  userId: string,
  uploadId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = { '#s': 'status', '#u': 'updatedAt' };
  const values: Record<string, unknown> = { ':u': new Date().toISOString() };
  const sets = ['#s = :s', '#u = :u'];
  values[':s'] = fields.status;
  let i = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'status') continue;
    const nk = `#f${i}`;
    const vk = `:f${i}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `UPLOAD#${uploadId}` },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/**
 * S3 ObjectCreated trigger. Extracts note content, generates a study kit with
 * Claude, and writes it back to the upload's DynamoDB record (READY or FAILED).
 */
export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = record.s3.object.key;
    const parsed = parseKey(key);
    if (!parsed) {
      log.warn('processNotes: unrecognized key', { route: 'S3', s3Key: key });
      continue;
    }
    const { userId, uploadId } = parsed;

    try {
      const { bytes, contentType } = await readObject(bucket, key);
      log.info('processNotes start', { userId, uploadId, contentType, bytes: bytes.length });

      let kit;
      if (contentType === 'application/pdf') {
        const text = await extractPdfText(bytes);
        if (!text || text.trim().length < 20) {
          throw new Error('Could not extract readable text from the PDF');
        }
        kit = await generateKit({ notesText: text });
      } else if (contentType === 'image/jpeg' || contentType === 'image/png') {
        const image: ClaudeImage = {
          mediaType: contentType,
          dataBase64: Buffer.from(bytes).toString('base64'),
        };
        kit = await generateKit({ image });
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      await setStatus(userId, uploadId, {
        status: 'READY',
        summary: kit.summary,
        topics: kit.topics,
        flashcards: kit.flashcards,
        quiz: kit.quiz,
      });
      log.info('processNotes READY', { userId, uploadId, topics: kit.topics.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('processNotes FAILED', { userId, uploadId, error: message });
      try {
        await setStatus(userId, uploadId, { status: 'FAILED', error: message });
      } catch (e2) {
        log.error('processNotes: failed to write FAILED status', {
          userId,
          uploadId,
          error: e2 instanceof Error ? e2.message : String(e2),
        });
      }
    }
  }
}
