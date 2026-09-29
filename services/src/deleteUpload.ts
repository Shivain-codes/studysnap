import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { getUserId } from './lib/auth';
import { noContent, unauthorized, notFound, badRequest, serverError } from './lib/http';
import { log } from './lib/logger';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;
const BUCKET = process.env.UPLOADS_BUCKET as string;

/**
 * DELETE /uploads/{uploadId} — remove the upload's S3 object and all related
 * DynamoDB items (UPLOAD#, SESSION#<uploadId>#*, MASTERY#<uploadId>#*).
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  const uploadId = event.pathParameters?.uploadId;
  if (!uploadId) return badRequest('uploadId is required');

  const pk = `USER#${userId}`;

  try {
    // Fetch the upload to get its s3Key and confirm ownership.
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: pk, SK: `UPLOAD#${uploadId}` } }),
    );
    if (!res.Item) return notFound('Upload not found');
    const s3Key = res.Item.s3Key as string | undefined;

    // Delete the S3 object (best-effort).
    if (s3Key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
      } catch (e) {
        log.warn('deleteUpload: S3 delete failed', {
          requestId,
          userId,
          uploadId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Collect all related SK items: the upload + its sessions + mastery.
    const sks = new Set<string>([`UPLOAD#${uploadId}`]);
    for (const prefix of [`SESSION#${uploadId}#`, `MASTERY#${uploadId}#`]) {
      const q = await ddb.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': pk, ':sk': prefix },
          ProjectionExpression: 'SK',
        }),
      );
      for (const it of q.Items ?? []) sks.add(it.SK as string);
    }

    // Delete each item (small counts per upload; simple sequential deletes).
    for (const sk of sks) {
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }));
    }

    log.info('deleteUpload ok', {
      requestId,
      userId,
      uploadId,
      route: 'DELETE /uploads/{id}',
      itemsDeleted: sks.size,
    });
    return noContent();
  } catch (err) {
    log.error('deleteUpload failed', {
      requestId,
      userId,
      uploadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
