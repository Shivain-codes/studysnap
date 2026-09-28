/**
 * Runtime configuration.
 * Values come from Vite env vars (VITE_*) at build time, with the currently
 * deployed StudySnap resources as fallback defaults so the app works out of the box.
 */
export const config = {
  apiUrl:
    import.meta.env.VITE_API_URL ??
    'https://u1g7hquhsf.execute-api.us-east-1.amazonaws.com/prod/',
  region: import.meta.env.VITE_AWS_REGION ?? 'us-east-1',
  userPoolId: import.meta.env.VITE_USER_POOL_ID ?? 'us-east-1_FTWr35GEJ',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? 'au8p7tlunoeet8jrlflb87dhv',
};

/** Join the API base URL with a path, tolerating trailing/leading slashes. */
export function apiPath(path: string): string {
  const base = config.apiUrl.replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  return `${base}/${suffix}`;
}
