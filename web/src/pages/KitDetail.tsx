import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import type { UploadDetail } from '../types';
import QuizMe from './QuizMe';

type Tab = 'summary' | 'flashcards' | 'quiz' | 'quizme';

export default function KitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await apiFetch<UploadDetail>(`uploads/${id}`);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while processing.
  useEffect(() => {
    if (detail?.status !== 'PROCESSING') return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [detail?.status, load]);

  return (
    <div className="page">
      <button className="btn-ghost" onClick={() => navigate('/')}>
        ← Back
      </button>

      {error && (
        <div className="empty-card">
          <span className="status-row error">
            <span className="dot" /> {error}
          </span>
          <button className="btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!detail && !error && (
        <div className="empty-card">
          <span className="status-row loading">
            <span className="dot" /> Loading…
          </span>
        </div>
      )}

      {detail && (
        <>
          <h2 className="page-title">{detail.fileName}</h2>

          {detail.status === 'PROCESSING' && (
            <div className="empty-card">
              <span className="status-row loading">
                <span className="dot" /> Generating your study kit…
              </span>
              <p className="hint">This usually takes a few seconds.</p>
            </div>
          )}

          {detail.status === 'FAILED' && (
            <div className="empty-card">
              <span className="status-row error">
                <span className="dot" /> Generation failed
              </span>
              <p className="hint">{detail.error ?? 'Please try uploading again.'}</p>
              <button className="btn" onClick={() => navigate('/upload')}>
                Upload again
              </button>
            </div>
          )}

          {detail.status === 'READY' && (
            <>
              {detail.topics && detail.topics.length > 0 && (
                <div className="chips">
                  {detail.topics.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="tabs">
                <button
                  className={`tab ${tab === 'summary' ? 'active' : ''}`}
                  onClick={() => setTab('summary')}
                >
                  Summary
                </button>
                <button
                  className={`tab ${tab === 'flashcards' ? 'active' : ''}`}
                  onClick={() => setTab('flashcards')}
                >
                  Flashcards
                </button>
                <button
                  className={`tab ${tab === 'quiz' ? 'active' : ''}`}
                  onClick={() => setTab('quiz')}
                >
                  Quiz
                </button>
                <button
                  className={`tab ${tab === 'quizme' ? 'active' : ''}`}
                  onClick={() => setTab('quizme')}
                >
                  Quiz-Me
                </button>
              </div>

              {tab === 'summary' && <SummaryTab summary={detail.summary ?? ''} />}
              {tab === 'flashcards' && <FlashcardsTab cards={detail.flashcards ?? []} />}
              {tab === 'quiz' && <QuizTab quiz={detail.quiz ?? []} />}
              {tab === 'quizme' && id && <QuizMe uploadId={id} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SummaryTab({ summary }: { summary: string }) {
  return <div className="prose-card">{summary}</div>;
}

function FlashcardsTab({ cards }: { cards: UploadDetail['flashcards'] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const list = cards ?? [];
  if (list.length === 0) return <p className="hint">No flashcards.</p>;
  const card = list[i];
  const go = (d: number) => {
    setFlipped(false);
    setI((prev) => (prev + d + list.length) % list.length);
  };
  return (
    <div className="flash-wrap">
      <button
        className={`flashcard ${flipped ? 'flipped' : ''}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label="Flip flashcard"
      >
        <span className="flash-label">{flipped ? 'Answer' : 'Question'}</span>
        <span className="flash-text">{flipped ? card.back : card.front}</span>
        <span className="hint">Tap to flip</span>
      </button>
      <div className="flash-nav">
        <button className="btn-ghost" onClick={() => go(-1)}>
          ‹ Prev
        </button>
        <span className="counter">
          {i + 1} / {list.length}
        </span>
        <button className="btn-ghost" onClick={() => go(1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}

function QuizTab({ quiz }: { quiz: UploadDetail['quiz'] }) {
  const list = quiz ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (list.length === 0) return <p className="hint">No quiz questions.</p>;
  return (
    <div className="quiz-list">
      {list.map((q, qi) => {
        const choice = picked[qi];
        const answered = choice !== undefined;
        return (
          <div key={qi} className="quiz-card">
            <div className="quiz-q">
              {qi + 1}. {q.question}
            </div>
            <div className="quiz-options">
              {q.options.map((opt, oi) => {
                let cls = 'quiz-opt';
                if (answered) {
                  if (oi === q.answerIndex) cls += ' correct';
                  else if (oi === choice) cls += ' wrong';
                }
                return (
                  <button
                    key={oi}
                    className={cls}
                    disabled={answered}
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
