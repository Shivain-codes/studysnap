import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { log } from './lib/logger';

/**
 * GET /health — public, unauthenticated liveness check.
 * Confirms the API Gateway -> Lambda path works end to end (Day-1 ship gate).
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  log.info('health check', { requestId, route: 'GET /health' });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      status: 'ok',
      service: 'studysnap',
      model: process.env.AI_MODEL_ID ?? 'unset',
      time: new Date().toISOString(),
    }),
  };
}
