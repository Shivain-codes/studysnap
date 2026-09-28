import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserId } from './lib/auth';
import { ok, unauthorized, serverError } from './lib/http';
import { log } from './lib/logger';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

interface UploadItem {
  uploadId: string;
  fileName: string;
  status: string;
  createdAt: string;
}

/**
 * GET /uploads — list the authenticated user's uploads (metadata only).
 * Auth-gated by the Cognito authorizer; userId comes from the JWT `sub`.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const userId = getUserId(event);
  if (!userId) {
    log.warn('unauthenticated listUploads', { requestId, route: 'GET /uploads' });
    return unauthorized();
  }

  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'UPLOAD#' },
        ProjectionExpression: 'uploadId, fileName, #s, createdAt',
        ExpressionAttributeNames: { '#s': 'status' },
        ScanIndexForward: false,
      }),
    );

    const items = (res.Items ?? []) as UploadItem[];
    log.info('listUploads ok', { requestId, userId, route: 'GET /uploads', count: items.length });
    return ok({ items });
  } catch (err) {
    log.error('listUploads failed', {
      requestId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError();
  }
}
