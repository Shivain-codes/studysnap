import { useState } from 'react';
import { apiFetch } from '../api';
import type { Progress, QuizMeStart, QuizMeAnswer, QuizMeEnd } from '../types';

interface ChatItem {
  role: 'agent' | 'student';
  text: string;
  grade?: 'correct' | 'partial' | 'incorrect';
  explanation?: string;
}

export default function QuizMe({ uploadId }: { uploadId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<QuizMeEnd | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<QuizMeStart>(`uploads/${uploadId}/quiz-me`, {
        method: 'POST',
        body: { action: 'start' },
      });
      setSessionId(res.sessionId);
      setProgress(res.progress);
      setChat([{ role: 'agent', text: res.question.text }]);
      setEnded(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start session');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!sessionId || !answer.trim()) return;
    const myAnswer = answer.trim();
    setAnswer('');
    setChat((c) => [...c, { role: 'student', text: myAnswer }]);
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<QuizMeAnswer>(`uploads/${uploadId}/quiz-me`, {
        method: 'POST',
        body: { action: 'answer', sessionId, answer: myAnswer },
      });
      setProgress(res.progress);
      setChat((c) => {
        const updated = [...c];
        // attach grade+explanation to the student's last message
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === 'student' && !updated[i].grade) {
            updated[i] = { ...updated[i], grade: res.grade, explanation: res.explanation };
            break;
          }
        }
        updated.push({ role: 'agent', text: res.nextQuestion.text });
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade answer');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await apiFetch<QuizMeEnd>(`uploads/${uploadId}/quiz-me`, {
        method: 'POST',
        body: { action: 'end', sessionId },
      });
      setEnded(res);
      setSessionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end session');
    } finally {
      setBusy(false);
    }
  }

  if (!sessionId && !ended) {
    return (
      <div className="empty-card">
        <p>Adaptive Quiz-Me tutors you, grades your answers, and focuses on your weak topics.</p>
        <button className="btn btn-lg" onClick={() => void start()} disabled={busy}>
          {busy ? 'Starting…' : 'Start Quiz-Me'}
        </button>
        {error && <span className="status-row error"><span className="dot" /> {error}</span>}
      </div>
    );
  }

  return (
    <div className="quizme">
      {Object.keys(progress).length > 0 && (
        <div className="mastery">
          {Object.entries(progress).map(([topic, m]) => (
            <div key={topic} className="mastery-row">
              <span className="mastery-topic">{topic}</span>
              <div className="mastery-bar">
                <div
                  className="mastery-fill"
                  style={{ width: `${Math.round((m.score ?? 0) * 100)}%` }}
                />
              </div>
              <span className="mastery-pct">{Math.round((m.score ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="chat">
        {chat.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.text}</div>
            {m.grade && (
              <div className={`grade ${m.grade}`}>
                {m.grade === 'correct' ? '✓ Correct' : m.grade === 'partial' ? '~ Partial' : '✗ Incorrect'}
                {m.explanation ? ` — ${m.explanation}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <span className="status-row error"><span className="dot" /> {error}</span>}

      {ended ? (
        <div className="empty-card">
          <p className="recap">{ended.summary}</p>
          <button className="btn" onClick={() => void start()} disabled={busy}>
            Start another session
          </button>
        </div>
      ) : (
        <div className="chat-input">
          <input
            type="text"
            value={answer}
            placeholder="Type your answer…"
            disabled={busy}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          <button className="btn" onClick={() => void submit()} disabled={busy || !answer.trim()}>
            {busy ? '…' : 'Send'}
          </button>
          <button className="btn-ghost" onClick={() => void end()} disabled={busy}>
            End
          </button>
        </div>
      )}
    </div>
  );
}
