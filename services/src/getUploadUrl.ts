import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { getUserId } from './lib/auth';
import { ok, badRequest, unauthorized, serverError, json } from './lib/http';
import { log } from './lib/logger';
import {
  MAX_FILE_BYTES,
  isAllowedContentType,
  safeFileName,
} from './lib/validation';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;
const BUCKET = process.env.UPLOADS_BUCKET as string;
const URL_TTL_SECONDS = 300;

interface UploadRequest {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
}

/**
 * POST /uploads — validate the requested file, mint an uploadId, create a
 * PROCESSING record, and return a pre-signed S3 PUT URL. The browser PUTs the
 * file directly to S3, which triggers processNotes (T8) asynchronously.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const userId = getUserId(event);
  if (!userId) return unauthorized();

  let body: UploadRequest;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }

  const { fileName, contentType, fileSize } = body;
  if (!fileName || !contentType || typeof fileSize !== 'number') {
    return badRequest('fileName, contentType, and fileSize are required');
  }
  if (!isAllowedContentType(contentType)) {
    return badRequest('Unsupported file type. Allowed: PDF, PNG, JPEG');
  }
  if (fileSize <= 0) return badRequest('fileSize must be positive');
  if (fileSize > MAX_FILE_BYTES) {
    return json(413, { error: 'File too large (max 10 MB)' });
  }

  const uploadId = ulid();
  const cleanName = safeFileName(fileName);
  const s3Key = `uploads/${userId}/${uploadId}/${cleanName}`;
  const now = new Date().toISOString();

  try {
    // Create the PROCESSING record first so the dashboard can show it immediately.
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${userId}`,
          SK: `UPLOAD#${uploadId}`,
          uploadId,
          userId,
          fileName: cleanName,
          s3Key,
          contentType,
          status: 'PROCESSING',
          createdAt: now,
          updatedAt: now,
        },
      }),
    );

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: contentType }),
      { expiresIn: URL_TTL_SECONDS },
    );

    log.info('getUploadUrl ok', { requestId, userId, uploadId, route: 'POST /uploads' });
    return ok({ uploadId, uploadUrl, s3Key, expiresIn: URL_TTL_SECONDS });
  } catch (err) {
    log.error('getUploadUrl failed', {
      requestId,
      userId,
      uploadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
