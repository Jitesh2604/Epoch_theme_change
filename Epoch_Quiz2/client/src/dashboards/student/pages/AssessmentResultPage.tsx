import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, MinusCircle, Clock, Trophy, BookOpen,
  ChevronDown, ChevronUp, ArrowLeft, AlertTriangle, Award,
} from 'lucide-react';
import { Card, Button, Badge, ProgressBar } from '../../shared/ui';
import { assessmentTakeApi, type SubmissionResult, type ResultQuestion } from '../../../hooks/useSubmissionApi';

// ── Helpers ───────────────────────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D'];

function grade(pct: number): { label: string; tone: 'success' | 'warning' | 'danger'; color: string } {
  if (pct >= 90) return { label: 'Outstanding!',   tone: 'success', color: '#22c55e' };
  if (pct >= 75) return { label: 'Great work!',    tone: 'success', color: '#22c55e' };
  if (pct >= 60) return { label: 'Good effort!',   tone: 'warning', color: '#f59e0b' };
  if (pct >= 40) return { label: 'Keep going!',    tone: 'warning', color: '#f59e0b' };
  return              { label: 'Keep practising', tone: 'danger',  color: '#f43f5e' };
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Question review item ──────────────────────────────────────────

function ReviewItem({ q, idx }: { q: ResultQuestion; idx: number }) {
  const [open, setOpen] = useState(false);

  const isCorrect   = q.isCorrect;
  const marksAwarded = q.marksAwarded ?? 0;
  const maxMarks     = q.marks;

  const statusProps = isCorrect === true
    ? { icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10', border: 'border-emerald-500/20' }
    : isCorrect === false
      ? { icon: XCircle,     cls: 'text-rose-400    bg-rose-500/10',    border: 'border-rose-500/20'    }
      : { icon: MinusCircle, cls: 'text-fg3          bg-surface1',       border: 'border-line'           };

  const StatusIcon = statusProps.icon;

  const yourOptIdx    = q.yourAnswer?.selectedOption ?? null;
  const yourOptLetter = yourOptIdx !== null ? (LETTERS[yourOptIdx] ?? null) : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${statusProps.border}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface1/50 transition"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${statusProps.cls}`}>
          <StatusIcon size={14} />
        </span>
        <span className="flex-1 text-[13px] font-medium text-fg1 line-clamp-1">
          Q{idx + 1}. {q.prompt}
        </span>
        <span className="text-[11px] text-fg3 tabular-nums shrink-0 font-mono">
          {marksAwarded}/{maxMarks}
        </span>
        {isCorrect === null && (
          <Badge tone="warning" dot className="text-[10px] shrink-0">Pending</Badge>
        )}
        {open ? <ChevronUp size={14} className="text-fg3 shrink-0" /> : <ChevronDown size={14} className="text-fg3 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-line/50 space-y-3">
          <p className="text-[13px] text-fg1 leading-relaxed">{q.prompt}</p>

          {/* MCQ options */}
          {(q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && (q.options ?? []).map((opt, i) => {
            const letter    = LETTERS[i] ?? String(i);
            const optText   = typeof opt === 'string' ? opt : opt.text;
            const isCorrectOpt =
              (q.correctOptions?.length ?? 0) > 0
                ? (q.correctOptions ?? []).includes(letter)
                : q.correctAnswer === letter;
            const isYours   = yourOptLetter === letter;

            let cls = 'border-line text-fg3';
            if (isCorrectOpt) cls = 'border-emerald-500/50 bg-emerald-500/8 text-emerald-300';
            else if (isYours) cls = 'border-rose-500/50 bg-rose-500/8 text-rose-300';

            return (
              <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12.5px] ${cls}`}>
                <span className="font-semibold w-5 shrink-0">{letter}.</span>
                <span className="flex-1">{optText}</span>
                {isCorrectOpt && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
                {isYours && !isCorrectOpt && <XCircle size={13} className="text-rose-400 shrink-0" />}
              </div>
            );
          })}

          {/* TRUE_FALSE */}
          {q.type === 'TRUE_FALSE' && (
            <div className="text-[12.5px] text-fg2 space-y-1">
              <p>
                <strong>Correct answer: </strong>
                <span className="text-emerald-300">
                  {q.correctBoolean ? 'True' : 'False'}
                </span>
              </p>
              {q.yourAnswer?.selectedBoolean !== null && q.yourAnswer?.selectedBoolean !== undefined && (
                <p>
                  <strong>Your answer: </strong>
                  <span className={q.isCorrect ? 'text-emerald-300' : 'text-rose-300'}>
                    {q.yourAnswer.selectedBoolean ? 'True' : 'False'}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* FILL_IN_BLANK */}
          {q.type === 'FILL_IN_BLANK' && (
            <div className="text-[12.5px] text-fg2 space-y-1">
              <p>
                <strong>Correct answer: </strong>
                <span className="text-emerald-300">{q.correctAnswer}</span>
              </p>
              {q.yourAnswer?.textAnswer && (
                <p>
                  <strong>Your answer: </strong>
                  <span className={q.isCorrect ? 'text-emerald-300' : 'text-rose-300'}>
                    {q.yourAnswer.textAnswer}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* DESCRIPTIVE */}
          {q.type === 'DESCRIPTIVE' && (
            <div className="space-y-2">
              {q.yourAnswer?.textAnswer ? (
                <div className="p-3 rounded-lg bg-surface1 border border-line text-[12.5px] text-fg1">
                  <span className="font-semibold text-fg2 block mb-1">Your answer:</span>
                  {q.yourAnswer.textAnswer}
                </div>
              ) : (
                <p className="text-[12px] text-fg3 italic">Not answered.</p>
              )}
              {q.modelAnswer && (
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[12.5px] text-fg2">
                  <span className="font-semibold text-emerald-300 block mb-1">Model answer:</span>
                  {q.modelAnswer}
                </div>
              )}
              {isCorrect === null && (
                <div className="flex items-center gap-2 text-[12px] text-amber-300">
                  <AlertTriangle size={13} />
                  Awaiting manual grading by your teacher.
                </div>
              )}
            </div>
          )}

          {/* Unanswered */}
          {!q.yourAnswer && q.type !== 'DESCRIPTIVE' && (
            <p className="text-[12px] text-fg3 italic">You did not answer this question.</p>
          )}

          {/* Explanation */}
          {q.explanation && (
            <div className="p-3 rounded-lg bg-surface1 border border-line text-[12px] text-fg2">
              <span className="font-semibold text-fg1">Explanation: </span>
              {q.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export function AssessmentResultPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const location         = useLocation();
  const navigate         = useNavigate();

  const [result,   setResult]   = useState<SubmissionResult | null>(location.state?.result ?? null);
  const [loading,  setLoading]  = useState(!result);
  const [err,      setErr]      = useState('');

  useEffect(() => {
    if (result || !submissionId) return;
    assessmentTakeApi.getById(submissionId)
      .then((r) => { setResult(r); setLoading(false); })
      .catch(() => { setErr('Could not load results.'); setLoading(false); });
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (err || !result) {
    return (
      <div className="text-center py-20 text-fg3">
        <p>{err || 'Result not found.'}</p>
        <Button className="mt-4" onClick={() => navigate('/student/assessments')}>
          Back to Assessments
        </Button>
      </div>
    );
  }

  const pct              = Math.round(result.percent);
  const { label: gradeLabel, color: gradeColor } = grade(pct);
  const passed           = pct >= (result.assessment.passingMarks > 0
    ? (result.assessment.passingMarks / result.totalMarks) * 100
    : 60);
  const isPending        = result.status === 'SUBMITTED';

  const correct   = result.questions.filter((q) => q.isCorrect === true).length;
  const wrong     = result.questions.filter((q) => q.isCorrect === false).length;
  const unanswered = result.questions.filter((q) => !q.yourAnswer || (
    q.yourAnswer.selectedOption === null &&
    q.yourAnswer.selectedBoolean === null &&
    !q.yourAnswer.textAnswer
  )).length;

  return (
    <div className="max-w-2xl mx-auto pb-10">

      {/* Back button */}
      <button
        onClick={() => navigate('/student/assessments')}
        className="flex items-center gap-1.5 text-[12.5px] text-fg3 hover:text-fg1 transition mb-5"
      >
        <ArrowLeft size={13} />
        Back to Assessments
      </button>

      {/* ── Score hero ─────────────────────────────────────────── */}
      <Card className="p-6 mb-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl"
            style={{ background: `${gradeColor}18` }}
          />
        </div>

        <div className="relative">
          {location.state?.autoSubmitted && (
            <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full mb-4">
              <Clock size={12} />
              Time expired — auto-submitted
            </div>
          )}

          <div
            className="w-24 h-24 rounded-full border-4 grid place-items-center mx-auto mb-4 font-display text-3xl font-semibold"
            style={{ borderColor: gradeColor, color: gradeColor }}
          >
            {isPending ? '—' : `${pct}%`}
          </div>

          <h2 className="font-display text-2xl font-semibold text-fg1 mb-1">
            {isPending ? 'Results Pending' : gradeLabel}
          </h2>

          {isPending ? (
            <p className="text-[13px] text-fg3">
              Some questions need manual grading. Your final score will update once your teacher grades them.
            </p>
          ) : (
            <p className="text-[13px] text-fg3">
              You scored{' '}
              <strong className="text-fg1">{result.score}</strong> out of{' '}
              <strong className="text-fg1">{result.totalMarks}</strong> marks
              {result.assessment.subject && (
                <> · {result.assessment.subject.name}</>
              )}
            </p>
          )}

          {/* Pass / Fail badge */}
          {!isPending && result.assessment.passingMarks > 0 && (
            <div className="mt-3">
              <Badge tone={passed ? 'success' : 'danger'} dot={false}>
                {passed ? '✓ Passed' : '✗ Not passed'}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { icon: CheckCircle2, value: correct,               label: 'Correct',     color: 'text-emerald-400' },
          { icon: XCircle,      value: wrong,                 label: 'Incorrect',   color: 'text-rose-400'    },
          { icon: MinusCircle,  value: unanswered,            label: 'Unanswered',  color: 'text-fg3'         },
          { icon: Clock,        value: fmtTime(result.timeTakenSec), label: 'Time taken', color: 'text-fg2'  },
        ].map(({ icon: Icon, value, label, color }) => (
          <Card key={label} className="p-4 text-center">
            <Icon size={18} className={`${color} mx-auto mb-1.5`} />
            <div className="font-display font-semibold text-[18px] text-fg1">{value}</div>
            <div className="text-[11px] text-fg3 mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {/* Score breakdown */}
      {!isPending && (
        <Card className="p-4 mb-4">
          <div className="flex justify-between text-[12px] text-fg3 mb-2">
            <span>Score breakdown</span>
            <span>{pct}%</span>
          </div>
          <ProgressBar
            value={pct}
            tone={pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'}
          />
          <div className="flex justify-between text-[11px] text-fg3 mt-2">
            <span className="text-emerald-400">✓ {correct} correct</span>
            <span className="text-rose-400">✗ {wrong} wrong</span>
          </div>
        </Card>
      )}

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <Button
          variant="outline"
          icon={BookOpen}
          className="flex-1"
          onClick={() => navigate('/student/assessments')}
        >
          All Assessments
        </Button>
        <Button
          icon={Award}
          variant="soft"
          className="flex-1"
          onClick={() => navigate('/student')}
        >
          Dashboard
        </Button>
      </div>

      {/* ── Question review ─────────────────────────────────────── */}
      <div>
        <h3 className="font-display font-semibold text-[16px] text-fg1 mb-3 flex items-center gap-2">
          <Trophy size={16} className="text-amber-300" />
          Review Answers
        </h3>
        <div className="space-y-2">
          {result.questions.map((q, i) => (
            <ReviewItem key={q.questionId} q={q} idx={i} />
          ))}
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}
