import React, { useEffect, useRef, useState } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import {
  practiceApi,
  type OlympiadAttemptData,
  type SaveAnswerFeedback,
  type PracticeResult,
} from '../../hooks/usePracticeQuiz';

interface Props { navigate: NavigateFn; }

/**
 * Practice Olympiad — starts a mixed quiz across the student's selected
 * subjects (backend-generated, class + board scoped) and plays it. No subject
 * is chosen here; the backend reads the profile.
 */
export const OlympiadPlayPage: React.FC<Props> = ({ navigate }) => {
  const [session, setSession] = useState<OlympiadAttemptData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [idx, setIdx]           = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked]     = useState(false);
  const [feedback, setFeedback] = useState<SaveAnswerFeedback | null>(null);
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState<PracticeResult | null>(null);
  const startMs = useRef(Date.now());

  useEffect(() => {
    practiceApi.startOlympiad()
      .then(data => {
        if (!data.questions?.length) setError('__empty__');
        else { setSession(data); startMs.current = Date.now(); }
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = e?.message ?? '';
        setError(/no question|not available|add your subjects/i.test(msg) ? (msg || '__empty__') : (msg || 'Could not start the Olympiad.'));
        setLoading(false);
      });
  }, []);

  if (loading) return <Centered><div style={{ fontSize: 14, color: 'var(--fg-3)' }}>Building your Olympiad…</div></Centered>;

  if (error) {
    const empty = error === '__empty__';
    return (
      <Centered>
        <Icon name="trophy" size={34} style={{ opacity: 0.35, marginBottom: 14 } as React.CSSProperties} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{empty ? 'No Olympiad questions yet' : 'Could not start'}</h2>
        <p style={{ color: 'var(--fg-3)', fontSize: 14, maxWidth: 380, margin: '0 auto 20px' }}>
          {empty
            ? 'There are no questions for your class and board in your selected subjects yet. Make sure your profile has subjects selected, then ask a teacher to add questions.'
            : error}
        </p>
        <button className="btn btn-ghost" onClick={() => navigate('play')}>Back to categories</button>
      </Centered>
    );
  }

  // ── Result summary ────────────────────────────────────────────
  if (result) {
    return (
      <Centered>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <Icon name="trophy" size={40} style={{ color: 'var(--brand)', marginBottom: 12 } as React.CSSProperties} />
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Olympiad complete</h2>
          <p style={{ color: 'var(--fg-3)', fontSize: 14, marginBottom: 20 }}>
            Score <strong style={{ color: 'var(--fg-1)' }}>{result.score}/{result.totalMarks}</strong> · {Math.round(result.percent)}%
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
            <Stat label="Correct" value={result.correctAnswers} />
            <Stat label="Wrong"   value={result.wrongAnswers} />
            <Stat label="Skipped" value={result.skipped} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost"   onClick={() => navigate('olympiad/history')}>View history</button>
            <button className="btn btn-primary" onClick={() => navigate('play')}>Back to categories</button>
          </div>
        </div>
      </Centered>
    );
  }

  const questions = session!.questions;
  const cur = questions[idx];
  const options = cur.options?.length
    ? cur.options
    : cur.type === 'TRUE_FALSE'
      ? [{ letter: 'A', text: 'True' }, { letter: 'B', text: 'False' }]
      : [];
  const correctLetter = feedback?.feedback?.correctAnswer ?? null;

  const submitAnswer = async (skip = false) => {
    if (locked || busy) return;
    setBusy(true);
    try {
      const fb = await practiceApi.saveAnswer(session!.attemptId, {
        questionId: cur.id,
        selectedOption: skip ? undefined : (selected ?? undefined),
        isSkipped: skip || !selected,
      });
      setFeedback(fb);
      setLocked(true);
    } catch (e: any) {
      showToast(e?.message ?? 'Could not save answer', 'danger');
    } finally { setBusy(false); }
  };

  const next = async () => {
    if (idx + 1 < questions.length) {
      setIdx(i => i + 1); setSelected(null); setLocked(false); setFeedback(null);
      return;
    }
    setBusy(true);
    try {
      const timeTakenSec = Math.floor((Date.now() - startMs.current) / 1000);
      setResult(await practiceApi.submit(session!.attemptId, timeTakenSec));
    } catch (e: any) {
      showToast(e?.message ?? 'Could not submit', 'danger');
      setBusy(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="quiz-head">
        <div className="container">
          <div className="quiz-head-row">
            <button className="btn btn-ghost sm" onClick={() => { if (confirm('Leave this Olympiad?')) navigate('play'); }}>
              <Icon name="arrowLeft" size={14} /> Quit
            </button>
            <span className="q-pill"><span className="dot" /> Practice Olympiad</span>
            <span className="q-counter">Question <strong>{idx + 1}</strong> / {questions.length}</span>
            <div className="q-bar-wrap" style={{ minWidth: 120 }}>
              <div className="q-bar" style={{ width: `${((idx + (locked ? 1 : 0)) / questions.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="quiz-body container">
        <div className="quiz-grid" data-layout="split" key={idx}>
          <div className="q-box">
            <div className="q-tag">
              <span>Mixed · all your subjects</span>
              <span className="q-num">{String(idx + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}</span>
            </div>
            <div className="q-text">{cur.prompt}</div>
            {locked && feedback?.feedback?.explanation && (
              <div className="q-hint" style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 10, borderLeft: '2px solid var(--brand)' }}>
                <strong style={{ color: 'var(--brand)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Explanation</strong>
                <span style={{ color: 'var(--fg-1)', fontSize: 14, lineHeight: 1.55 }}>{feedback.feedback.explanation}</span>
              </div>
            )}
          </div>

          <div className="q-options" data-opt-style="card">
            {options.map(opt => {
              const isCorrect  = locked && opt.letter === correctLetter;
              const isSelected = opt.letter === selected;
              let cls = 'q-option';
              if (locked) { if (isCorrect) cls += ' correct'; else if (isSelected) cls += ' wrong'; }
              else if (isSelected) cls += ' selected';
              return (
                <button key={opt.letter} className={cls} disabled={locked || busy} onClick={() => setSelected(opt.letter)}>
                  <span className="o-key">{opt.letter}</span>
                  <span className="o-text">{opt.text}</span>
                  {locked && (isCorrect || isSelected) && (
                    <span className="o-mark"><Icon name={isCorrect ? 'check' : 'x'} size={16} strokeWidth={2.5} /></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="quiz-actions">
          <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {locked ? (feedback?.isCorrect ? 'Correct' : (!selected ? 'Skipped' : 'Wrong')) : 'Select an answer'}
          </span>
          <div className="spacer" />
          {!locked && <button className="btn btn-ghost"   disabled={busy} onClick={() => submitAnswer(true)}>Skip</button>}
          {!locked && <button className="btn btn-primary" disabled={selected == null || busy} onClick={() => submitAnswer(false)}>{busy ? 'Saving…' : 'Submit'}</button>}
          {locked  && <button className="btn btn-primary" disabled={busy} onClick={next}>
            {busy ? 'Submitting…' : idx + 1 < questions.length ? <>Next <Icon name="arrowRight" size={14} /></> : <>Finish <Icon name="check" size={14} strokeWidth={2.5} /></>}
          </button>}
        </div>
      </div>
    </div>
  );
};

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="container" style={{ padding: 80, textAlign: 'center', display: 'grid', placeItems: 'center', minHeight: '50vh' }}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg-1)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}
