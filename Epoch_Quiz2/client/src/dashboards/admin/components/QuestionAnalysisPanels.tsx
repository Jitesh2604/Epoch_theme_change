import { Card, Button, Select, Table } from '../../shared/ui';
import type { QuestionOverviewRow } from '../../../hooks/useQuestionAnalytics';
import type { classifyQuestionQuality } from '../../../lib/questionQualityClassifier';

/**
 * Shared question-analysis presentation pieces — extracted from
 * QuestionAnalyticsPage.tsx (Feature 4) once Assessment Analytics
 * (Feature 5) needed the identical ranked-panel/rollup-table UI over a
 * different data source (AssessmentQuestionOverviewRow, which extends
 * QuestionOverviewRow, so it satisfies these signatures unmodified — no
 * generics needed). Pure presentation only; every number rendered here was
 * already computed by the caller (questionAnalytics.service.ts or
 * assessmentQuestionAnalytics.service.ts) or by rollupBy() below, which is
 * itself just re-summing already-additive fields (see either service's
 * header comment for why that's mathematically safe).
 */

export interface Rollup {
  key: string;
  label: string;
  totalQuestions: number;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  totalTimeSpentSec: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function rollupBy<T extends QuestionOverviewRow>(
  questions: T[],
  keyOf: (q: T) => string | null,
  labelOf: (q: T) => string,
): Rollup[] {
  const map = new Map<string, Rollup>();
  for (const q of questions) {
    const key = keyOf(q);
    if (key === null) continue;
    let r = map.get(key);
    if (!r) {
      r = { key, label: labelOf(q), totalQuestions: 0, totalAttempts: 0, totalCorrect: 0, totalWrong: 0, totalSkipped: 0, totalTimeSpentSec: 0 };
      map.set(key, r);
    }
    r.totalQuestions += 1;
    r.totalAttempts += q.totalAttempts;
    r.totalCorrect += q.totalCorrect;
    r.totalWrong += q.totalWrong;
    r.totalSkipped += q.totalSkipped;
    r.totalTimeSpentSec += q.totalTimeSpentSec;
  }
  return [...map.values()];
}

export function rollupAccuracy(r: Rollup): number { const answered = r.totalCorrect + r.totalWrong; return answered > 0 ? round((r.totalCorrect / answered) * 100) : 0; }
export function rollupAvgTime(r: Rollup): number { return r.totalAttempts > 0 ? round(r.totalTimeSpentSec / r.totalAttempts) : 0; }
export function rollupSkipRate(r: Rollup): number { return r.totalAttempts > 0 ? round((r.totalSkipped / r.totalAttempts) * 100) : 0; }

export function RollupTable({ rows, showTotalQuestions, compact }: { rows: Rollup[]; showTotalQuestions?: boolean; compact?: boolean }) {
  if (!rows.length) return <p className="text-[12px] text-fg3">No data yet.</p>;
  return (
    <Table
      columns={[
        { key: 'label', label: '' },
        ...(showTotalQuestions ? [{ key: 'totalQuestions', label: 'Qs', render: (r: Rollup) => r.totalQuestions }] : []),
        { key: 'totalAttempts', label: 'Attempts', render: (r: Rollup) => r.totalAttempts },
        { key: 'accuracy', label: 'Accuracy', render: (r: Rollup) => `${rollupAccuracy(r)}%` },
        ...(compact ? [] : [{ key: 'avgTime', label: 'Avg Time', render: (r: Rollup) => `${rollupAvgTime(r)}s` }]),
        { key: 'skipRate', label: 'Skip Rate', render: (r: Rollup) => `${rollupSkipRate(r)}%` },
      ]}
      rows={rows}
    />
  );
}

export function RankedQuestionsPanel<T extends QuestionOverviewRow & { quality: ReturnType<typeof classifyQuestionQuality> }>({
  title, icon: Icon, rows, sortValue, onSortChange, sortOptions, onOpenTrends, metricColumn,
}: {
  title: string;
  icon: any;
  rows: T[];
  sortValue?: string;
  onSortChange?: (v: string) => void;
  sortOptions?: { value: string; label: string }[];
  /** Omit to hide the per-row action column entirely (e.g. when the caller
   *  has no per-question trends view, only a platform-wide one). */
  onOpenTrends?: (q: T) => void;
  metricColumn?: 'skip' | 'attempts';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-fg1 flex items-center gap-1.5"><Icon size={14} />{title}</h3>
        {sortOptions && sortValue && onSortChange && (
          <Select value={sortValue} onChange={onSortChange} options={sortOptions} className="!h-8 !text-[11px]" />
        )}
      </div>
      {!rows.length ? <p className="text-[12px] text-fg3">No data yet.</p> : (
        <div className="max-h-[320px] overflow-y-auto">
          <Table
            columns={[
              { key: 'promptPreview', label: 'Question', render: (q: T) => <span className="text-fg1 line-clamp-1">{q.promptPreview}</span> },
              { key: 'subjectName', label: 'Subject' },
              { key: 'difficulty', label: 'Difficulty' },
              metricColumn === 'skip'
                ? { key: 'skipRatePercent', label: 'Skip Rate', render: (q: T) => `${q.skipRatePercent}% (${q.totalSkipped})` }
                : metricColumn === 'attempts'
                  ? { key: 'totalAttempts', label: 'Attempts', render: (q: T) => q.totalAttempts }
                  : { key: 'successRatePercent', label: 'Success Rate', render: (q: T) => `${q.successRatePercent}%` },
              ...(onOpenTrends ? [{ key: 'actions', label: '', render: (q: T) => <Button size="sm" variant="ghost" onClick={() => onOpenTrends(q)}>Trends</Button> }] : []),
            ]}
            rows={rows}
          />
        </div>
      )}
    </Card>
  );
}
