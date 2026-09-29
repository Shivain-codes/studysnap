import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import type { UploadSummary } from '../types';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; items: UploadSummary[] }
  | { kind: 'error'; message: string };

function StatusPill({ status }: { status: UploadSummary['status'] }) {
  const cls =
    status === 'READY' ? 'ok' : status === 'FAILED' ? 'error' : 'loading';
  const label =
    status === 'READY' ? 'Ready' : status === 'FAILED' ? 'Failed' : 'Processing';
  return (
    <span className={`pill ${cls}`}>
      <span className="dot" /> {label}
    </span>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await apiFetch<{ items: UploadSummary[] }>('uploads');
      setState({ kind: 'loaded', items: res.items });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load' });
    }
  }, []);

  const remove = useCallback(
    async (uploadId: string) => {
      if (!confirm('Delete this upload and its study kit?')) return;
      try {
        await apiFetch(`uploads/${uploadId}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Your study kits</h2>
        <Link to="/upload" className="btn">
          ＋ Upload notes
        </Link>
      </div>
      <p className="tagline">
        Upload lecture notes to generate summaries, flashcards, and adaptive quizzes.
      </p>

      {state.kind === 'loading' && (
        <div className="empty-card">
          <span className="status-row loading">
            <span className="dot" /> Loading your kits…
          </span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="empty-card">
          <span className="status-row error">
            <span className="dot" /> {state.message}
          </span>
          <button className="btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {state.kind === 'loaded' && state.items.length === 0 && (
        <div className="empty-card">
          <p>No uploads yet.</p>
          <p className="hint">Tap “Upload notes” to create your first study kit.</p>
        </div>
      )}

      {state.kind === 'loaded' && state.items.length > 0 && (
        <ul className="kit-list">
          {state.items.map((it) => (
            <li key={it.uploadId} className="kit-li">
              <Link to={`/kits/${it.uploadId}`} className="kit-row">
                <div className="kit-row-main">
                  <span className="kit-name">{it.fileName}</span>
                  <span className="kit-date">{new Date(it.createdAt).toLocaleString()}</span>
                </div>
                <StatusPill status={it.status} />
              </Link>
              <button
                className="kit-delete"
                aria-label={`Delete ${it.fileName}`}
                onClick={() => void remove(it.uploadId)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
