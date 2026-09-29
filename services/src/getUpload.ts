import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserId } from './lib/auth';
import { ok, unauthorized, notFound, badRequest, serverError } from './lib/http';
import { log } from './lib/logger';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

/**
 * GET /uploads/{uploadId} — return one upload + generated kit for the current user.
 * Only fields relevant to the client are returned; ownership enforced via PK.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const uploadId = event.pathParameters?.uploadId;
  if (!uploadId) return badRequest('uploadId is required');

  try {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `UPLOAD#${uploadId}` },
      }),
    );
    if (!res.Item) {
      log.warn('getUpload not found', { requestId, userId, uploadId });
      return notFound('Upload not found');
    }

    const it = res.Item;
    log.info('getUpload ok', { requestId, userId, uploadId, status: it.status });
    return ok({
      uploadId: it.uploadId,
      fileName: it.fileName,
      status: it.status,
      createdAt: it.createdAt,
      summary: it.summary,
      topics: it.topics,
      flashcards: it.flashcards,
      quiz: it.quiz,
      error: it.error,
    });
  } catch (err) {
    log.error('getUpload failed', {
      requestId,
      userId,
      uploadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
