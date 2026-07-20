import { useState, useEffect } from 'react';
import type { NavigateFn } from '../../types';
import {
  CheckCircle2, XCircle, MinusCircle, Clock, Trophy, RotateCcw,
  BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, Button, Badge, ProgressBar } from '../../dashboards/shared/ui';
import { practiceApi, type PracticeResult, type PracticeResultAnswer } from '../../hooks/usePracticeQuiz';

interface PracticeResultPageProps {
  navigate:  NavigateFn;
  attemptId: string;
}

// ── Grade helper ──────────────────────────────────────────────────

function grade(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: 'Outstanding!',  color: '#22c55e' };
  if (pct >= 75) return { label: 'Great work!',   color: '#22c55e' };
  if (pct >= 60) return { label: 'Good effort!',  color: '#f59e0b' };
  if (pct >= 40) return { label: 'Keep going!',   color: '#f59e0b' };
  return              { label: 'Keep practising', color: '#f43f5e' };
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Question review item ──────────────────────────────────────────

function ReviewItem({ a, idx }: { a: PracticeResultAnswer; idx: number }) {
  const [open, setOpen] = useState(false);

  const iconProps = a.isCorrect === true
    ? { icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10' }
    : a.isCorrect === false
      ? { icon: XCircle,      cls: 'text-rose-400    bg-rose-500/10' }
      : { icon: MinusCircle,  cls: 'text-fg3          bg-surface1' };

  const Icon = iconProps.icon;

  return (
    <div className={`rounded-xl border overflow-hidden ${a.isCorrect === true ? 'border-emerald-500/20' : a.isCorrect === false ? 'border-rose-500/20' : 'border-line'}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface1/50 transition"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${iconProps.cls}`}>
          <Icon size={14} />
        </span>
        <span className="flex-1 text-[13px] font-medium text-fg1 line-clamp-1">
          Q{idx + 1}. {a.question.prompt}
        </span>
        <span className="text-[11px] text-fg3 tabular-nums shrink-0">
          {a.marksAwarded}/{a.question.marks}
        </span>
        {open ? <ChevronUp size={14} className="text-fg3 shrink-0" /> : <ChevronDown size={14} className="text-fg3 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-line/50 space-y-3">
          <p className="text-[13px] text-fg1">{a.question.prompt}</p>

          {/* Options with highlights */}
          {a.question.options.length > 0 && (
            <div className="space-y-1.5">
              {a.question.options.map(opt => {
                const isCorrect = a.correct.correctAnswer === opt.letter ||
                  (a.correct.correctOptions ?? []).includes(opt.letter);
                const isYours   = a.yourAnswer.selectedOption === opt.letter ||
                  (a.yourAnswer.selectedOptions ?? []).includes(opt.letter);
                let cls = 'border-line text-fg3';
                if (isCorrect) cls = 'border-emerald-500/50 bg-emerald-500/8 text-emerald-300';
                else if (isYours) cls = 'border-rose-500/50 bg-rose-500/8 text-rose-300';
                return (
                  <div key={opt.letter} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12.5px] ${cls}`}>
                    <span className="font-semibold w-5 shrink-0">{opt.letter}.</span>
                    <span className="flex-1">{opt.text}</span>
                    {isCorrect && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
                    {isYours && !isCorrect && <XCircle size={13} className="text-rose-400 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}

          {/* T/F */}
          {a.correct.type === 'TRUE_FALSE' && (
            <p className="text-[12.5px] text-fg2">
              <strong>Correct:</strong>{' '}
              <span className="text-emerald-300">{a.correct.correctBoolean ? 'True' : 'False'}</span>
              {a.yourAnswer.selectedOption && (
                <> · <strong>You answered:</strong>{' '}
                <span className={a.isCorrect ? 'text-emerald-300' : 'text-rose-300'}>
                  {a.yourAnswer.selectedOption === 'TRUE' ? 'True' : 'False'}
                </span>
                </>
              )}
            </p>
          )}

          {/* Fill-in-blank */}
          {a.correct.type === 'FILL_IN_BLANK' && (
            <p className="text-[12.5px] text-fg2">
              <strong>Correct:</strong>{' '}
              <span className="text-emerald-300">{a.correct.correctAnswer}</span>
              {a.yourAnswer.textAnswer && (
                <> · <strong>You wrote:</strong>{' '}
                <span className={a.isCorrect ? 'text-emerald-300' : 'text-rose-300'}>
                  {a.yourAnswer.textAnswer}
                </span>
                </>
              )}
            </p>
          )}

          {/* Skipped */}
          {a.yourAnswer.isSkipped && (
            <p className="text-[12px] text-fg3 italic">You skipped this question.</p>
          )}

          {/* Explanation */}
          {a.question.explanation && (
            <div className="p-3 rounded-lg bg-surface1 border border-line text-[12px] text-fg2">
              <span className="font-semibold text-fg1">Explanation: </span>
              {a.question.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export function PracticeResultPage({ navigate, attemptId }: PracticeResultPageProps) {
  const [result,  setResult]  = useState<PracticeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    if (!attemptId) { setErr('Result not found.'); setLoading(false); return; }
    practiceApi.getAttempt(attemptId).then(d => {
      setResult(d as unknown as PracticeResult);
      setLoading(false);
    }).catch(() => {
      setErr('Could not load results.');
      setLoading(false);
    });
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (err || !result) {
    return (
      <div className="container">
        <div className="text-center py-20 text-fg3">
          <p>{err || 'Result not found.'}</p>
          <Button className="mt-4" onClick={() => navigate('play')}>
            Back to Practice
          </Button>
        </div>
      </div>
    );
  }

  const pct = Math.round(result.percent);
  const { label: gradeLabel, color: gradeColor } = grade(pct);

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="max-w-2xl mx-auto">
        {/* ── Score hero ─────────────────────────────────────────── */}
        <Card className="p-6 mb-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl"
              style={{ background: `${gradeColor}18` }} />
          </div>

          <div className="relative">
            <div
              className="w-24 h-24 rounded-full border-4 grid place-items-center mx-auto mb-4 font-display text-3xl font-semibold"
              style={{ borderColor: gradeColor, color: gradeColor }}
            >
              {pct}%
            </div>

            <h2 className="font-display text-2xl font-semibold text-fg1 mb-1">{gradeLabel}</h2>
            <p className="text-[13px] text-fg3">
              You scored <strong className="text-fg1">{result.score}</strong> out of{' '}
              <strong className="text-fg1">{result.totalMarks}</strong> marks
            </p>
          </div>
        </Card>

        {/* ── Stat row ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { icon: CheckCircle2, value: result.correctAnswers, label: 'Correct',  color: 'text-emerald-400' },
            { icon: XCircle,      value: result.wrongAnswers,   label: 'Wrong',    color: 'text-rose-400'    },
            { icon: MinusCircle,  value: result.skipped,        label: 'Skipped',  color: 'text-fg3'         },
            { icon: Clock,        value: fmtTime(result.timeTakenSec), label: 'Time', color: 'text-fg2'    },
          ].map(({ icon: Icon, value, label, color }) => (
            <Card key={label} className="p-4 text-center">
              <Icon size={18} className={`${color} mx-auto mb-1.5`} />
              <div className="font-display font-semibold text-[18px] text-fg1">{value}</div>
              <div className="text-[11px] text-fg3 mt-0.5">{label}</div>
            </Card>
          ))}
        </div>

        {/* Progress bar */}
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
            <span className="text-emerald-400">✓ {result.correctAnswers} correct</span>
            <span className="text-rose-400">✗ {result.wrongAnswers} wrong</span>
          </div>
        </Card>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex gap-3 mb-6">
          <Button
            variant="outline"
            icon={BookOpen}
            className="flex-1"
            onClick={() => navigate('play')}
          >
            New Subject
          </Button>
          <Button
            icon={RotateCcw}
            className="flex-1"
            onClick={() => navigate('play')}
          >
            Play Again
          </Button>
        </div>

        {/* ── Review ─────────────────────────────────────────────── */}
        <div>
          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-amber-300" />
            Question Review
          </h3>
          <div className="space-y-2">
            {result.answers.map((a, i) => (
              <ReviewItem key={a.questionId} a={a} idx={i} />
            ))}
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
