import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, ChevronRight, BookOpen, Clock, X, SkipForward,
  CornerDownRight,
} from 'lucide-react';
import { Card, Button, Badge, ProgressBar } from '../../shared/ui';
import {
  practiceApi,
  type PracticeAttemptData,
  type PracticeQuestion,
  type SaveAnswerFeedback,
} from '../../../hooks/usePracticeQuiz';

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

// ── Elapsed timer ─────────────────────────────────────────────────

function useElapsedSec() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return { elapsed, formatted: fmt(elapsed) };
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

export function PracticePlayPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const location      = useLocation();
  const navigate      = useNavigate();
  const { elapsed, formatted: timer } = useElapsedSec();
  const elapsedRef    = useRef(elapsed);

  const [attempt,    setAttempt]    = useState<PracticeAttemptData | null>(location.state?.attempt ?? null);
  const [loadErr,    setLoadErr]    = useState('');
  const [idx,        setIdx]        = useState(0);
  const [answers,    setAnswers]    = useState<Record<string, AnswerState>>({});
  const [feedbacks,  setFeedbacks]  = useState<Record<string, FeedbackState>>({});
  const [submitted,  setSubmitted]  = useState<Record<string, boolean>>({});
  const [saving,     setSaving]     = useState(false);
  const [finishing,  setFinishing]  = useState(false);
  const [textInput,  setTextInput]  = useState('');
  const [exitAsk,    setExitAsk]    = useState(false);

  // Keep elapsedRef in sync so submitAnswer callback can read current elapsed time
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Load attempt from API if not in router state (e.g. page refresh)
  useEffect(() => {
    if (!attempt && attemptId) {
      practiceApi.getAttempt(attemptId).then(data => {
        setAttempt(data as PracticeAttemptData);
      }).catch(() => setLoadErr('Could not load this quiz. It may have already been submitted.'));
    }
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
    } catch {
      // Non-fatal: move on silently
    } finally {
      setSaving(false);
      setTextInput('');
    }
  }, [q, attemptId, answers, submitted]);

  // ── Advance to next / finish ────────────────────────────────────

  const next = () => {
    if (idx < questions.length - 1) {
      setIdx(i => i + 1);
      setTextInput('');
    }
  };

  const finish = async () => {
    if (!attemptId) return;
    // Submit current question if not already done
    if (q && !submitted[q.id]) await submitAnswer();
    setFinishing(true);
    try {
      const result = await practiceApi.submit(attemptId, elapsed);
      navigate(`/student/practice/result/${attemptId}`, { state: { result } });
    } catch {
      setFinishing(false);
    }
  };

  // ── Text answer sync ────────────────────────────────────────────

  useEffect(() => {
    if (!q) return;
    setTextInput(answers[q.id]?.textAnswer ?? '');
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTextChange = (v: string) => {
    setTextInput(v);
    if (q) setAnswers(prev => ({ ...prev, [q.id]: { textAnswer: v } }));
  };

  // ── Loading / error states ──────────────────────────────────────

  if (loadErr) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 px-6">
        <XCircle size={40} className="text-rose-400" />
        <h2 className="font-display text-xl font-semibold text-fg1">{loadErr}</h2>
        <Button variant="outline" onClick={() => navigate('/student/practice')}>
          Back to Practice
        </Button>
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
    <div className="max-w-2xl mx-auto">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
            <BookOpen size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg1 truncate">{attempt.subject.name}</div>
            <div className="text-[11px] text-fg3">Practice Quiz</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[12px] text-fg3 font-mono">
          <Clock size={13} />
          {timer}
        </div>

        <span className="text-[12px] text-fg2 font-semibold tabular-nums">
          {idx + 1} / {questions.length}
        </span>

        <button
          onClick={() => setExitAsk(true)}
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

      {/* ── Exit confirmation overlay ───────────────────────────── */}
      {exitAsk && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full">
            <h3 className="font-display font-semibold text-[17px] text-fg1 mb-2">Exit quiz?</h3>
            <p className="text-[13px] text-fg3 mb-5">
              Your progress won't be saved if you leave now. You can always start a fresh practice session later.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setExitAsk(false)}>
                Keep playing
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => navigate('/student/practice')}>
                Exit
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
