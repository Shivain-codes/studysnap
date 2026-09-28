import { fetchAuthSession } from 'aws-amplify/auth';
import { apiPath } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Get the current user's Cognito ID token (JWT) for the Authorization header. */
async function getIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new ApiError(401, 'Not authenticated');
  return token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // default true
}

/**
 * Call the StudySnap REST API. Attaches the Cognito JWT unless auth:false.
 * Throws ApiError on non-2xx so callers can render friendly messages.
 */
export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await getIdToken()}`;

  const res = await fetch(apiPath(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && String(data.error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
