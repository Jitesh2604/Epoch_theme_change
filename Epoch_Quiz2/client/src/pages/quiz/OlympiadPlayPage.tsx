import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateFn } from '../../types';
import { ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import {
  practiceApi,
  type OlympiadAttemptData,
  type SaveAnswerFeedback,
  type PracticeResult,
} from '../../hooks/usePracticeQuiz';
import { useQuizExitGuard } from '../../hooks/useQuizExitGuard';
import { useExamMode } from '../../hooks/useExamMode';
import { Card, Button, Badge } from '../../dashboards/shared/ui';
import { ExamHeader, ExamProgressBar, QuestionPalette, SubmitTestDialog, LeaveExamDialog } from './shared/ExamUI';

interface Props {
  navigate: NavigateFn;
  /** Present only when resuming a specific paused attempt (from "Resume
   *  Paused Quizzes") — loads that exact attempt via getAttempt and skips
   *  straight to the playing phase, instead of starting a brand-new mixed
   *  quiz via startOlympiad. */
  resumeAttemptId?: string;
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function performanceMessage(pct: number): string {
  if (pct >= 90) return "Outstanding! You've mastered this material.";
  if (pct >= 75) return 'Great work — a strong performance.';
  if (pct >= 60) return 'Good effort — review what you missed to improve further.';
  if (pct >= 40) return 'Keep going — a bit more practice will help.';
  return 'Keep practising — review the topics you missed and try again.';
}

/**
 * Practice Olympiad — starts a mixed quiz across the student's selected
 * subjects (backend-generated, class + board scoped) and plays it. No subject
 * is chosen here; the backend reads the profile.
 *
 * The attempt is created as soon as it loads (unchanged from before), but the
 * student sees an overview screen first and only moves into question 1 once
 * they click "Start Test" — no extra network call, just a later reveal.
 */
export const OlympiadPlayPage: React.FC<Props> = ({ navigate, resumeAttemptId }) => {
  const [session, setSession] = useState<OlympiadAttemptData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Resuming a specific paused attempt skips the instructions/preview screen
  // entirely — the student has already seen it, and clicked Resume, not
  // Attempt Olympiad, so land them straight back on their question.
  const [phase, setPhase]     = useState<'preview' | 'playing'>(resumeAttemptId ? 'playing' : 'preview');

  // Chrome (navbar) hides only once the student is actually answering
  // questions — not on the pre-test instructions screen — and restores
  // automatically the moment `phase` leaves 'playing' (result) or on unmount
  // (Quit).
  useExamMode(phase === 'playing');

  const [idx, setIdx]           = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked]     = useState(false);
  const [feedback, setFeedback] = useState<SaveAnswerFeedback | null>(null);
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState<PracticeResult | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const startMs = useRef(Date.now());
  // Guard against duplicate starts (StrictMode double-invoke / remounts).
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Resuming always loads that exact attempt via getAttempt — never
    // startOlympiad, which always creates a brand-new mixed quiz. Attempt
    // Olympiad and Resume are deliberately separate actions.
    const load = resumeAttemptId
      ? practiceApi.getAttempt(resumeAttemptId).then(data => ({ ...data, mode: 'OLYMPIAD' as const, perSubject: 0, distribution: [] }))
      : practiceApi.startOlympiad();

    load
      .then(data => {
        if (!data.questions?.length) { setError('__empty__'); setLoading(false); return; }
        setSession(data);
        startMs.current = Date.now();

        // Resuming: jump straight to the saved question, and if it was
        // already submitted (paused while looking at its feedback) restore
        // the locked/graded view; if it only had a draft selection, restore
        // that as still-editable.
        const resumeIdx = data.currentQuestionIndex ?? 0;
        const currentQ  = data.questions[resumeIdx];
        const saved     = currentQ ? data.savedAnswers?.find(s => s.questionId === currentQ.id) : undefined;
        if (saved?.isSubmitted && saved.feedback) {
          setIdx(resumeIdx);
          setSelected(saved.selectedOption ?? null);
          setLocked(true);
          setFeedback({ ok: true, isCorrect: saved.isCorrect, marksAwarded: saved.marksAwarded, feedback: saved.feedback });
        } else if (saved?.draftSelectedOption) {
          setIdx(resumeIdx);
          setSelected(saved.draftSelectedOption);
        } else if (resumeIdx > 0) {
          setIdx(resumeIdx);
        }
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = e?.message ?? '';
        setError(/no question|not available|add your subjects/i.test(msg) ? (msg || '__empty__') : (msg || 'Could not start the Olympiad.'));
        setLoading(false);
      });
  }, [resumeAttemptId]);

  // ── Debounced progress autosave — persists the current question index and
  //     an in-progress (not-yet-locked) draft selection, so a raw refresh
  //     still resumes at the right spot with nothing lost.
  useEffect(() => {
    if (!session?.attemptId || locked) return;
    const curQ = session.questions[idx];
    if (!curQ) return;
    const t = setTimeout(() => {
      practiceApi.saveProgress(session.attemptId, {
        currentQuestionIndex: idx,
        ...(selected && { draft: { questionId: curQ.id, selectedOption: selected } }),
      }).catch(() => {/* non-fatal */});
    }, 500);
    return () => clearTimeout(t);
  }, [idx, selected, locked, session]);

  // ── Pause: persist the current draft + question index, then leave. Also
  //     the save routine the exit guard runs on browser Back / refresh
  //     warning / in-app nav clicks / the Quit button.
  const handlePause = useCallback(async () => {
    if (session?.attemptId) {
      const curQ = session.questions[idx];
      await practiceApi.saveProgress(session.attemptId, {
        currentQuestionIndex: idx,
        paused: true,
        ...(!locked && selected && curQ && { draft: { questionId: curQ.id, selectedOption: selected } }),
      }).catch(() => {/* non-fatal */});
    }
    navigate('play');
  }, [session, idx, selected, locked, navigate]);

  const { confirmOpen: leaveConfirmOpen, requestLeave, stay, confirmLeaveNow } = useQuizExitGuard({
    active: phase === 'playing' && !result,
    onConfirmLeave: handlePause,
  });

  if (loading) return <Centered><div style={{ fontSize: 14, color: 'var(--fg-3)' }}>{resumeAttemptId ? 'Loading your paused Olympiad…' : 'Building your Olympiad…'}</div></Centered>;

  if (error) {
    const empty = error === '__empty__';
    return (
      <Centered>
        <Icon name="trophy" size={34} style={{ opacity: 0.35, marginBottom: 14 } as React.CSSProperties} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{empty ? 'No Olympiad questions yet' : 'Could not start'}</h2>
        <p style={{ color: 'var(--fg-3)', fontSize: 14, maxWidth: 380, margin: '0 auto 20px' }}>
          {empty
            ? 'There are no questions for your class and board in your selected subjects yet. Make sure your profile has subjects selected, then ask your admin to add questions.'
            : error}
        </p>
        <button className="btn btn-ghost" onClick={() => navigate('play')}>Back to categories</button>
      </Centered>
    );
  }

  // ── Result summary ────────────────────────────────────────────
  if (result) {
    const correct = result.correctAnswers;
    const wrong = result.wrongAnswers;
    const skipped = result.skipped;
    const attempted = correct + wrong;
    const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const pct = Math.round(result.percent);

    return (
      <Centered>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <Icon name="trophy" size={40} style={{ color: 'var(--brand)', marginBottom: 12 } as React.CSSProperties} />
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Practice Olympiad — Complete</h2>
            <p style={{ color: 'var(--fg-3)', fontSize: 14 }}>
              Score <strong style={{ color: 'var(--fg-1)' }}>{result.score}/{result.totalMarks}</strong> · {pct}%
            </p>
            <p style={{ color: 'var(--fg-2)', fontSize: 13.5, marginTop: 8 }}>{performanceMessage(pct)}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
            <Stat label="Correct" value={correct} />
            <Stat label="Wrong"   value={wrong} />
            <Stat label="Skipped" value={skipped} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            <Stat label="Attempted" value={attempted} />
            <Stat label="Accuracy" value={`${accuracyPct}%`} />
            <Stat label="Time taken" value={fmtTime(result.timeTakenSec)} />
          </div>

          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fg-3)', marginBottom: 8 }}>
              <span>Total questions</span>
              <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{session?.questionCount ?? attempted + skipped}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fg-3)', marginBottom: submittedAt ? 8 : 0 }}>
              <span>Duration</span>
              <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>No Time Limit – Self-Paced</span>
            </div>
            {submittedAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fg-3)' }}>
                <span>Submitted</span>
                <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{submittedAt.toLocaleString()}</span>
              </div>
            )}
          </div>

          {!!session?.distribution?.length && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Subjects covered
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {session.distribution.map(d => (
                  <span key={d.subjectId} style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999,
                    background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--fg-2)',
                  }}>
                    {d.subject} · {d.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost"   onClick={() => { window.location.href = '/results'; }}>View history</button>
            <button className="btn btn-primary" onClick={() => navigate('play')}>Back to categories</button>
          </div>
        </div>
      </Centered>
    );
  }

  // ── Pre-test overview ─────────────────────────────────────────
  if (phase === 'preview' && session) {
    return (
      <Centered>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <Icon name="trophy" size={40} style={{ color: 'var(--brand)', marginBottom: 12 } as React.CSSProperties} />
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Practice Olympiad</h2>
          <p style={{ color: 'var(--fg-3)', fontSize: 13.5, marginBottom: 20 }}>
            A mixed quiz drawn from all your selected subjects, scoped to your class and board.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 18 }}>
            <Stat label="Questions" value={session.questionCount} />
            <Stat label="Total marks" value={session.totalMarks} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 600, color: 'var(--brand)',
            background: 'var(--surface-1)', border: '1px solid var(--border-1)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 20,
          }}>
            <Icon name="clock" size={15} />
            No Time Limit – Self-Paced
          </div>

          {!!session.distribution?.length && (
            <div style={{ textAlign: 'left', marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Subjects in this quiz
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {session.distribution.map(d => (
                  <span key={d.subjectId} style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999,
                    background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--fg-2)',
                  }}>
                    {d.subject} · {d.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Instructions
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.7 }}>
              <li>Read each question carefully before answering.</li>
              <li>Questions must be answered in order — you can't skip ahead.</li>
              <li>Take your time — there's no clock running.</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => navigate('play')}>Back to categories</button>
            <button className="btn btn-primary" onClick={() => setPhase('playing')}>Start Test</button>
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
      const finalResult = await practiceApi.submit(session!.attemptId, timeTakenSec);
      setSubmittedAt(new Date());
      setResult(finalResult);
    } catch (e: any) {
      showToast(e?.message ?? 'Could not submit', 'danger');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="max-w-3xl mx-auto">
        <ExamHeader
          title="Practice Olympiad"
          subject="Mixed · all your subjects"
          index={idx}
          total={questions.length}
          timeDisplay="No Time Limit – Self-Paced"
          onExit={requestLeave}
        />

        <ExamProgressBar answered={idx + (locked ? 1 : 0)} total={questions.length} />

        <QuestionPalette
          total={questions.length}
          currentIndex={idx}
          answered={questions.map((_, i) => i < idx || (i === idx && locked))}
          highestReached={idx}
        />

        <Card className="p-6 mb-4" key={idx}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3">
              Question {idx + 1}
            </span>
            <Badge tone="neutral" dot={false} className="text-[10px]">Mixed</Badge>
          </div>

          <p className="text-[15px] text-fg1 leading-relaxed mb-5 font-medium">{cur.prompt}</p>

          <div className="space-y-2">
            {options.map(opt => {
              const isCorrect  = locked && opt.letter === correctLetter;
              const isSelected = opt.letter === selected;
              let cls = 'border-line bg-surface1 text-fg1 hover:border-brand/40 hover:bg-brand-soft/20';
              if (locked) {
                cls = isCorrect
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : isSelected
                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                    : 'border-line bg-surface1/50 text-fg3 opacity-60';
              } else if (isSelected) {
                cls = 'border-brand/60 bg-brand-soft text-brand';
              }
              return (
                <button
                  key={opt.letter}
                  onClick={() => !locked && !busy && setSelected(opt.letter)}
                  disabled={locked || busy}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition active:scale-[0.99] disabled:cursor-default ${cls}`}
                >
                  <span className={`w-7 h-7 rounded-lg grid place-items-center text-[12px] font-display font-semibold shrink-0 border ${
                    isSelected && !locked ? 'bg-brand text-brand-ink border-transparent' : 'bg-surface2 border-line text-fg3'
                  }`}>
                    {opt.letter}
                  </span>
                  <span className="text-[13.5px] flex-1">{opt.text}</span>
                  {locked && (isCorrect || isSelected) && (
                    isCorrect
                      ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      : <XCircle size={16} className="text-rose-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {locked && feedback?.feedback?.explanation && (
          <Card className="p-4 mb-4">
            <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-brand mb-2">Explanation</p>
            <p className="text-[13px] text-fg2 leading-relaxed">{feedback.feedback.explanation}</p>
          </Card>
        )}

        <div className="flex gap-3">
          {!locked && (
            <Button className="flex-1" disabled={selected == null || busy} onClick={() => submitAnswer(false)}>
              {busy ? 'Saving…' : 'Submit Answer'}
            </Button>
          )}

          {locked && idx + 1 < questions.length && (
            <Button className="flex-1" icon={ChevronRight} onClick={next} disabled={busy}>
              Next Question
            </Button>
          )}

          {locked && idx + 1 >= questions.length && (
            <Button className="flex-1" onClick={() => setConfirmSubmitOpen(true)} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit Test'}
            </Button>
          )}
        </div>

        {/* ── Exit confirmation overlay — shown on the Exit button, browser
               Back, refresh warning, and in-app nav clicks alike. ───────── */}
        <LeaveExamDialog open={leaveConfirmOpen} onStay={stay} onLeave={confirmLeaveNow} />

        <SubmitTestDialog
          open={confirmSubmitOpen}
          answered={idx + (locked ? 1 : 0)}
          total={questions.length}
          submitting={busy}
          onKeepGoing={() => setConfirmSubmitOpen(false)}
          onSubmit={() => { setConfirmSubmitOpen(false); next(); }}
        />
      </div>
    </div>
  );
};

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="container" style={{ padding: 80, textAlign: 'center', display: 'grid', placeItems: 'center', minHeight: '50vh' }}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '14px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg-1)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}
