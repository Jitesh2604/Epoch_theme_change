import { useState, useEffect, useCallback, useRef } from 'react';
import type { NavigateFn } from '../../types';
import {
  CheckCircle2, XCircle, ChevronRight, BookOpen, Clock, X, SkipForward,
  CornerDownRight, Pause,
} from 'lucide-react';
import { Card, Button, Badge, ProgressBar, useToasts } from '../../dashboards/shared/ui';
import {
  practiceApi,
  type PracticeAttemptData,
  type PracticeQuestion,
  type SaveAnswerFeedback,
} from '../../hooks/usePracticeQuiz';
import { useQuizExitGuard } from '../../hooks/useQuizExitGuard';

interface PracticePlayPageProps {
  navigate:  NavigateFn;
  attemptId: string;
}

// ── Types ─────────────────────────────────────────────────────────

interface AnswerState {
  selectedOption?:  string;
  selectedOptions?: string[];
  textAnswer?:      string;
  isSkipped?:       boolean;
}

interface FeedbackState {
  isCorrect:      boolean | null;
  marksAwarded:   number;
  correctAnswer?:  string | null;
  correctOptions?: string[];
  correctBoolean?: boolean | null;
  explanation?:    string | null;
  options:         { letter: string; text: string }[];
}

// ── Difficulty badge ──────────────────────────────────────────────

const DIFF_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  EASY:   'success',
  MEDIUM: 'warning',
  HARD:   'danger',
};

// ── Elapsed / countdown timers ──────────────────────────────────────

function fmtMMSS(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function useElapsedSec() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return { elapsed, formatted: fmtMMSS(elapsed) };
}

/**
 * Counts down from the backend-assigned `timeLimitSec`, anchored to the
 * attempt's server `startTime` (not local mount time) so a page refresh
 * resumes the correct remaining time instead of restarting the clock.
 * Fires `onExpire` exactly once when it reaches zero.
 */
function useCountdown(startTime: string | undefined, timeLimitSec: number | null | undefined, onExpire: () => void) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expiredRef  = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; });

  useEffect(() => {
    if (!startTime || !timeLimitSec) { setRemaining(null); return; }
    const startMs = new Date(startTime).getTime();
    const tick = () => {
      const rem = timeLimitSec - Math.floor((Date.now() - startMs) / 1000);
      setRemaining(Math.max(0, rem));
      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, timeLimitSec]);

  return remaining;
}

// ── MCQ option button ─────────────────────────────────────────────

function OptionButton({
  option, selected, feedback, submitted, onClick,
}: {
  option:    { letter: string; text: string };
  selected:  boolean;
  feedback:  FeedbackState | null;
  submitted: boolean;
  onClick:   () => void;
}) {
  let cls = 'border-line bg-surface1 text-fg1 hover:border-brand/40 hover:bg-brand-soft/20';

  if (submitted && feedback) {
    const isCorrect = feedback.correctAnswer === option.letter ||
      (feedback.correctOptions ?? []).includes(option.letter);
    if (isCorrect) {
      cls = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300';
    } else if (selected) {
      cls = 'border-rose-500/50 bg-rose-500/10 text-rose-300';
    } else {
      cls = 'border-line bg-surface1/50 text-fg3 opacity-60';
    }
  } else if (selected) {
    cls = 'border-brand/60 bg-brand-soft text-brand';
  }

  return (
    <button
      onClick={onClick}
      disabled={submitted}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition active:scale-[0.99] disabled:cursor-default ${cls}`}
    >
      <span className={`w-7 h-7 rounded-lg grid place-items-center text-[12px] font-display font-semibold shrink-0 border ${
        selected && !submitted ? 'bg-brand text-brand-ink border-transparent' : 'bg-surface2 border-line text-fg3'
      }`}>
        {option.letter}
      </span>
      <span className="text-[13.5px] flex-1">{option.text}</span>
      {submitted && feedback && (
        feedback.correctAnswer === option.letter || (feedback.correctOptions ?? []).includes(option.letter)
          ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          : selected
            ? <XCircle size={16} className="text-rose-400 shrink-0" />
            : null
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export function PracticePlayPage({ navigate, attemptId }: PracticePlayPageProps) {
  const { elapsed, formatted: timer } = useElapsedSec();
  const elapsedRef    = useRef(elapsed);
  const { push, node: toastNode } = useToasts();

  const [attempt,    setAttempt]    = useState<PracticeAttemptData | null>(null);
  const [loadErr,    setLoadErr]    = useState('');
  const [idx,        setIdx]        = useState(0);
  const [answers,    setAnswers]    = useState<Record<string, AnswerState>>({});
  const [feedbacks,  setFeedbacks]  = useState<Record<string, FeedbackState>>({});
  const [submitted,  setSubmitted]  = useState<Record<string, boolean>>({});
  const [saving,     setSaving]     = useState(false);
  const [finishing,  setFinishing]  = useState(false);
  const [textInput,  setTextInput]  = useState('');

  // Keep elapsedRef in sync so submitAnswer callback can read current elapsed time
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // `finish` (defined below) closes over per-render state, so the countdown's
  // expiry callback — set up once — calls through this ref to always reach
  // the current version instead of a stale closure.
  const finishRef     = useRef<() => void>(() => {});
  const finishingRef  = useRef(false);
  const remaining = useCountdown(attempt?.startTime, attempt?.timeLimitSec, () => {
    push({ kind: 'success', title: "Time's up", sub: 'Submitting your quiz automatically.' });
    finishRef.current();
  });

  // Always load the attempt from the API — this route only ever gets an
  // attemptId (no cross-page state to fall back on).
  useEffect(() => {
    if (!attemptId) {
      setLoadErr('No practice attempt found. Please start a new practice quiz.');
      return;
    }
    practiceApi.getAttempt(attemptId).then(data => {
      // A submitted attempt comes back as a result payload (no questions) —
      // route to the result page instead of rendering the play screen.
      if (!data?.questions?.length) {
        navigate(`play/result/${attemptId}`);
        return;
      }
      setAttempt(data);

      // Restore state so a refresh/resume looks exactly like "never left":
      // already-submitted questions come back locked with their feedback,
      // and an in-progress (not-yet-submitted) selection comes back as an
      // editable draft on whichever question it was on.
      const restoredAnswers:   Record<string, AnswerState>   = {};
      const restoredSubmitted: Record<string, boolean>       = {};
      const restoredFeedbacks: Record<string, FeedbackState> = {};
      for (const s of data.savedAnswers ?? []) {
        if (s.isSubmitted) {
          restoredSubmitted[s.questionId] = true;
          restoredAnswers[s.questionId] = {
            selectedOption:  s.selectedOption ?? undefined,
            selectedOptions: s.selectedOptions?.length ? s.selectedOptions : undefined,
            textAnswer:      s.textAnswer ?? undefined,
          };
          if (s.feedback) {
            restoredFeedbacks[s.questionId] = {
              isCorrect:      s.isCorrect,
              marksAwarded:   s.marksAwarded,
              correctAnswer:  s.feedback.correctAnswer,
              correctOptions: s.feedback.correctOptions,
              correctBoolean: s.feedback.correctBoolean,
              explanation:    s.feedback.explanation,
              options:        s.feedback.options,
            };
          }
        } else if (s.draftSelectedOption || s.draftSelectedOptions?.length || s.draftTextAnswer) {
          restoredAnswers[s.questionId] = {
            selectedOption:  s.draftSelectedOption ?? undefined,
            selectedOptions: s.draftSelectedOptions?.length ? s.draftSelectedOptions : undefined,
            textAnswer:      s.draftTextAnswer ?? undefined,
          };
        }
      }
      if (Object.keys(restoredAnswers).length)   setAnswers(restoredAnswers);
      if (Object.keys(restoredSubmitted).length) setSubmitted(restoredSubmitted);
      if (Object.keys(restoredFeedbacks).length) setFeedbacks(restoredFeedbacks);
      if (data.currentQuestionIndex) setIdx(data.currentQuestionIndex);
    }).catch(() => setLoadErr('Could not load this quiz. It may have already been submitted.'));
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions: PracticeQuestion[] = attempt?.questions ?? [];
  const q = questions[idx] ?? null;

  const answeredCount = Object.keys(submitted).length;

  // ── Answer selection ────────────────────────────────────────────

  const selectOption = (letter: string) => {
    if (!q || submitted[q.id]) return;
    if (q.type === 'MCQ_MULTIPLE') {
      setAnswers(prev => {
        const current = prev[q.id]?.selectedOptions ?? [];
        const next    = current.includes(letter)
          ? current.filter(l => l !== letter)
          : [...current, letter];
        return { ...prev, [q.id]: { selectedOptions: next } };
      });
    } else {
      setAnswers(prev => ({ ...prev, [q.id]: { selectedOption: letter } }));
    }
  };

  // ── Submit this question's answer ───────────────────────────────

  const submitAnswer = useCallback(async (skipQuestion = false) => {
    if (!q || !attemptId || submitted[q.id]) return;
    setSaving(true);
    try {
      const current = answers[q.id] ?? {};
      const payload: Parameters<typeof practiceApi.saveAnswer>[1] = {
        questionId:   q.id,
        timeSpentSec: elapsedRef.current,
        isSkipped:    skipQuestion,
        ...(current.selectedOption  && { selectedOption:  current.selectedOption  }),
        ...(current.selectedOptions?.length && { selectedOptions: current.selectedOptions }),
        ...(current.textAnswer      && { textAnswer:      current.textAnswer      }),
      };

      const result: SaveAnswerFeedback = await practiceApi.saveAnswer(attemptId, payload);

      setFeedbacks(prev => ({
        ...prev,
        [q.id]: {
          isCorrect:      result.isCorrect,
          marksAwarded:   result.marksAwarded,
          correctAnswer:  result.feedback.correctAnswer,
          correctOptions: result.feedback.correctOptions,
          correctBoolean: result.feedback.correctBoolean,
          explanation:    result.feedback.explanation,
          options:        result.feedback.options,
        },
      }));
      setSubmitted(prev => ({ ...prev, [q.id]: true }));
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not save answer', sub: e?.message ?? 'Please check your connection and try again.' });
    } finally {
      setSaving(false);
      setTextInput('');
    }
  }, [q, attemptId, answers, submitted, push]);

  // ── Advance to next / finish ────────────────────────────────────

  const next = () => {
    if (idx < questions.length - 1) {
      setIdx(i => i + 1);
      setTextInput('');
    }
  };

  const finish = async () => {
    // Guards against the manual "Finish Quiz" click and the countdown's
    // auto-finish firing at the same moment (both call this function).
    if (!attemptId || finishingRef.current) return;
    finishingRef.current = true;
    // Submit current question if not already done
    if (q && !submitted[q.id]) await submitAnswer();
    setFinishing(true);
    try {
      await practiceApi.submit(attemptId, elapsed);
      navigate(`play/result/${attemptId}`);
    } catch (e: any) {
      finishingRef.current = false;
      setFinishing(false);
      push({ kind: 'danger', title: 'Could not finish quiz', sub: e?.message ?? 'Please check your connection and try again.' });
    }
  };
  useEffect(() => { finishRef.current = finish; });

  // ── Text answer sync ────────────────────────────────────────────

  useEffect(() => {
    if (!q) return;
    setTextInput(answers[q.id]?.textAnswer ?? '');
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTextChange = (v: string) => {
    setTextInput(v);
    if (q) setAnswers(prev => ({ ...prev, [q.id]: { textAnswer: v } }));
  };

  // ── Debounced progress autosave — persists the current question index and
  //     an in-progress (not-yet-submitted) draft, so a raw refresh (no
  //     explicit Pause) still resumes at the right spot with nothing lost.
  useEffect(() => {
    if (!attemptId || !q || submitted[q.id]) return;
    const current = answers[q.id];
    const t = setTimeout(() => {
      practiceApi.saveProgress(attemptId, {
        currentQuestionIndex: idx,
        ...(current && {
          draft: {
            questionId: q.id,
            ...(current.selectedOption && { selectedOption: current.selectedOption }),
            ...(current.selectedOptions?.length && { selectedOptions: current.selectedOptions }),
            ...(current.textAnswer && { textAnswer: current.textAnswer }),
          },
        }),
      }).catch(() => {/* non-fatal */});
    }, 500);
    return () => clearTimeout(t);
  }, [idx, attemptId, q, answers, submitted]);

  // ── Pause: persist the current draft + question index, freeze the clock
  //     server-side, then leave. Also the save routine the exit guard runs
  //     on browser Back / refresh-warning / in-app nav clicks / the X button.
  const handlePause = useCallback(async () => {
    if (attemptId) {
      const current = q && !submitted[q.id] ? answers[q.id] : undefined;
      await practiceApi.saveProgress(attemptId, {
        currentQuestionIndex: idx,
        paused: true,
        ...(current && q && {
          draft: {
            questionId: q.id,
            ...(current.selectedOption && { selectedOption: current.selectedOption }),
            ...(current.selectedOptions?.length && { selectedOptions: current.selectedOptions }),
            ...(current.textAnswer && { textAnswer: current.textAnswer }),
          },
        }),
      }).catch(() => {/* non-fatal */});
    }
    navigate('play');
  }, [attemptId, idx, q, submitted, answers, navigate]);

  const { confirmOpen: leaveConfirmOpen, requestLeave, stay, confirmLeaveNow } = useQuizExitGuard({
    active: !!attempt && !finishing,
    onConfirmLeave: handlePause,
  });

  // ── Loading / error states ──────────────────────────────────────

  if (loadErr) {
    return (
      <div className="container">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 px-6">
          <XCircle size={40} className="text-rose-400" />
          <h2 className="font-display text-xl font-semibold text-fg1">{loadErr}</h2>
          <Button variant="outline" onClick={() => navigate('play')}>
            Back to Practice
          </Button>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!q) return null;

  const isLastQ       = idx === questions.length - 1;
  const qSubmitted    = !!submitted[q.id];
  const feedback      = feedbacks[q.id] ?? null;
  const currentAnswer = answers[q.id] ?? {};
  const hasSelection  =
    (q.type === 'MCQ_MULTIPLE' ? (currentAnswer.selectedOptions?.length ?? 0) > 0 : !!currentAnswer.selectedOption) ||
    !!currentAnswer.textAnswer;

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="max-w-2xl mx-auto">
        {toastNode}
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
              <BookOpen size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-fg1 truncate">{attempt.subject.name}</div>
              <div className="text-[11px] text-fg3">
                {attempt.timeLimitSec
                  ? `${questions.length} Questions | ${Math.round(attempt.timeLimitSec / 60)} Minutes`
                  : 'Practice Quiz'}
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 text-[12px] font-mono ${
            remaining !== null && remaining <= 60 ? 'text-rose-400' : 'text-fg3'
          }`}>
            <Clock size={13} />
            {remaining !== null ? fmtMMSS(remaining) : timer}
          </div>

          <span className="text-[12px] text-fg2 font-semibold tabular-nums">
            {idx + 1} / {questions.length}
          </span>

          <Button variant="outline" icon={Pause} size="sm" onClick={handlePause} className="shrink-0">
            Pause
          </Button>

          <button
            onClick={requestLeave}
            className="w-8 h-8 grid place-items-center rounded-lg text-fg3 hover:text-fg1 hover:bg-surface1 transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Progress */}
        <div className="mb-5">
          <ProgressBar value={answeredCount} max={questions.length} tone="brand" />
          <div className="flex justify-between mt-1.5 text-[11px] text-fg3">
            <span>{answeredCount} answered</span>
            <span>{questions.length - answeredCount} remaining</span>
          </div>
        </div>

        {/* ── Question card ──────────────────────────────────────── */}
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3">
              Question {idx + 1}
            </span>
            <Badge tone={DIFF_TONE[q.difficulty] ?? 'neutral'} dot={false} className="text-[10px]">
              {q.difficulty}
            </Badge>
          </div>

          <p className="text-[15px] text-fg1 leading-relaxed mb-5 font-medium">{q.prompt}</p>

          {/* MCQ_SINGLE / MCQ_MULTIPLE */}
          {(q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && (
            <div className="space-y-2">
              {q.type === 'MCQ_MULTIPLE' && (
                <p className="text-[11.5px] text-fg3 mb-3">Select all that apply</p>
              )}
              {(q.options ?? []).map(opt => (
                <OptionButton
                  key={opt.letter}
                  option={opt}
                  selected={
                    q.type === 'MCQ_MULTIPLE'
                      ? (currentAnswer.selectedOptions ?? []).includes(opt.letter)
                      : currentAnswer.selectedOption === opt.letter
                  }
                  feedback={feedback}
                  submitted={qSubmitted}
                  onClick={() => selectOption(opt.letter)}
                />
              ))}
            </div>
          )}

          {/* TRUE_FALSE */}
          {q.type === 'TRUE_FALSE' && (
            <div className="grid grid-cols-2 gap-3">
              {(['TRUE', 'FALSE'] as const).map(val => {
                const selected = currentAnswer.selectedOption === val;
                const isCorrect = feedback && (
                  (val === 'TRUE'  && feedback.correctBoolean === true) ||
                  (val === 'FALSE' && feedback.correctBoolean === false)
                );
                let cls = 'border-line bg-surface1 text-fg1 hover:border-brand/40';
                if (qSubmitted && feedback) {
                  cls = isCorrect
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : selected
                      ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                      : 'border-line bg-surface1/50 text-fg3 opacity-60';
                } else if (selected) {
                  cls = 'border-brand/60 bg-brand-soft text-brand';
                }
                return (
                  <button
                    key={val}
                    disabled={qSubmitted}
                    onClick={() => !qSubmitted && setAnswers(prev => ({ ...prev, [q.id]: { selectedOption: val } }))}
                    className={`py-3 rounded-xl border font-semibold text-[14px] transition disabled:cursor-default ${cls}`}
                  >
                    {val === 'TRUE' ? 'True ✓' : 'False ✗'}
                  </button>
                );
              })}
            </div>
          )}

          {/* FILL_IN_BLANK */}
          {q.type === 'FILL_IN_BLANK' && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-[12px] text-fg3">
                <CornerDownRight size={13} />
                Type your answer below
              </div>
              <input
                value={textInput}
                onChange={e => handleTextChange(e.target.value)}
                disabled={qSubmitted}
                placeholder="Your answer…"
                className={`w-full h-11 px-4 rounded-xl border text-[13.5px] focus:outline-none transition ${
                  qSubmitted && feedback
                    ? feedback.isCorrect
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                    : 'border-line bg-surface1 text-fg1 focus:border-brand/40 focus:ring-2 focus:ring-brand/20'
                }`}
              />
            </div>
          )}
        </Card>

        {/* ── Feedback card ──────────────────────────────────────── */}
        {qSubmitted && feedback && (
          <Card className={`p-4 mb-4 border-2 ${
            feedback.isCorrect === true
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : feedback.isCorrect === false
                ? 'border-rose-500/40 bg-rose-500/5'
                : 'border-line'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {feedback.isCorrect === true  && <CheckCircle2 size={18} className="text-emerald-400" />}
              {feedback.isCorrect === false && <XCircle      size={18} className="text-rose-400" />}
              <span className={`font-semibold text-[14px] ${
                feedback.isCorrect === true ? 'text-emerald-300' : feedback.isCorrect === false ? 'text-rose-300' : 'text-fg2'
              }`}>
                {feedback.isCorrect === true
                  ? `Correct! +${feedback.marksAwarded} mark${feedback.marksAwarded !== 1 ? 's' : ''}`
                  : feedback.isCorrect === false
                    ? 'Incorrect'
                    : 'Skipped'}
              </span>
            </div>

            {feedback.isCorrect === false && (
              <div className="text-[12.5px] text-fg2 mb-1.5">
                <strong>Correct answer:</strong>{' '}
                {feedback.correctAnswer
                  ? `Option ${feedback.correctAnswer}`
                  : feedback.correctOptions?.length
                    ? `Options: ${feedback.correctOptions.join(', ')}`
                    : feedback.correctBoolean !== null && feedback.correctBoolean !== undefined
                      ? feedback.correctBoolean ? 'True' : 'False'
                      : '—'}
              </div>
            )}

            {feedback.explanation && (
              <p className="text-[12px] text-fg3 italic border-t border-line/50 pt-2 mt-2">
                {feedback.explanation}
              </p>
            )}
          </Card>
        )}

        {/* ── Action bar ─────────────────────────────────────────── */}
        <div className="flex gap-3">
          {!qSubmitted && (
            <Button
              variant="ghost"
              icon={SkipForward}
              onClick={() => submitAnswer(true)}
              disabled={saving || finishing}
            >
              Skip
            </Button>
          )}

          {!qSubmitted && (
            <Button
              className="flex-1"
              onClick={() => submitAnswer(false)}
              disabled={saving || !hasSelection || finishing}
            >
              {saving ? 'Saving…' : 'Submit Answer'}
            </Button>
          )}

          {qSubmitted && !isLastQ && (
            <Button className="flex-1" icon={ChevronRight} onClick={next} disabled={finishing}>
              Next Question
            </Button>
          )}

          {qSubmitted && isLastQ && (
            <Button className="flex-1" onClick={finish} disabled={finishing}>
              {finishing ? 'Finishing…' : 'Finish Quiz'}
            </Button>
          )}
        </div>

        {/* ── Exit confirmation overlay — shown on the X button, browser
               Back, refresh warning, and in-app nav clicks alike. ───────── */}
        {leaveConfirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-display font-semibold text-[17px] text-fg1 mb-2">Leave quiz?</h3>
              <p className="text-[13px] text-fg3 mb-5">
                Are you sure you want to leave the quiz? Your progress will be saved, and you can resume it later.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={stay}>
                  Continue Quiz
                </Button>
                <Button variant="danger" className="flex-1" onClick={confirmLeaveNow}>
                  Leave Quiz
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
