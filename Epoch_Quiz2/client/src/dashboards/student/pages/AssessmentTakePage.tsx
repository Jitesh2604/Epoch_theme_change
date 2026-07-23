import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Clock, ChevronLeft, ChevronRight, AlertTriangle,
  Lock, FileText, CornerDownRight, CheckCircle2, XCircle,
} from 'lucide-react';
import { Card, Button, ProgressBar, useToasts } from '../../shared/ui';
import {
  assessmentTakeApi,
  type TakeSubmission,
  type TakeQuestion,
  type DraftSave,
} from '../../../hooks/useSubmissionApi';
import { useQuizExitGuard } from '../../../hooks/useQuizExitGuard';

// ── Types ─────────────────────────────────────────────────────────

interface DraftAnswer {
  selectedOption?:  number | null;
  selectedOptions?: number[];           // MCQ_MULTIPLE
  selectedBoolean?: boolean | null;
  textAnswer?:      string;
}

// ── Countdown timer hook ──────────────────────────────────────────

function useCountdown(expiresAtMs: number | null) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!expiresAtMs) return;
    const tick = () => setSecs(Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return {
    secs,
    formatted: `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
    isWarning: secs > 0 && secs <= 300,
    isDanger:  secs > 0 && secs <= 60,
  };
}

// ── Timer chip ────────────────────────────────────────────────────

function TimerChip({ secs, formatted, isWarning, isDanger }: ReturnType<typeof useCountdown>) {
  const base = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-[13px] font-semibold transition-all';
  const color = isDanger
    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 animate-pulse'
    : isWarning
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-surface1 border-line text-fg2';

  return (
    <span className={`${base} ${color}`}>
      <Clock size={13} />
      {secs === 0 ? 'Time up' : formatted}
    </span>
  );
}

// ── MCQ option button ─────────────────────────────────────────────

function OptionBtn({
  letter, text, imageUrl, selected, multi, onClick,
}: { letter: string; text: string; imageUrl?: string | null; selected: boolean; multi?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition active:scale-[0.99] ${
        selected
          ? 'border-brand/60 bg-brand-soft text-brand'
          : 'border-line bg-surface1 text-fg1 hover:border-brand/40 hover:bg-brand-soft/20'
      }`}
    >
      <span className={`w-7 h-7 rounded-lg grid place-items-center text-[12px] font-display font-semibold shrink-0 border mt-0.5 ${
        selected
          ? multi
            ? 'bg-brand text-brand-ink border-transparent'
            : 'bg-brand text-brand-ink border-transparent'
          : 'bg-surface2 border-line text-fg3'
      }`}>
        {multi ? (selected ? '✓' : letter) : letter}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-[13.5px]">{text}</span>
        {imageUrl && (
          <img src={imageUrl} alt={`Option ${letter}`} className="mt-2 max-h-32 rounded-lg object-contain border border-line" />
        )}
      </div>
    </button>
  );
}

// ── Question display ──────────────────────────────────────────────

function QuestionCard({
  q, draft, onChange,
}: {
  q:        TakeQuestion;
  draft:    DraftAnswer;
  onChange: (d: DraftAnswer) => void;
}) {
  const LETTERS = ['A', 'B', 'C', 'D'];
  const opts = q.options ?? [];
  const selectedOptions = draft.selectedOptions ?? [];

  const toggleMulti = (i: number) => {
    const next = selectedOptions.includes(i)
      ? selectedOptions.filter(x => x !== i)
      : [...selectedOptions, i];
    onChange({ ...draft, selectedOptions: next });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3">
          Question {q.order}
        </span>
        <span className="text-[11px] text-fg3 font-mono">
          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
        </span>
      </div>

      {/* Question prompt + optional image */}
      <p className="text-[15px] text-fg1 leading-relaxed mb-3 font-medium">{q.prompt}</p>
      {q.promptImageUrl && (
        <img src={q.promptImageUrl} alt="Question" className="mb-5 max-h-64 rounded-xl object-contain border border-line" />
      )}

      {/* MCQ_SINGLE */}
      {q.type === 'MCQ_SINGLE' && (
        <div className="space-y-2">
          {opts.map((opt, i) => (
            <OptionBtn
              key={i}
              letter={LETTERS[i] ?? String(i)}
              text={opt.text}
              imageUrl={opt.imageUrl}
              selected={draft.selectedOption === i}
              onClick={() => onChange({ ...draft, selectedOption: i })}
            />
          ))}
        </div>
      )}

      {/* MCQ_MULTIPLE */}
      {q.type === 'MCQ_MULTIPLE' && (
        <div className="space-y-2">
          <p className="text-[11.5px] text-fg3 mb-2">Select all that apply</p>
          {opts.map((opt, i) => (
            <OptionBtn
              key={i}
              letter={LETTERS[i] ?? String(i)}
              text={opt.text}
              imageUrl={opt.imageUrl}
              selected={selectedOptions.includes(i)}
              multi
              onClick={() => toggleMulti(i)}
            />
          ))}
        </div>
      )}

      {/* TRUE_FALSE */}
      {q.type === 'TRUE_FALSE' && (
        <div className="grid grid-cols-2 gap-3">
          {([true, false] as const).map((val) => {
            const selected = draft.selectedBoolean === val;
            return (
              <button
                key={String(val)}
                onClick={() => onChange({ ...draft, selectedBoolean: val })}
                className={`py-3 rounded-xl border font-semibold text-[14px] transition ${
                  selected
                    ? 'border-brand/60 bg-brand-soft text-brand'
                    : 'border-line bg-surface1 text-fg1 hover:border-brand/40'
                }`}
              >
                {val ? 'True ✓' : 'False ✗'}
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
            value={draft.textAnswer ?? ''}
            onChange={(e) => onChange({ ...draft, textAnswer: e.target.value })}
            placeholder="Your answer…"
            className="w-full h-11 px-4 rounded-xl border border-line bg-surface1 text-[13.5px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
          />
        </div>
      )}

      {/* MATCH_THE_COLUMN */}
      {q.type === 'MATCH_THE_COLUMN' && q.matchPairs && (
        <div className="space-y-2">
          <p className="text-[11.5px] text-fg3 mb-3">Match each item on the left with the correct item on the right.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-fg3 uppercase tracking-wider mb-1">Column A</p>
              {(q.matchPairs as Array<{ left: string; right: string }>).map((pair, i) => (
                <div key={i} className="px-3 py-2.5 rounded-lg bg-brand-soft/40 border border-brand/20 text-[13px] text-fg1">
                  {pair.left}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-fg3 uppercase tracking-wider mb-1">Column B</p>
              {(q.matchPairs as Array<{ left: string; right: string }>).map((pair, i) => (
                <div key={i} className="px-3 py-2.5 rounded-lg bg-surface1 border border-line text-[13px] text-fg1">
                  {pair.right}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11.5px] text-fg3 mb-2 flex items-center gap-2">
              <CornerDownRight size={13} />
              Enter your matching (e.g. A-1, B-3, C-2…)
            </p>
            <input
              value={draft.textAnswer ?? ''}
              onChange={(e) => onChange({ ...draft, textAnswer: e.target.value })}
              placeholder="Your matching answer…"
              className="w-full h-11 px-4 rounded-xl border border-line bg-surface1 text-[13.5px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
            />
            <p className="text-[11px] text-fg3 mt-1.5">This answer will be reviewed by your admin.</p>
          </div>
        </div>
      )}

      {/* DESCRIPTIVE */}
      {q.type === 'DESCRIPTIVE' && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-[12px] text-fg3">
            <CornerDownRight size={13} />
            Write your answer below
          </div>
          <textarea
            value={draft.textAnswer ?? ''}
            onChange={(e) => onChange({ ...draft, textAnswer: e.target.value })}
            placeholder="Your answer…"
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-line bg-surface1 text-[13.5px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20 resize-y"
          />
          <p className="text-[11px] text-fg3 mt-1.5">This question will be manually graded by your admin.</p>
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export function AssessmentTakePage() {
  const { submissionId }   = useParams<{ submissionId: string }>();
  const location           = useLocation();
  const navigate           = useNavigate();
  const { push, node: toastNode } = useToasts();

  const [submission, setSubmission]     = useState<TakeSubmission | null>(
    location.state?.submission ?? null,
  );
  const [loadErr, setLoadErr]           = useState('');
  const [idx, setIdx]                   = useState(0);
  const [drafts, setDrafts]             = useState<Record<string, DraftAnswer>>({});
  const [submitting, setSubmitting]     = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [timedOut, setTimedOut]         = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const autoSubmitRef                   = useRef(false);
  const saveTimers                      = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load on refresh (no location.state) ─────────────────────────
  useEffect(() => {
    if (submission) return;
    if (!submissionId) {
      setLoadErr('No assessment session found. Please start again from the Assessment page.');
      return;
    }
    (async () => {
      try {
        const result = await assessmentTakeApi.getById(submissionId);
        if (result.status !== 'IN_PROGRESS') {
          navigate(`/assessment/result/${submissionId}`, {
            replace: true,
            state: { result },
          });
          return;
        }
        // Normalise to TakeSubmission shape for the timer / question display
        const expires = new Date(result.startedAt).getTime() + result.assessment.duration * 60_000;
        const fake: TakeSubmission = {
          id:          result.id,
          status:      result.status,
          startedAt:   result.startedAt,
          expiresAt:   new Date(expires).toISOString(),
          remainingSec: Math.max(0, Math.floor((expires - Date.now()) / 1000)),
          totalMarks:  result.totalMarks ?? 0,
          assessment:  result.assessment,
          // Still IN_PROGRESS, which the backend never gates — questions is
          // always present here; the type is optional only for the
          // pre-publication pending shape returned for completed submissions.
          questions:   (result.questions ?? []).map((q) => ({
            order:           q.order,
            questionId:      q.questionId,
            type:            q.type,
            prompt:          q.prompt,
            promptImageUrl:  q.promptImageUrl,
            options:         q.options,
            matchPairs:      q.matchPairs ?? null,
            marks:           q.marks,
          })),
          savedAnswers: [],
        };
        // Seed drafts from yourAnswer per question
        const init: Record<string, DraftAnswer> = {};
        for (const q of result.questions ?? []) {
          if (q.yourAnswer) {
            init[q.questionId] = {
              selectedOption:  q.yourAnswer.selectedOption,
              selectedOptions: q.yourAnswer.selectedOptions ?? [],
              selectedBoolean: q.yourAnswer.selectedBoolean,
              textAnswer:      q.yourAnswer.textAnswer ?? undefined,
            };
          }
        }
        setDrafts(init);
        setSubmission(fake);
      } catch {
        setLoadErr('Could not load this assessment. It may have already been submitted.');
      }
    })();
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seed drafts from savedAnswers (fresh start / resume) ─────────
  useEffect(() => {
    if (!submission?.savedAnswers.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of submission.savedAnswers) {
        if (!next[s.questionId]) {
          next[s.questionId] = {
            selectedOption:  s.selectedOption,
            selectedBoolean: s.selectedBoolean,
            textAnswer:      s.textAnswer ?? undefined,
          };
        }
      }
      return next;
    });
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer ────────────────────────────────────────────────────────
  const expiresAtMs = useMemo(() => {
    if (!submission) return null;
    return new Date(submission.expiresAt).getTime();
  }, [submission?.expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useCountdown(expiresAtMs);

  // Auto-submit when timer hits zero
  const prevSecs = useRef<number | null>(null);
  useEffect(() => {
    if (
      timer.secs === 0 &&
      prevSecs.current !== null &&
      prevSecs.current > 0 &&
      !autoSubmitRef.current &&
      submission
    ) {
      autoSubmitRef.current = true;
      setTimedOut(true);
      doSubmit(true);
    }
    prevSecs.current = timer.secs;
  }, [timer.secs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────
  const questions = submission?.questions ?? [];
  const q         = questions[idx] ?? null;

  const answeredCount = useMemo(
    () => questions.filter((q) => hasDraft(drafts[q.questionId])).length,
    [questions, drafts],
  );

  function hasDraft(d?: DraftAnswer) {
    if (!d) return false;
    return (
      d.selectedOption !== undefined && d.selectedOption !== null ||
      d.selectedBoolean !== undefined && d.selectedBoolean !== null ||
      (d.textAnswer !== undefined && d.textAnswer.trim().length > 0)
    );
  }

  // ── Answer change + autosave ──────────────────────────────────────
  const handleChange = useCallback(
    (questionId: string, draft: DraftAnswer) => {
      setDrafts((prev) => ({ ...prev, [questionId]: draft }));

      // Debounced autosave (fire-and-forget)
      if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
      saveTimers.current[questionId] = setTimeout(() => {
        assessmentTakeApi.saveAnswer(submissionId!, {
          questionId,
          selectedOption:  draft.selectedOption ?? null,
          selectedOptions: draft.selectedOptions ?? [],
          selectedBoolean: draft.selectedBoolean ?? null,
          textAnswer:      draft.textAnswer ?? null,
        }).catch(() => {/* non-fatal */});
      }, 800);
    },
    [submissionId],
  );

  // ── Leave: flush any pending debounced answer(s), then exit. The timer
  //     keeps running in the background — answers are autosaved as you go,
  //     but there's no pause/freeze. Also the save routine the exit guard
  //     runs on browser Back / refresh-warning / in-app nav clicks / the X
  //     button — see useQuizExitGuard below.
  const handleLeave = useCallback(async () => {
    const pendingIds = Object.keys(saveTimers.current);
    pendingIds.forEach((qid) => clearTimeout(saveTimers.current[qid]));
    saveTimers.current = {};

    if (submissionId) {
      await Promise.all(
        pendingIds.map((qid) => {
          const d = drafts[qid];
          if (!d) return Promise.resolve();
          return assessmentTakeApi.saveAnswer(submissionId, {
            questionId:      qid,
            selectedOption:  d.selectedOption  ?? null,
            selectedOptions: d.selectedOptions ?? [],
            selectedBoolean: d.selectedBoolean ?? null,
            textAnswer:      d.textAnswer      ?? null,
          }).catch(() => {/* non-fatal */});
        }),
      );
    }
    navigate('/assessment');
  }, [submissionId, drafts, navigate]);

  // Exam Mode: onConfirmLeave is wired for the hook's contract but is never
  // actually triggered — the lock overlay below only offers "stay" (see
  // leaveConfirmOpen), so there is no UI path that calls it. Kept as real,
  // valid fallback behavior (autosave + return to the list) rather than a
  // no-op, in case a future affordance needs it.
  const { confirmOpen: leaveConfirmOpen, stay } = useQuizExitGuard({
    active: !!submission && !submitting,
    onConfirmLeave: handleLeave,
  });

  // ── Submit ────────────────────────────────────────────────────────
  const doSubmit = useCallback(
    async (auto = false) => {
      if (!submissionId || submitting) return;
      setSubmitting(true);
      setConfirmOpen(false);

      const answers: DraftSave[] = questions.map((q) => {
        const d = drafts[q.questionId] ?? {};
        return {
          questionId:      q.questionId,
          selectedOption:  d.selectedOption  ?? null,
          selectedOptions: d.selectedOptions ?? [],
          selectedBoolean: d.selectedBoolean ?? null,
          textAnswer:      d.textAnswer      ?? null,
        };
      });

      try {
        const result = await assessmentTakeApi.submit(submissionId, answers);
        navigate(`/assessment/result/${submissionId}`, {
          state: { result, autoSubmitted: auto },
        });
      } catch (e: any) {
        setSubmitting(false);
        if (auto) {
          setAutoSubmitFailed(true);
        } else {
          push({ kind: 'danger', title: 'Submit failed', sub: e?.message ?? 'Please check your connection and try again.' });
        }
      }
    },
    [submissionId, submitting, questions, drafts, navigate, push],
  );

  // ── Guard states ─────────────────────────────────────────────────
  // This is a standalone top-level route (see DashboardApp.tsx) so it can
  // be a distraction-free, full-screen Exam Mode — no sidebar, topbar, or
  // profile menu (there is no Student Dashboard). Every state below
  // provides its own full-page shell instead of inheriting one.
  if (loadErr) {
    return (
      <div className="min-h-screen bg-bg text-fg1 font-body flex flex-col items-center justify-center text-center gap-4 px-6">
        <XCircle size={40} className="text-rose-400" />
        <h2 className="font-display text-xl font-semibold text-fg1">{loadErr}</h2>
        <Button variant="outline" onClick={() => navigate('/assessment')}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-bg text-fg1 font-body flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!q) return null;

  const draft        = drafts[q.questionId] ?? {};
  const unanswered   = questions.length - answeredCount;
  const isFirst      = idx === 0;
  const isLast       = idx === questions.length - 1;

  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      {toastNode}

      {/* ── Auto-submit failure — hard blocker with a retry path ─── */}
      {autoSubmitFailed && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full text-center">
            <AlertTriangle size={32} className="mx-auto text-amber-400 mb-3" />
            <h3 className="font-display font-semibold text-[17px] text-fg1 mb-1">Time's up — submission failed</h3>
            <p className="text-[13px] text-fg3 mb-4">
              Your time ran out and we couldn't submit automatically — likely a connection issue.
              Your answers are saved. Retry submitting now.
            </p>
            <Button
              onClick={() => { setAutoSubmitFailed(false); doSubmit(true); }}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Retry submit'}
            </Button>
          </Card>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
            <FileText size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg1 truncate">
              {submission.assessment.title}
            </div>
            <div className="text-[11px] text-fg3">{submission.assessment.subject?.name ?? 'Mixed Subjects'}</div>
          </div>
        </div>

        <span className="text-[12px] text-fg2 font-semibold tabular-nums shrink-0">
          {idx + 1} / {questions.length}
        </span>

        <TimerChip {...timer} />
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <ProgressBar value={answeredCount} max={questions.length} tone="brand" />
        <div className="flex justify-between mt-1.5 text-[11px] text-fg3">
          <span>{answeredCount} answered</span>
          <span>{unanswered} remaining</span>
        </div>
      </div>

      {/* Timer danger banner */}
      {timer.isDanger && !timedOut && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[12.5px] font-semibold mb-4">
          <AlertTriangle size={14} />
          Less than 1 minute remaining — your answers will be submitted automatically.
        </div>
      )}

      {/* ── Question card ──────────────────────────────────────── */}
      <QuestionCard
        q={q}
        draft={draft}
        onChange={(d) => handleChange(q.questionId, d)}
      />

      {/* ── Navigation ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mt-4">
        <Button
          variant="outline"
          icon={ChevronLeft}
          onClick={() => setIdx((i) => i - 1)}
          disabled={isFirst || submitting}
          size="sm"
        >
          Previous
        </Button>

        <div className="flex-1" />

        {!isLast && (
          <Button
            icon={ChevronRight}
            onClick={() => setIdx((i) => i + 1)}
            disabled={submitting}
            size="sm"
          >
            Next
          </Button>
        )}

        {isLast && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || timedOut}
            size="sm"
          >
            {submitting ? 'Submitting…' : 'Submit Assessment'}
          </Button>
        )}
      </div>

      {/* ── Submit confirmation overlay ─────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-[17px] text-fg1">Submit assessment?</h3>
                <p className="text-[12px] text-fg3">This cannot be undone.</p>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface1 border border-line mb-4 text-[13px]">
              <span className="text-fg3">Answered</span>
              <span className="font-semibold text-fg1">{answeredCount} / {questions.length}</span>
            </div>

            {unanswered > 0 && (
              <div className="flex items-center gap-2 text-[12.5px] text-amber-300 mb-4">
                <AlertTriangle size={14} />
                {unanswered} question{unanswered !== 1 ? 's' : ''} left unanswered
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Keep going
              </Button>
              <Button
                className="flex-1"
                onClick={() => doSubmit()}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit now'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Exam Mode lock overlay — shown on browser Back or any attempted
             in-app navigation (see useQuizExitGuard). Deliberately offers no
             way to leave: the only ways out of an in-progress assessment are
             submitting it or letting the timer auto-submit it. ─────────── */}
      {leaveConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full text-center">
            <div className="w-11 h-11 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 grid place-items-center mb-3">
              <Lock size={20} />
            </div>
            <h3 className="font-display font-semibold text-[17px] text-fg1 mb-2">You can't leave this assessment yet</h3>
            <p className="text-[13px] text-fg3 mb-5">
              The timer keeps running. Submit your answers when you're done, or the assessment will
              submit automatically once time runs out.
            </p>
            <Button className="w-full" onClick={stay}>
              Continue Assessment
            </Button>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
}
