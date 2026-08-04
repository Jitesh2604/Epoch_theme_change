import { ReactNode } from 'react';
import { X, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, Button, ProgressBar } from '../../../dashboards/shared/ui';

/**
 * Shared distraction-free "exam mode" UI for the Practice Olympiad test
 * screens (PracticePlayPage, OlympiadPlayPage), so both stay visually and
 * behaviorally identical instead of drifting apart. Pure presentation —
 * no question flow, submission, or scoring logic lives here.
 */

// ── Header ───────────────────────────────────────────────────────

interface ExamHeaderProps {
  title:       string;
  subject?:    string;
  index:       number; // 0-based
  total:       number;
  timeDisplay: ReactNode;
  timeUrgent?: boolean;
  onExit:      () => void;
}

export function ExamHeader({ title, subject, index, total, timeDisplay, timeUrgent, onExit }: ExamHeaderProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {/* basis-full forces this onto its own row on narrow screens (instead
          of shrinking to near-nothing alongside the time/counter/exit
          controls); sm+ reverts to sharing the row as a normal flex item. */}
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <div className="text-[13px] font-semibold text-fg1 truncate">{title}</div>
        {subject && <div className="text-[11px] text-fg3 truncate">{subject}</div>}
      </div>

      <div className={`flex items-center gap-1.5 text-[12px] font-mono whitespace-nowrap ${
        timeUrgent ? 'text-rose-400' : 'text-fg3'
      }`}>
        <Clock size={13} />
        {timeDisplay}
      </div>

      <span className="text-[12px] text-fg2 font-semibold tabular-nums whitespace-nowrap">
        Question {index + 1} of {total}
      </span>

      <button
        onClick={onExit}
        title="Exit test"
        className="w-8 h-8 grid place-items-center rounded-lg text-fg3 hover:text-fg1 hover:bg-surface1 transition shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Progress bar ─────────────────────────────────────────────────

export function ExamProgressBar({ answered, total }: { answered: number; total: number }) {
  return (
    <div className="mb-5">
      <ProgressBar value={answered} max={total} tone="brand" />
      <div className="flex justify-between mt-1.5 text-[11px] text-fg3">
        <span>{answered} answered</span>
        <span>{total - answered} remaining</span>
      </div>
    </div>
  );
}

// ── Question palette ─────────────────────────────────────────────

interface QuestionPaletteProps {
  total:          number;
  currentIndex:   number;   // 0-based — gets the "current" highlight
  answered:       boolean[]; // length === total
  highestReached: number;   // furthest index visited; indices beyond this are inert
  /** Omit on screens that don't keep per-question history to review (e.g.
   *  OlympiadPlayPage) — the palette then renders as a read-only status strip. */
  onJump?: (index: number) => void;
}

export function QuestionPalette({ total, currentIndex, answered, highestReached, onJump }: QuestionPaletteProps) {
  return (
    <Card className="p-3 mb-4">
      <div className="flex items-center gap-4 mb-2.5 text-[11px] text-fg3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-brand" />Current</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500/60" />Answered</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] border border-line2" />Unanswered</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto flex-wrap">
        {Array.from({ length: total }, (_, i) => {
          const isCurrent  = i === currentIndex;
          const isAnswered = answered[i];
          const reachable  = i <= highestReached;
          let cls = 'border-line2 bg-surface1 text-fg3';
          if (isCurrent)        cls = 'bg-brand text-brand-ink border-transparent';
          else if (isAnswered)  cls = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
          return (
            <button
              key={i}
              onClick={() => reachable && onJump?.(i)}
              disabled={!reachable || !onJump}
              title={`Question ${i + 1}${isAnswered ? ' — answered' : ''}`}
              className={`w-8 h-8 shrink-0 rounded-lg border text-[11.5px] font-semibold grid place-items-center transition disabled:cursor-default ${
                reachable ? '' : 'opacity-40'
              } ${cls}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── Submit confirmation ────────────────────────────────────────────

interface SubmitTestDialogProps {
  open:        boolean;
  answered:    number;
  total:       number;
  submitting:  boolean;
  onKeepGoing: () => void;
  onSubmit:    () => void;
}

export function SubmitTestDialog({ open, answered, total, submitting, onKeepGoing, onSubmit }: SubmitTestDialogProps) {
  if (!open) return null;
  const unanswered = total - answered;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h3 className="font-display font-semibold text-[17px] text-fg1">Submit Test?</h3>
            <p className="text-[12px] text-fg3">This cannot be undone.</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface1 border border-line mb-4 text-[13px]">
          <span className="text-fg3">Answered</span>
          <span className="font-semibold text-fg1">{answered} / {total}</span>
        </div>

        {unanswered > 0 && (
          <div className="flex items-center gap-2 text-[12.5px] text-amber-300 mb-4">
            <AlertTriangle size={14} />
            {unanswered} question{unanswered !== 1 ? 's' : ''} left unanswered
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onKeepGoing} disabled={submitting}>
            Keep Going
          </Button>
          <Button className="flex-1" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Test'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Leave-exam confirmation ───────────────────────────────────────

interface LeaveExamDialogProps {
  open:    boolean;
  onStay:  () => void;
  onLeave: () => void;
}

export function LeaveExamDialog({ open, onStay, onLeave }: LeaveExamDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="p-6 max-w-sm w-full">
        <h3 className="font-display font-semibold text-[17px] text-fg1 mb-2">Leave test?</h3>
        <p className="text-[13px] text-fg3 mb-5">
          Are you sure you want to leave the test? Your progress will be saved, and you can resume it later.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onStay}>
            Continue Test
          </Button>
          <Button variant="danger" className="flex-1" onClick={onLeave}>
            Leave Test
          </Button>
        </div>
      </Card>
    </div>
  );
}
