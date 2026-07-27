import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, XCircle, MinusCircle, Clock, RotateCcw, ArrowLeft,
  Bookmark, BookmarkCheck, Printer, Sparkles, AlertTriangle, Target, Award,
} from 'lucide-react';
import {
  PageHeader, Card, Button, Skeleton, EmptyState, Select, SearchInput, StatCard, useToasts,
} from '../../shared/ui';
import { StandaloneHeader } from '../../shared/StandaloneHeader';
import { practiceApi, type PracticeResult, type PracticeResultAnswer } from '../../../hooks/usePracticeQuiz';
import { useBookmarks } from '../../../hooks/useBookmarks';
import { classifyMistake } from '../../../lib/mistakeClassification';
import {
  filterAnswers, DEFAULT_ATTEMPT_FILTERS, hasActiveFilters, answerStatus,
  distinctSubjects, distinctQuestionTypes, distinctDifficulties,
  type AttemptFilterState, type AnswerStatus,
} from '../../../lib/attemptFilters';
import { getQuestionTypeLabel } from '../../../lib/questionTypeLabel';
import { fmtDurationHMS, fmtDate } from '../../../lib/formatters';

/**
 * Feature 12: Practice Review & Mistake Analysis — the Review Screen.
 *
 * Fetches the exact same GET /quizzes/attempts/:id endpoint
 * PracticeResultPage.tsx already uses for a freshly-submitted attempt — the
 * only difference is this page is reachable for ANY past submitted
 * attemptId (from Analytics's Attempt History), not just the one just
 * played. No new "get attempt detail" endpoint; buildResult() already
 * returns everything needed per question (see quiz.service.ts).
 */

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <StandaloneHeader subtitle="Practice Review" />
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1200px] w-full mx-auto print:px-0 print:py-0 print:max-w-full">
        {children}
      </main>
    </div>
  );
}

const STATUS_BADGE: Record<AnswerStatus, { icon: any; label: string; cls: string }> = {
  CORRECT: { icon: CheckCircle2, label: 'Correct', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' },
  WRONG:   { icon: XCircle,      label: 'Wrong',   cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' },
  SKIPPED: { icon: MinusCircle,  label: 'Skipped', cls: 'bg-surface2 text-fg3 border-line' },
};

const MISTAKE_BADGE_CLASS = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25';

interface QuestionReviewCardProps {
  answer: PracticeResultAnswer;
  timing: { totalQuestions: number; timeTakenSec: number; timeLimitSec: number | null };
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

function QuestionReviewCard({ answer, timing, isBookmarked, onToggleBookmark }: QuestionReviewCardProps) {
  const status = answerStatus(answer);
  const badge = STATUS_BADGE[status];
  const Icon = badge.icon;
  const mistake = classifyMistake(answer, timing);

  return (
    <Card className="p-5 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${badge.cls}`}>
            <Icon size={12} />{badge.label}
          </span>
          <span className="text-[11px] text-fg3 shrink-0">Q{answer.order}</span>
          {answer.question.subject && (
            <span className="text-[11px] text-fg3 truncate">· {answer.question.subject.name}</span>
          )}
          <span className="text-[11px] text-fg3 shrink-0">· {answer.question.difficulty[0]}{answer.question.difficulty.slice(1).toLowerCase()}</span>
          {answer.timeSpentSec != null && (
            <span className="text-[11px] text-fg3 shrink-0">· {answer.timeSpentSec}s spent</span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleBookmark}
          className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-brand hover:bg-brand-soft transition shrink-0 print:hidden"
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
        >
          {isBookmarked ? <BookmarkCheck size={16} className="text-brand" /> : <Bookmark size={16} />}
        </button>
      </div>

      <p className="text-[13.5px] text-fg1 leading-relaxed mb-3">{answer.question.prompt}</p>

      {answer.question.options.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {answer.question.options.map(opt => {
            const isCorrectOpt = answer.correct.correctAnswer === opt.letter || answer.correct.correctOptions.includes(opt.letter);
            const isYourOpt = answer.yourAnswer.selectedOption === opt.letter || answer.yourAnswer.selectedOptions.includes(opt.letter);
            let cls = 'border-line text-fg2';
            if (isCorrectOpt) cls = 'border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
            else if (isYourOpt) cls = 'border-rose-400/50 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400';
            return (
              <div key={opt.letter} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12.5px] ${cls}`}>
                <span className="font-semibold w-5 shrink-0">{opt.letter}.</span>
                <span className="flex-1">{opt.text}</span>
                {isCorrectOpt && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                {isYourOpt && !isCorrectOpt && <XCircle size={13} className="text-rose-500 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {answer.correct.type === 'TRUE_FALSE' && (
        <p className="text-[12.5px] text-fg2 mb-3">
          <strong className="text-fg1">Correct answer: </strong>{answer.correct.correctBoolean ? 'True' : 'False'}
          {answer.yourAnswer.selectedOption && (
            <> · <strong className="text-fg1">Your answer: </strong>{answer.yourAnswer.selectedOption === 'TRUE' ? 'True' : 'False'}</>
          )}
        </p>
      )}

      {answer.correct.type === 'FILL_IN_BLANK' && (
        <p className="text-[12.5px] text-fg2 mb-3">
          <strong className="text-fg1">Correct answer: </strong>{answer.correct.correctAnswer}
          {answer.yourAnswer.textAnswer && (
            <> · <strong className="text-fg1">Your answer: </strong>{answer.yourAnswer.textAnswer}</>
          )}
        </p>
      )}

      {status === 'SKIPPED' && (
        <p className="text-[12px] text-fg3 italic mb-3">You skipped this question.</p>
      )}

      {mistake && (
        <div className="flex items-start gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${MISTAKE_BADGE_CLASS}`}>
            <AlertTriangle size={11} />{mistake.type}
          </span>
          <p className="text-[11.5px] text-fg3 leading-relaxed">{mistake.explanation}</p>
        </div>
      )}

      {answer.question.explanation && (
        <div className="p-3 rounded-lg bg-surface1 border border-line text-[12px] text-fg2">
          <span className="font-semibold text-fg1">Explanation: </span>{answer.question.explanation}
        </div>
      )}
    </Card>
  );
}

export function PracticeReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { push, node: toastNode } = useToasts();
  const [result, setResult]   = useState<PracticeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filters, setFilters] = useState<AttemptFilterState>(DEFAULT_ATTEMPT_FILTERS);
  const [retrying, setRetrying] = useState(false);
  const { isBookmarked, toggle } = useBookmarks();

  useEffect(() => {
    if (!attemptId) { setError('Attempt not found.'); setLoading(false); return; }
    practiceApi.getAttempt(attemptId)
      .then(d => { setResult(d as unknown as PracticeResult); setLoading(false); })
      .catch((err: any) => { setError(err?.message ?? 'Could not load this attempt.'); setLoading(false); });
  }, [attemptId]);

  const subjectOptions    = useMemo(() => result ? distinctSubjects(result.answers) : [], [result]);
  const typeOptions       = useMemo(() => result ? distinctQuestionTypes(result.answers) : [], [result]);
  const difficultyOptions = useMemo(() => result ? distinctDifficulties(result.answers) : [], [result]);
  const filtered = useMemo(
    () => result ? filterAnswers(result.answers, filters, isBookmarked) : [],
    [result, filters, isBookmarked],
  );

  const handleRetry = async () => {
    if (!attemptId) return;
    setRetrying(true);
    try {
      const attempt = await practiceApi.retryAttempt(attemptId, 'both');
      window.location.href = `/#/play/quiz/${attempt.attemptId}`;
    } catch (err: any) {
      push({ kind: 'danger', title: 'Could not start retry session', sub: err?.message ?? 'Please try again' });
      setRetrying(false);
    }
  };

  const handleToggleBookmark = (questionId: string) => {
    toggle(questionId).catch((err: any) => {
      push({ kind: 'danger', title: 'Could not update bookmark', sub: err?.message ?? 'Please try again' });
    });
  };

  if (loading) {
    return (
      <StandalonePage>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-24" /></Card>)}
        </div>
      </StandalonePage>
    );
  }

  if (error || !result) {
    return (
      <StandalonePage>
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={AlertTriangle} title="Couldn't load this attempt" desc={error || 'Attempt not found.'} />
        </Card>
      </StandalonePage>
    );
  }

  const wrongOrSkippedCount = result.wrongAnswers + result.skipped;

  return (
    <StandalonePage>
      {toastNode}

      <div className="mb-2 print:hidden">
        <a href="/#/analytics" className="inline-flex items-center gap-1.5 text-[12.5px] text-fg3 hover:text-fg1 transition">
          <ArrowLeft size={14} /> Back to Analytics
        </a>
      </div>

      <PageHeader
        eyebrow="Practice Review & Mistake Analysis"
        title={result.quiz.subject?.name ?? (result.quiz.quizType === 'OLYMPIAD' ? 'Practice Olympiad' : 'Mixed Subjects Practice')}
        subtitle={`Attempt #${result.attemptNumber} · ${fmtDate(result.startTime)}`}
      />

      {/* Attempt Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Correct"    value={result.correctAnswers}                    icon={CheckCircle2} tone="emerald" />
        <StatCard label="Wrong"      value={result.wrongAnswers}                      icon={XCircle}      tone="amber"   />
        <StatCard label="Skipped"    value={result.skipped}                           icon={MinusCircle}  tone="violet"  />
        <StatCard label="Accuracy"   value={`${Math.round(result.percent)}%`}         icon={Target}       tone="brand"   />
        <StatCard label="Score"      value={`${result.score}/${result.totalMarks}`}   icon={Award}        tone="brand"   />
        <StatCard label="Time Taken" value={fmtDurationHMS(result.timeTakenSec)}      icon={Clock}        tone="violet"  />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8 print:hidden">
        <Button icon={RotateCcw} onClick={handleRetry} disabled={retrying || wrongOrSkippedCount === 0}>
          {retrying ? 'Starting…' : 'Practice Incorrect Questions Again'}
        </Button>
        <Button variant="outline" icon={Printer} onClick={() => window.print()}>
          Print Review
        </Button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        <SearchInput value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} placeholder="Search questions…" />
        {subjectOptions.length > 1 && (
          <Select
            value={filters.subjectId ?? ''}
            onChange={v => setFilters(f => ({ ...f, subjectId: v || null }))}
            options={[{ value: '', label: 'All Subjects' }, ...subjectOptions.map(s => ({ value: s.id, label: s.name }))]}
          />
        )}
        {typeOptions.length > 1 && (
          <Select
            value={filters.questionType ?? ''}
            onChange={v => setFilters(f => ({ ...f, questionType: v || null }))}
            options={[{ value: '', label: 'All Question Types' }, ...typeOptions.map(t => ({ value: t, label: getQuestionTypeLabel(t) }))]}
          />
        )}
        {difficultyOptions.length > 1 && (
          <Select
            value={filters.difficulty ?? ''}
            onChange={v => setFilters(f => ({ ...f, difficulty: v || null }))}
            options={[{ value: '', label: 'All Difficulties' }, ...difficultyOptions.map(d => ({ value: d, label: d[0] + d.slice(1).toLowerCase() }))]}
          />
        )}
        <Select
          value={filters.status}
          onChange={v => setFilters(f => ({ ...f, status: v as AttemptFilterState['status'] }))}
          options={[
            { value: 'ALL',     label: 'Correct + Wrong + Skipped' },
            { value: 'CORRECT', label: 'Correct Only' },
            { value: 'WRONG',   label: 'Wrong Only' },
            { value: 'SKIPPED', label: 'Skipped Only' },
          ]}
        />
        <button
          type="button"
          onClick={() => setFilters(f => ({ ...f, bookmarkedOnly: !f.bookmarkedOnly }))}
          className={`h-10 px-3.5 rounded-xl border text-[13px] font-semibold transition inline-flex items-center gap-1.5 ${
            filters.bookmarkedOnly ? 'bg-brand-soft border-brand/40 text-brand' : 'bg-surface1 border-line text-fg2 hover:border-line2'
          }`}
        >
          <Bookmark size={14} /> Bookmarked
        </button>
        {hasActiveFilters(filters) && (
          <button type="button" onClick={() => setFilters(DEFAULT_ATTEMPT_FILTERS)} className="text-[12.5px] text-fg3 hover:text-fg1 underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Questions */}
      {filtered.length ? (
        <div className="space-y-4">
          {filtered.map(a => (
            <QuestionReviewCard
              key={a.questionId}
              answer={a}
              timing={{ totalQuestions: result.questionCount, timeTakenSec: result.timeTakenSec, timeLimitSec: result.timeLimitSec }}
              isBookmarked={isBookmarked(a.questionId)}
              onToggleBookmark={() => handleToggleBookmark(a.questionId)}
            />
          ))}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={Sparkles} title="No questions match these filters" desc="Try clearing a filter or search term." />
        </Card>
      )}
    </StandalonePage>
  );
}
