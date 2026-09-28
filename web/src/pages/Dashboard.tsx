import { useCallback, useEffect, useState } from 'react';
import { apiPath, config } from '../config';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; model: string }
  | { kind: 'error'; message: string };

/**
 * Dashboard placeholder (auth-gated). For now it confirms the authenticated
 * shell works and the backend is reachable. Upload list + kits arrive in T7-T9.
 */
export default function Dashboard() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  const checkHealth = useCallback(async () => {
    setHealth({ kind: 'loading' });
    try {
      const res = await fetch(apiPath('health'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { status: string; model?: string };
      if (data.status !== 'ok') throw new Error(`unexpected status: ${data.status}`);
      setHealth({ kind: 'ok', model: data.model ?? 'unknown' });
    } catch (err) {
      setHealth({ kind: 'error', message: err instanceof Error ? err.message : 'unknown error' });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <div className="page">
      <h2 className="page-title">Your study kits</h2>
      <p className="tagline">
        Upload lecture notes to generate summaries, flashcards, and adaptive quizzes.
      </p>

      <div className="empty-card">
        <p>No uploads yet.</p>
        <p className="hint">Upload is coming online next — the backend is ready.</p>

        {health.kind === 'loading' && (
          <span className="status-row loading">
            <span className="dot" /> Checking backend…
          </span>
        )}
        {health.kind === 'ok' && (
          <span className="status-row ok">
            <span className="dot" /> Backend connected · {health.model}
          </span>
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
        <div className="meta">{config.apiUrl}</div>
      </div>
    </div>
  );
}
