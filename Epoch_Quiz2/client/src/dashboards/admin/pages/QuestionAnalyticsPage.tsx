import { useMemo, useState } from 'react';
import {
  Download, Sparkles, TrendingDown, TrendingUp, SkipForward, Flame, Clock,
  FileQuestion, CheckCircle2, Target, HelpCircle, AlertTriangle, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, Select, SearchInput, Table, Pagination, Skeleton, EmptyState, StatCard, useToasts,
} from '../../shared/ui';
import { exportCsv } from '../../../lib/csv';
import { useAsync } from '../../../hooks/useApi';
import { useQuestionOverview, questionAnalyticsApi, type QuestionOverviewRow } from '../../../hooks/useQuestionAnalytics';
import { assessmentAnalyticsApi } from '../../../hooks/useAssessmentAnalytics';
import { getQuestionTypeLabel } from '../../../lib/questionTypeLabel';
import {
  classifyQuestionQuality, toPerformanceBand, deriveReviewReasons,
  MIN_ATTEMPTS_FOR_CLASSIFICATION, MIN_PEERS_FOR_TIME_COMPARISON,
  type QuestionQualityStatus, type PerformanceBand,
} from '../../../lib/questionQualityClassifier';
import { buildQuestionInsights } from '../../../lib/questionInsightsEngine';
import { QuestionTrendsModal } from './QuestionTrendsModal';
import { rollupBy, rollupAccuracy, rollupAvgTime, rollupSkipRate, RollupTable, RankedQuestionsPanel } from '../components/QuestionAnalysisPanels';

/**
 * Admin Analytics — Feature 4/7: Question Analytics.
 *
 * Feature 4 built this page Practice-Olympiad-only. Feature 7 merges in
 * Assessment's question overview (assessmentQuestionAnalytics.service.ts,
 * Feature 5) — the row shape already matches (AssessmentQuestionOverviewRow
 * extends QuestionOverviewRow by exactly one unused-here field), and
 * QuestionAnalysisPanels.tsx was already built generic specifically for
 * this reuse. Every filter/sort/rollup/ranked-panel below operates on the
 * merged `enriched` array — no shape change needed downstream of the merge.
 */

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: 'All difficulties' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const QUESTION_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'MCQ_SINGLE', label: getQuestionTypeLabel('MCQ_SINGLE') },
  { value: 'MCQ_MULTIPLE', label: getQuestionTypeLabel('MCQ_MULTIPLE') },
  { value: 'TRUE_FALSE', label: getQuestionTypeLabel('TRUE_FALSE') },
  { value: 'FILL_IN_BLANK', label: getQuestionTypeLabel('FILL_IN_BLANK') },
];

const QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All quality statuses' },
  { value: 'Very Difficult', label: 'Very Difficult' },
  { value: 'Needs Review', label: 'Needs Review' },
  { value: 'Average', label: 'Average' },
  { value: 'Good', label: 'Good' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Too Easy', label: 'Too Easy' },
  { value: 'Insufficient Data', label: 'Insufficient Data' },
];

const BAND_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All performance bands' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Average', label: 'Average' },
  { value: 'Difficult', label: 'Difficult' },
  { value: 'Critical', label: 'Critical' },
];

const REVIEW_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any review status' },
  { value: 'flagged', label: 'Flagged for review' },
  { value: 'not-flagged', label: 'Not flagged' },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Practice + Assessment' },
  { value: 'practice', label: 'Practice only' },
  { value: 'assessment', label: 'Assessment only' },
];

const SUCCESS_RATE_MIN_OPTIONS = [
  { value: 'all', label: 'Any success rate' },
  { value: '80', label: '≥ 80%' },
  { value: '60', label: '≥ 60%' },
  { value: '40', label: '≥ 40%' },
];
const SKIP_RATE_MAX_OPTIONS = [
  { value: 'all', label: 'Any skip rate' },
  { value: '10', label: '≤ 10%' },
  { value: '20', label: '≤ 20%' },
  { value: '30', label: '≤ 30%' },
];

const SORT_OPTIONS = [
  { value: 'successRate-asc', label: 'Success Rate (low–high)' },
  { value: 'successRate-desc', label: 'Success Rate (high–low)' },
  { value: 'attempts-desc', label: 'Attempts (high–low)' },
  { value: 'correct-desc', label: 'Correct (high–low)' },
  { value: 'wrong-desc', label: 'Wrong (high–low)' },
  { value: 'time-desc', label: 'Avg Time (slow–fast)' },
  { value: 'skipRate-desc', label: 'Skip Rate (high–low)' },
  { value: 'wrongRate-desc', label: 'Wrong Rate (high–low)' },
  { value: 'difficulty-asc', label: 'Difficulty (easy–hard)' },
  { value: 'subject-asc', label: 'Subject (A–Z)' },
  { value: 'chapter-asc', label: 'Chapter (A–Z)' },
];

const PAGE_SIZE = 20;

function qualityTone(status: QuestionQualityStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'Excellent': return 'success';
    case 'Good': return 'success';
    case 'Average': return 'info';
    case 'Needs Review': return 'warning';
    case 'Very Difficult': return 'danger';
    case 'Too Easy': return 'warning';
    default: return 'neutral';
  }
}

function bandTone(band: PerformanceBand | null): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (band) {
    case 'Excellent': return 'success';
    case 'Good': return 'success';
    case 'Average': return 'info';
    case 'Difficult': return 'warning';
    case 'Critical': return 'danger';
    default: return 'neutral';
  }
}

type SourcedRow = QuestionOverviewRow & { source: 'practice' | 'assessment' };
type ClassifiedRow = SourcedRow & { quality: ReturnType<typeof classifyQuestionQuality> };
type EnrichedRow = ClassifiedRow & {
  band: PerformanceBand | null;
  review: ReturnType<typeof deriveReviewReasons>;
};

export function QuestionAnalyticsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const dateFilters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  const { data: practiceQuestions, loading: practiceLoading, error: practiceError } = useQuestionOverview(dateFilters);
  const { data: assessmentQuestions, loading: assessmentLoading, error: assessmentError } = useAsync(
    () => assessmentAnalyticsApi.getQuestionOverview(dateFilters),
    [dateFrom, dateTo],
  );
  // Bank counts aren't attempt/date-scoped (see questionAnalytics.service.ts's
  // getBankCount) — fetched once, not re-fetched on date-range change.
  const { data: practiceBank } = useAsync(() => questionAnalyticsApi.getBankCount({}), []);
  const { data: assessmentBank } = useAsync(() => assessmentAnalyticsApi.getQuestionBankCount({}), []);

  const { push, node: toastNode } = useToasts();

  const rows: SourcedRow[] = useMemo(() => [
    ...(practiceQuestions ?? []).map(q => ({ ...q, source: 'practice' as const })),
    ...(assessmentQuestions ?? []).map(q => ({ ...q, source: 'assessment' as const })),
  ], [practiceQuestions, assessmentQuestions]);

  // Attach quality classification once per fetch, not per render of every panel.
  const classified: ClassifiedRow[] = useMemo(
    () => rows.map(q => ({ ...q, quality: classifyQuestionQuality(q) })),
    [rows],
  );

  // Peer-group (difficulty + type) average time, reused by deriveReviewReasons
  // below — same technique questionInsightsEngine.ts's 'time-outlier' rule
  // uses, computed once here instead of per-row.
  const peerAvgTimeByGroup = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const q of classified) {
      if (q.totalAttempts < MIN_ATTEMPTS_FOR_CLASSIFICATION) continue;
      const key = `${q.difficulty}::${q.questionType}`;
      const list = groups.get(key) ?? [];
      list.push(q.averageTimeSpentSec);
      groups.set(key, list);
    }
    const result = new Map<string, number>();
    for (const [key, times] of groups) {
      if (times.length < MIN_PEERS_FOR_TIME_COMPARISON) continue;
      result.set(key, times.reduce((s, t) => s + t, 0) / times.length);
    }
    return result;
  }, [classified]);

  const enriched: EnrichedRow[] = useMemo(() => classified.map(q => {
    const peerAvg = peerAvgTimeByGroup.get(`${q.difficulty}::${q.questionType}`) ?? null;
    return { ...q, band: toPerformanceBand(q.quality.status), review: deriveReviewReasons(q, peerAvg) };
  }), [classified, peerAvgTimeByGroup]);

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [qualityFilter, setQualityFilter] = useState('all');
  const [bandFilter, setBandFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [successRateMin, setSuccessRateMin] = useState('all');
  const [skipRateMax, setSkipRateMax] = useState('all');
  const [sort, setSort] = useState('successRate-asc');
  const [page, setPage] = useState(1);
  const [trendsQuestion, setTrendsQuestion] = useState<EnrichedRow | null>(null);

  const handleOpenTrends = (q: EnrichedRow) => {
    if (q.source === 'practice') { setTrendsQuestion(q); return; }
    push({ kind: 'info', title: 'Trends aren’t available for Assessment questions yet' });
  };

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of enriched) if (q.subjectId) map.set(q.subjectId, q.subjectName);
    return [{ value: 'all', label: 'All subjects' }, ...[...map.entries()].map(([value, label]) => ({ value, label }))];
  }, [enriched]);

  const chapterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of enriched) {
      if (!q.chapterId || !q.chapterName) continue;
      if (subjectFilter !== 'all' && q.subjectId !== subjectFilter) continue;
      map.set(q.chapterId, q.chapterName);
    }
    return [{ value: 'all', label: 'All chapters' }, ...[...map.entries()].map(([value, label]) => ({ value, label }))];
  }, [enriched, subjectFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minSuccess = successRateMin === 'all' ? null : Number(successRateMin);
    const maxSkip = skipRateMax === 'all' ? null : Number(skipRateMax);

    return enriched.filter(row => {
      if (q && !(row.questionId.toLowerCase().includes(q) || row.promptPreview.toLowerCase().includes(q))) return false;
      if (subjectFilter !== 'all' && row.subjectId !== subjectFilter) return false;
      if (chapterFilter !== 'all' && row.chapterId !== chapterFilter) return false;
      if (difficultyFilter !== 'all' && row.difficulty !== difficultyFilter) return false;
      if (typeFilter !== 'all' && row.questionType !== typeFilter) return false;
      if (qualityFilter !== 'all' && row.quality.status !== qualityFilter) return false;
      if (bandFilter !== 'all' && row.band !== bandFilter) return false;
      if (reviewFilter === 'flagged' && !row.review.flagged) return false;
      if (reviewFilter === 'not-flagged' && row.review.flagged) return false;
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (minSuccess !== null && row.successRatePercent < minSuccess) return false;
      if (maxSkip !== null && row.skipRatePercent > maxSkip) return false;
      return true;
    });
  }, [enriched, search, subjectFilter, chapterFilter, difficultyFilter, typeFilter, qualityFilter, bandFilter, reviewFilter, sourceFilter, successRateMin, skipRateMax]);

  const sorted = useMemo(() => {
    const [key, dir] = sort.split('-') as [string, 'asc' | 'desc'];
    const mul = dir === 'asc' ? 1 : -1;
    const valueOf = (r: EnrichedRow): number | string => {
      switch (key) {
        case 'successRate': return r.successRatePercent;
        case 'attempts': return r.totalAttempts;
        case 'correct': return r.totalCorrect;
        case 'wrong': return r.totalWrong;
        case 'time': return r.averageTimeSpentSec;
        case 'skipRate': return r.skipRatePercent;
        case 'wrongRate': return r.wrongRatePercent;
        case 'difficulty': return { EASY: 0, MEDIUM: 1, HARD: 2 }[r.difficulty] ?? 0;
        case 'subject': return r.subjectName.toLowerCase();
        case 'chapter': return (r.chapterName ?? '').toLowerCase();
        default: return r.successRatePercent;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return a.questionId.localeCompare(b.questionId);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Ranked panels — Top 20 slices/sorts of the same enriched array. ─────
  const eligible = useMemo(() => enriched.filter(q => q.totalAttempts > 0), [enriched]);

  const [difficultSort, setDifficultSort] = useState<'successRate' | 'wrongRate' | 'skipRate'>('successRate');
  const mostDifficult = useMemo(() => {
    const list = [...eligible];
    if (difficultSort === 'successRate') list.sort((a, b) => a.successRatePercent - b.successRatePercent || b.totalAttempts - a.totalAttempts);
    else if (difficultSort === 'wrongRate') list.sort((a, b) => b.wrongRatePercent - a.wrongRatePercent || b.totalAttempts - a.totalAttempts);
    else list.sort((a, b) => b.skipRatePercent - a.skipRatePercent || b.totalAttempts - a.totalAttempts);
    return list.slice(0, 20);
  }, [eligible, difficultSort]);

  const [easySort, setEasySort] = useState<'successRate' | 'wrongRate'>('successRate');
  const easiest = useMemo(() => {
    const list = [...eligible];
    if (easySort === 'successRate') list.sort((a, b) => b.successRatePercent - a.successRatePercent || b.totalAttempts - a.totalAttempts);
    else list.sort((a, b) => a.wrongRatePercent - b.wrongRatePercent || b.totalAttempts - a.totalAttempts);
    return list.slice(0, 20);
  }, [eligible, easySort]);

  const mostSkipped = useMemo(() => [...eligible].sort((a, b) => b.skipRatePercent - a.skipRatePercent || b.totalSkipped - a.totalSkipped).slice(0, 20), [eligible]);
  const mostAttempted = useMemo(() => [...eligible].sort((a, b) => b.totalAttempts - a.totalAttempts).slice(0, 20), [eligible]);

  // ── Regrouped views ───────────────────────────────────────────────────
  const typePerformance = useMemo(
    () => rollupBy(enriched, q => q.questionType, q => getQuestionTypeLabel(q.questionType)),
    [enriched],
  );
  const mostDifficultType = useMemo(() => typePerformance.length ? [...typePerformance].sort((a, b) => rollupAccuracy(a) - rollupAccuracy(b))[0] : null, [typePerformance]);
  const easiestType = useMemo(() => typePerformance.length ? [...typePerformance].sort((a, b) => rollupAccuracy(b) - rollupAccuracy(a))[0] : null, [typePerformance]);

  const difficultyAnalysis = useMemo(
    () => rollupBy(enriched, q => q.difficulty, q => q.difficulty.charAt(0) + q.difficulty.slice(1).toLowerCase()),
    [enriched],
  );
  const chapterAnalysis = useMemo(
    () => rollupBy(enriched, q => q.chapterId, q => `${q.subjectName} · ${q.chapterName}`),
    [enriched],
  );
  const bestChapters = useMemo(() => [...chapterAnalysis].sort((a, b) => rollupAccuracy(b) - rollupAccuracy(a)).slice(0, 10), [chapterAnalysis]);
  const weakestChapters = useMemo(() => [...chapterAnalysis].sort((a, b) => rollupAccuracy(a) - rollupAccuracy(b)).slice(0, 10), [chapterAnalysis]);

  // Subject-wise Question Analytics — per-subject rollup, plus each
  // subject's hardest/easiest/most-missed chapter re-derived from the
  // already-computed chapterAnalysis rollup (filtered to that subject's
  // chapters via a subjectId lookup built from `enriched`) — no new fetch,
  // no re-summing of raw rows.
  const subjectAnalysis = useMemo(
    () => rollupBy(enriched, q => q.subjectId, q => q.subjectName),
    [enriched],
  );
  const chapterSubjectMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const q of enriched) if (q.chapterId) map.set(q.chapterId, q.subjectId);
    return map;
  }, [enriched]);
  const subjectChapterBreakdown = useMemo(() => subjectAnalysis.map(subj => {
    const chapters = chapterAnalysis.filter(ch => chapterSubjectMap.get(ch.key) === subj.key);
    const hardest = chapters.length ? [...chapters].sort((a, b) => rollupAccuracy(a) - rollupAccuracy(b))[0] : null;
    const easiest = chapters.length ? [...chapters].sort((a, b) => rollupAccuracy(b) - rollupAccuracy(a))[0] : null;
    const mostMissed = chapters.length ? [...chapters].sort((a, b) => rollupSkipRate(b) - rollupSkipRate(a))[0] : null;
    return { subject: subj, hardest, easiest, mostMissed };
  }), [subjectAnalysis, chapterAnalysis, chapterSubjectMap]);

  const insights = useMemo(() => buildQuestionInsights(enriched), [enriched]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalQuestionsInBank = (practiceBank?.count ?? 0) + (assessmentBank?.count ?? 0);
  const questionsAttempted = enriched.length;
  const questionsNeverAttempted = Math.max(0, totalQuestionsInBank - questionsAttempted);
  const avgSuccessRate = questionsAttempted ? Math.round(enriched.reduce((s, q) => s + q.successRatePercent, 0) / questionsAttempted) : 0;
  const avgSkipRate = questionsAttempted ? Math.round(enriched.reduce((s, q) => s + q.skipRatePercent, 0) / questionsAttempted) : 0;
  const difficultQuestionsCount = enriched.filter(q => q.band === 'Difficult' || q.band === 'Critical').length;
  const easyQuestionsCount = enriched.filter(q => q.band === 'Excellent').length;
  const flaggedForReviewCount = enriched.filter(q => q.review.flagged).length;

  // ── Export ───────────────────────────────────────────────────────────────
  const exportHeaders = [
    'Question ID', 'Source', 'Preview', 'Subject', 'Chapter', 'Difficulty', 'Type',
    'Total Attempts', 'Total Correct', 'Total Wrong', 'Total Skipped',
    'Success Rate (%)', 'Avg Time Spent (s)', 'Quality Status', 'Performance Band',
    'Review Status', 'Review Reasons',
  ];
  const exportRows = () => sorted.map(q => [
    q.questionId, q.source === 'practice' ? 'Practice' : 'Assessment', q.promptPreview, q.subjectName, q.chapterName ?? '—', q.difficulty, getQuestionTypeLabel(q.questionType),
    q.totalAttempts, q.totalCorrect, q.totalWrong, q.totalSkipped,
    q.successRatePercent, q.averageTimeSpentSec, q.quality.status, q.band ?? '—',
    q.review.flagged ? 'Flagged' : 'Not Flagged', q.review.reasons.join('; '),
  ]);
  const handleExportCsv = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv('question-analytics.csv', exportRows(), exportHeaders);
  };
  const handleExportExcel = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows()]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Question Analytics');
    XLSX.writeFile(workbook, 'question-analytics.xlsx');
  };

  const loading = practiceLoading || assessmentLoading;
  const error = practiceError ?? assessmentError;

  return (
    <>
      {toastNode}
      <PageHeader
        eyebrow="Analytics · Feature 7"
        title="Question Analytics"
        subtitle="Platform-wide Practice Olympiad and Assessment performance, grouped by individual question."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Questions" value={totalQuestionsInBank} icon={FileQuestion} tone="brand" />
        <StatCard label="Questions Attempted" value={questionsAttempted} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Avg Success Rate" value={`${avgSuccessRate}%`} icon={Target} tone="emerald" />
        <StatCard label="Avg Skip Rate" value={`${avgSkipRate}%`} icon={SkipForward} tone="amber" />
        <StatCard label="Difficult Questions" value={difficultQuestionsCount} icon={TrendingDown} tone="amber" />
        <StatCard label="Easy Questions" value={easyQuestionsCount} icon={TrendingUp} tone="emerald" />
        <StatCard label="Never Attempted" value={questionsNeverAttempted} icon={HelpCircle} tone="violet" />
        <StatCard label="Flagged for Review" value={flaggedForReviewCount} icon={AlertTriangle} tone="amber" />
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search question id or text…" />
          <Select value={sourceFilter} onChange={v => { setSourceFilter(v); setPage(1); }} options={SOURCE_OPTIONS} />
          <Select value={subjectFilter} onChange={v => { setSubjectFilter(v); setChapterFilter('all'); setPage(1); }} options={subjectOptions} />
          <Select value={chapterFilter} onChange={v => { setChapterFilter(v); setPage(1); }} options={chapterOptions} />
          <Select value={difficultyFilter} onChange={v => { setDifficultyFilter(v); setPage(1); }} options={DIFFICULTY_OPTIONS} />
          <Select value={typeFilter} onChange={v => { setTypeFilter(v); setPage(1); }} options={QUESTION_TYPE_OPTIONS} />
          <Select value={qualityFilter} onChange={v => { setQualityFilter(v); setPage(1); }} options={QUALITY_OPTIONS} />
          <Select value={bandFilter} onChange={v => { setBandFilter(v); setPage(1); }} options={BAND_OPTIONS} />
          <Select value={reviewFilter} onChange={v => { setReviewFilter(v); setPage(1); }} options={REVIEW_OPTIONS} />
          <Select value={successRateMin} onChange={v => { setSuccessRateMin(v); setPage(1); }} options={SUCCESS_RATE_MIN_OPTIONS} />
          <Select value={skipRateMax} onChange={v => { setSkipRateMax(v); setPage(1); }} options={SKIP_RATE_MAX_OPTIONS} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <span className="text-fg4 text-[12px]">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className="ml-auto" />
        </div>
        <div className="text-[12px] text-fg3 mt-3">{loading ? 'Loading…' : `${sorted.length} of ${enriched.length} questions`}</div>
      </Card>

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>}

      {!loading && !!insights.length && (
        <Card className="p-4 mb-5">
          <h3 className="text-[13px] font-semibold text-fg1 mb-2.5 flex items-center gap-1.5"><Sparkles size={14} />AI Insights</h3>
          <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
            {insights.map(i => <li key={i.id}>{i.text}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <RankedQuestionsPanel
          title="Most Difficult Questions"
          icon={TrendingDown}
          rows={mostDifficult}
          sortValue={difficultSort}
          onSortChange={v => setDifficultSort(v as typeof difficultSort)}
          sortOptions={[
            { value: 'successRate', label: 'Lowest Success Rate' },
            { value: 'wrongRate', label: 'Highest Wrong Rate' },
            { value: 'skipRate', label: 'Highest Skip Rate' },
          ]}
          onOpenTrends={handleOpenTrends}
        />
        <RankedQuestionsPanel
          title="Easiest Questions"
          icon={TrendingUp}
          rows={easiest}
          sortValue={easySort}
          onSortChange={v => setEasySort(v as typeof easySort)}
          sortOptions={[
            { value: 'successRate', label: 'Highest Success Rate' },
            { value: 'wrongRate', label: 'Lowest Wrong Rate' },
          ]}
          onOpenTrends={handleOpenTrends}
        />
        <RankedQuestionsPanel title="Most Skipped Questions" icon={SkipForward} rows={mostSkipped} onOpenTrends={handleOpenTrends} metricColumn="skip" />
        <RankedQuestionsPanel title="Most Attempted Questions" icon={Flame} rows={mostAttempted} onOpenTrends={handleOpenTrends} metricColumn="attempts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-2">Question Type Performance</h3>
          {(mostDifficultType || easiestType) && (
            <p className="text-[11.5px] text-fg3 mb-2">
              {mostDifficultType && <>Most difficult: <strong className="text-fg1">{mostDifficultType.label}</strong> ({rollupAccuracy(mostDifficultType)}%). </>}
              {easiestType && <>Easiest: <strong className="text-fg1">{easiestType.label}</strong> ({rollupAccuracy(easiestType)}%).</>}
            </p>
          )}
          <RollupTable rows={typePerformance} />
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Difficulty Analysis</h3>
          <RollupTable rows={difficultyAnalysis} showTotalQuestions />
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Clock size={14} />Chapter Analysis</h3>
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3 mb-1.5">Best Performing</p>
          <RollupTable rows={bestChapters} compact />
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3 mt-3 mb-1.5">Weakest</p>
          <RollupTable rows={weakestChapters} compact />
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Layers size={14} />Subject-wise Question Analytics</h3>
        {subjectChapterBreakdown.length ? (
          <div className="overflow-x-auto">
            <Table
              columns={[
                { key: 'label', label: 'Subject' },
                { key: 'success', label: 'Avg Success', render: (r: typeof subjectChapterBreakdown[number]) => `${rollupAccuracy(r.subject)}%` },
                { key: 'time', label: 'Avg Time', render: (r: typeof subjectChapterBreakdown[number]) => `${rollupAvgTime(r.subject)}s` },
                { key: 'hardest', label: 'Hardest Chapter', render: (r: typeof subjectChapterBreakdown[number]) => r.hardest ? `${r.hardest.label.split(' · ')[1] ?? r.hardest.label} (${rollupAccuracy(r.hardest)}%)` : '—' },
                { key: 'easiest', label: 'Easiest Chapter', render: (r: typeof subjectChapterBreakdown[number]) => r.easiest ? `${r.easiest.label.split(' · ')[1] ?? r.easiest.label} (${rollupAccuracy(r.easiest)}%)` : '—' },
                { key: 'mostMissed', label: 'Most Missed Chapter', render: (r: typeof subjectChapterBreakdown[number]) => r.mostMissed ? `${r.mostMissed.label.split(' · ')[1] ?? r.mostMissed.label} (${rollupSkipRate(r.mostMissed)}% skipped)` : '—' },
              ]}
              rows={subjectChapterBreakdown.map(r => ({ ...r, label: r.subject.label }))}
            />
          </div>
        ) : <p className="text-[12px] text-fg3">No subject data yet.</p>}
      </Card>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3">Chapter Analytics</h3>
        {chapterAnalysis.length ? (
          <div className="max-h-[400px] overflow-y-auto">
            <Table
              columns={[
                { key: 'label', label: 'Chapter' },
                { key: 'totalQuestions', label: 'Total Questions', render: (r: typeof chapterAnalysis[number]) => r.totalQuestions },
                { key: 'totalAttempts', label: 'Attempts', render: (r: typeof chapterAnalysis[number]) => r.totalAttempts },
                { key: 'accuracy', label: 'Success Rate', render: (r: typeof chapterAnalysis[number]) => `${rollupAccuracy(r)}%` },
                { key: 'skipRate', label: 'Skip Rate', render: (r: typeof chapterAnalysis[number]) => `${rollupSkipRate(r)}%` },
                { key: 'avgTime', label: 'Avg Time', render: (r: typeof chapterAnalysis[number]) => `${rollupAvgTime(r)}s` },
                {
                  key: 'band', label: 'Difficulty Rating',
                  render: (r: typeof chapterAnalysis[number]) => {
                    const status = classifyQuestionQuality({ totalAttempts: r.totalAttempts, successRatePercent: rollupAccuracy(r), skipRatePercent: rollupSkipRate(r) }).status;
                    const band = toPerformanceBand(status);
                    return band ? <Badge tone={bandTone(band)}>{band}</Badge> : <span className="text-fg3">—</span>;
                  },
                },
              ]}
              rows={chapterAnalysis}
            />
          </div>
        ) : <p className="text-[12px] text-fg3">No chapter data yet.</p>}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !sorted.length ? (
          <EmptyState icon={Sparkles} title="No questions match these filters" desc="Try widening your search or clearing a filter." />
        ) : (
          <>
            <Table
              columns={[
                { key: 'questionId', label: 'ID', render: (q: EnrichedRow) => <span className="font-mono text-[11px] text-fg3" title={q.questionId}>{q.questionId.slice(0, 8)}…</span> },
                { key: 'source', label: 'Source', render: (q: EnrichedRow) => <Badge tone={q.source === 'practice' ? 'info' : 'neutral'}>{q.source === 'practice' ? 'Practice' : 'Assessment'}</Badge> },
                { key: 'promptPreview', label: 'Preview', render: (q: EnrichedRow) => <span className="text-fg1">{q.promptPreview}</span> },
                { key: 'subjectName', label: 'Subject' },
                { key: 'chapterName', label: 'Chapter', render: (q: EnrichedRow) => q.chapterName ?? '—' },
                { key: 'difficulty', label: 'Difficulty' },
                { key: 'questionType', label: 'Type', render: (q: EnrichedRow) => getQuestionTypeLabel(q.questionType) },
                { key: 'totalAttempts', label: 'Attempts', render: (q: EnrichedRow) => <span className="font-mono">{q.totalAttempts}</span> },
                { key: 'totalCorrect', label: 'Correct', render: (q: EnrichedRow) => <span className="font-mono">{q.totalCorrect}</span> },
                { key: 'totalWrong', label: 'Wrong', render: (q: EnrichedRow) => <span className="font-mono">{q.totalWrong}</span> },
                { key: 'totalSkipped', label: 'Skipped', render: (q: EnrichedRow) => <span className="font-mono">{q.totalSkipped}</span> },
                { key: 'successRatePercent', label: 'Success Rate', render: (q: EnrichedRow) => <span className="font-mono">{q.successRatePercent}%</span> },
                { key: 'averageTimeSpentSec', label: 'Avg Time', render: (q: EnrichedRow) => <span className="font-mono">{q.averageTimeSpentSec}s</span> },
                {
                  key: 'band', label: 'Performance Band',
                  render: (q: EnrichedRow) => q.band === null ? <span className="text-fg3">—</span> : <Badge tone={bandTone(q.band)}>{q.band}</Badge>,
                },
                {
                  key: 'review', label: 'Review Status',
                  render: (q: EnrichedRow) => (
                    <span title={q.review.reasons.join(' ')}>
                      <Badge tone={q.review.flagged ? 'danger' : 'success'}>{q.review.flagged ? 'Flagged' : 'OK'}</Badge>
                    </span>
                  ),
                },
                {
                  key: 'quality', label: 'Quality Status',
                  render: (q: EnrichedRow) => (
                    <span title={q.quality.reason}>
                      <Badge tone={qualityTone(q.quality.status)}>{q.quality.status}</Badge>
                    </span>
                  ),
                },
                {
                  key: 'actions', label: '',
                  render: (q: EnrichedRow) => <Button size="sm" variant="ghost" onClick={() => handleOpenTrends(q)}>Trends</Button>,
                },
              ]}
              rows={pageRows}
            />
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </Card>

      <QuestionTrendsModal
        question={trendsQuestion}
        onClose={() => setTrendsQuestion(null)}
      />
    </>
  );
}
