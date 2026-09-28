import { useCallback, useEffect, useState } from 'react';
import { apiPath, config } from './config';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; model: string; time: string }
  | { kind: 'error'; message: string };

/**
 * Day-1 app shell: verifies the frontend can reach the backend /health endpoint
 * over public HTTPS. Auth, upload, dashboard, and Quiz-Me are layered on in later tasks.
 */
export default function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  const checkHealth = useCallback(async () => {
    setHealth({ kind: 'loading' });
    try {
      const res = await fetch(apiPath('health'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { status: string; model?: string; time?: string };
      if (data.status !== 'ok') throw new Error(`unexpected status: ${data.status}`);
      setHealth({ kind: 'ok', model: data.model ?? 'unknown', time: data.time ?? '' });
    } catch (err) {
      setHealth({ kind: 'error', message: err instanceof Error ? err.message : 'unknown error' });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <div className="app-shell">
      <main className="card">
        <h1 className="brand">StudySnap</h1>
        <p className="tagline">
          Turn any lecture notes into summaries, flashcards, and quizzes in seconds.
        </p>

        {health.kind === 'loading' && (
          <span className="status-row loading">
            <span className="dot" /> Checking backend…
          </span>
        )}

        {health.kind === 'ok' && (
          <>
            <span className="status-row ok">
              <span className="dot" /> Backend connected
            </span>
            <div className="meta">
              model: {health.model}
              <br />
              {config.apiUrl}
            </div>
          </>
        )}

        {health.kind === 'error' && (
          <>
            <span className="status-row error">
              <span className="dot" /> Backend unreachable
            </span>
            <div className="meta">{health.message}</div>
            <button className="btn" onClick={() => void checkHealth()}>
              Retry
            </button>
          </>
        )}
      </main>
    </div>
  );
}
