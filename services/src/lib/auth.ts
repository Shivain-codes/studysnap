import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Extract the authenticated user's Cognito `sub` from the API Gateway event.
 * With a Cognito User Pools authorizer, claims are in requestContext.authorizer.claims.
 * userId is ALWAYS derived server-side here — never trusted from the client body.
 */
export function getUserId(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext?.authorizer?.claims as
    | Record<string, string>
    | undefined;
  return claims?.sub ?? null;
}
