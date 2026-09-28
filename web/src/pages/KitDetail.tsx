import { useParams, useNavigate } from 'react-router-dom';

/**
 * Kit detail placeholder. Full view (summary, flashcards, quiz, Quiz-Me) and
 * status polling are built in T9/T10. For now it confirms routing after upload.
 */
export default function KitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="page">
      <button className="btn-ghost" onClick={() => navigate('/')}>
        ← Back
      </button>
      <h2 className="page-title">Study kit</h2>
      <div className="empty-card">
        <span className="status-row loading">
          <span className="dot" /> Processing your notes…
        </span>
        <p className="hint">Upload received (id: {id}). Generation + results view arrive next.</p>
      </div>
    </div>
  );
}
