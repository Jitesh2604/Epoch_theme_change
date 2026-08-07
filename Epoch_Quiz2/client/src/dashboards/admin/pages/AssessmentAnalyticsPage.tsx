import { useEffect, useMemo, useState } from 'react';
import {
  Download, Sparkles, TrendingUp, TrendingDown, Users, ClipboardCheck, Clock, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, Select, SearchInput, Table, Pagination, StatCard, Skeleton, EmptyState, useToasts,
} from '../../shared/ui';
import { RankedBarList, TimeSeriesChart, AccuracyDistributionBars } from '../components/DashboardCharts';
import { rollupBy, rollupAccuracy, RollupTable, RankedQuestionsPanel } from '../components/QuestionAnalysisPanels';
import { exportCsv } from '../../../lib/csv';
import { useClasses } from '../../../hooks/useCatalog';
import { useRealSubjects } from '../../../hooks/useSubjects';
import {
  useAssessmentOverview, assessmentAnalyticsApi,
  type AssessmentAnalyticsFilters, type AssessmentTableRow, type AssessmentTrends,
  type AssessmentQuestionOverviewRow,
} from '../../../hooks/useAssessmentAnalytics';
import { classifyQuestionQuality } from '../../../lib/questionQualityClassifier';
import { buildQuestionInsights } from '../../../lib/questionInsightsEngine';
import { buildAssessmentInsights } from '../../../lib/assessmentInsightsEngine';
import { fmtSeconds } from '../../../lib/formatters';
import { AssessmentStudentsModal } from './AssessmentStudentsModal';

/**
 * Admin Analytics — Feature 5: Assessment Analytics.
 *
 * Assessment module only (Assessment/Submission/Answer) — never Practice
 * Olympiad data. One bulk submission-level fetch (assessmentOverview.
 * service.ts) feeds KPIs, the Assessment Performance Table, and Class-wise
 * Performance; one bulk answer-level fetch (assessmentQuestionAnalytics.
 * service.ts) feeds Question Analysis and Subject-wise Performance — both
 * client-side regroupings of one payload, same discipline as Features 3/4.
 * Question Analysis directly reuses classifyQuestionQuality()/
 * buildQuestionInsights() from the Practice-side Question Analytics engine
 * (Feature 4) — the row shape is deliberately identical.
 */

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'participation-desc', label: 'Participation (high–low)' },
  { value: 'averageScore-desc', label: 'Average Score (high–low)' },
  { value: 'passRate-desc', label: 'Pass Rate (high–low)' },
  { value: 'completionTime-asc', label: 'Completion Time (fast–slow)' },
  { value: 'attempts-desc', label: 'Attempts (high–low)' },
  { value: 'name-asc', label: 'Name (A–Z)' },
];

const TIME_BANDS = [
  { band: '< 5 min', maxSec: 300 },
  { band: '5–15 min', maxSec: 900 },
  { band: '15–30 min', maxSec: 1800 },
  { band: '30+ min', maxSec: Infinity },
];

const PAGE_SIZE = 20;

function statusBadgeTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'ARCHIVED') return 'neutral';
  return 'warning';
}

export function AssessmentAnalyticsPage() {
  const { data: classes } = useClasses();
  const { data: subjects } = useRealSubjects();

  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [assessmentFilter, setAssessmentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const serverFilters: AssessmentAnalyticsFilters = {
    classExternalId: classFilter !== 'all' ? classFilter : undefined,
    subjectExternalId: subjectFilter !== 'all' ? subjectFilter : undefined,
    assessmentId: assessmentFilter !== 'all' ? assessmentFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data: overview, loading, error } = useAssessmentOverview(serverFilters);
  const { push, node: toastNode } = useToasts();

  const assessments = overview?.assessments ?? [];
  const classPerformance = overview?.classPerformance ?? [];
  const kpis = overview?.kpis;

  // ── Question-level data — separate bulk fetch, same filters ─────────────
  const [questions, setQuestions] = useState<AssessmentQuestionOverviewRow[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setQuestionsLoading(true);
    assessmentAnalyticsApi.getQuestionOverview(serverFilters)
      .then(data => { if (!cancelled) setQuestions(data); })
      .catch(() => { if (!cancelled) setQuestions([]); })
      .finally(() => { if (!cancelled) setQuestionsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, subjectFilter, assessmentFilter, dateFrom, dateTo]);

  const classifiedQuestions = useMemo(
    () => (questions ?? []).map(q => ({ ...q, quality: classifyQuestionQuality(q) })),
    [questions],
  );

  // ── Trends — eager monthly fetch (AI Insights needs a participation
  //    baseline), refetched on granularity toggle. ───────────────────────
  const [granularity, setGranularity] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [trends, setTrends] = useState<AssessmentTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setTrendsLoading(true);
    assessmentAnalyticsApi.getTrends(granularity, serverFilters)
      .then(data => { if (!cancelled) setTrends(data); })
      .catch(() => { if (!cancelled) setTrends(null); })
      .finally(() => { if (!cancelled) setTrendsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, subjectFilter, assessmentFilter, dateFrom, dateTo, granularity]);

  // ── Client-side filters/sort/search over the assessment table ──────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('participation-desc');
  const [page, setPage] = useState(1);
  const [studentsAssessment, setStudentsAssessment] = useState<AssessmentTableRow | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const assessmentOptions = useMemo(
    () => [{ value: 'all', label: 'All assessments' }, ...assessments.map(a => ({ value: a.assessmentId, label: a.title }))],
    [assessments],
  );
  const classOptions = [{ value: 'all', label: 'All classes' }, ...(classes ?? []).map(c => ({ value: c.id, label: c.name }))];
  const subjectOptions = [{ value: 'all', label: 'All subjects' }, ...(subjects ?? []).map(s => ({ value: s.id, label: s.name }))];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessments.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (q && !(a.title.toLowerCase().includes(q) || a.className.toLowerCase().includes(q) || a.subjectName.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [assessments, search, statusFilter]);

  const sorted = useMemo(() => {
    const [key, dir] = sort.split('-') as [string, 'asc' | 'desc'];
    const mul = dir === 'asc' ? 1 : -1;
    const valueOf = (r: AssessmentTableRow): number | string => {
      switch (key) {
        case 'participation': return r.participationRate;
        case 'averageScore': return r.averageScore;
        case 'passRate': return r.passRate;
        case 'completionTime': return r.averageCompletionTimeSec;
        case 'attempts': return r.totalAttempts;
        case 'name': return r.title.toLowerCase();
        default: return r.participationRate;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return a.title.localeCompare(b.title);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Participation Analytics ──────────────────────────────────────────
  const withAttempts = useMemo(() => assessments.filter(a => a.totalAttempts > 0), [assessments]);
  const highestParticipation = useMemo(
    () => [...assessments].sort((a, b) => b.participationRate - a.participationRate).slice(0, 5).map(a => ({ label: a.title, count: a.participationRate })),
    [assessments],
  );
  const lowestParticipation = useMemo(
    () => [...assessments].filter(a => a.studentsAssigned > 0).sort((a, b) => a.participationRate - b.participationRate).slice(0, 5).map(a => ({ label: a.title, count: a.participationRate })),
    [assessments],
  );
  const highestAbandonment = useMemo(
    () => [...withAttempts]
      .map(a => ({ a, rate: a.totalAttempts > 0 ? Math.round((a.incompleteAttempts / a.totalAttempts) * 100) : 0 }))
      .sort((x, y) => y.rate - x.rate).slice(0, 5)
      .map(({ a, rate }) => ({ label: a.title, count: rate })),
    [withAttempts],
  );

  // ── Subject-wise Performance — rollup of the question array ─────────────
  const subjectRollup = useMemo(
    () => rollupBy(classifiedQuestions, q => q.subjectId, q => q.subjectName),
    [classifiedQuestions],
  );
  const strongestSubjects = useMemo(
    () => [...subjectRollup].sort((a, b) => rollupAccuracy(b) - rollupAccuracy(a)).slice(0, 5).map(r => ({ label: r.label, count: rollupAccuracy(r) })),
    [subjectRollup],
  );
  const weakestSubjects = useMemo(
    () => [...subjectRollup].sort((a, b) => rollupAccuracy(a) - rollupAccuracy(b)).slice(0, 5).map(r => ({ label: r.label, count: rollupAccuracy(r) })),
    [subjectRollup],
  );

  // ── Question Analysis — ranked panels over the classified question array
  const eligibleQuestions = useMemo(() => classifiedQuestions.filter(q => q.totalAttempts > 0), [classifiedQuestions]);
  const mostMissed = useMemo(() => [...eligibleQuestions].sort((a, b) => a.successRatePercent - b.successRatePercent || b.totalAttempts - a.totalAttempts).slice(0, 20), [eligibleQuestions]);
  const easiest = useMemo(() => [...eligibleQuestions].sort((a, b) => b.successRatePercent - a.successRatePercent || b.totalAttempts - a.totalAttempts).slice(0, 20), [eligibleQuestions]);
  const mostSkipped = useMemo(() => [...eligibleQuestions].sort((a, b) => b.skipRatePercent - a.skipRatePercent || b.totalSkipped - a.totalSkipped).slice(0, 20), [eligibleQuestions]);
  const mostAttempted = useMemo(() => [...eligibleQuestions].sort((a, b) => b.totalAttempts - a.totalAttempts).slice(0, 20), [eligibleQuestions]);

  // ── Time Analytics ───────────────────────────────────────────────────
  const timeDistribution = useMemo(() => {
    const withTime = withAttempts.filter(a => a.averageCompletionTimeSec > 0);
    return TIME_BANDS.map(({ band, maxSec }, i) => {
      const minSec = i > 0 ? TIME_BANDS[i - 1].maxSec : 0;
      const count = withTime.filter(a => a.averageCompletionTimeSec > minSec && a.averageCompletionTimeSec <= maxSec).length;
      return { band, count, percentage: withTime.length ? Math.round((count / withTime.length) * 100) : 0 };
    });
  }, [withAttempts]);
  const fastestAssessment = useMemo(() => withAttempts.filter(a => a.averageCompletionTimeSec > 0).sort((a, b) => a.averageCompletionTimeSec - b.averageCompletionTimeSec)[0] ?? null, [withAttempts]);
  const slowestAssessment = useMemo(() => withAttempts.filter(a => a.averageCompletionTimeSec > 0).sort((a, b) => b.averageCompletionTimeSec - a.averageCompletionTimeSec)[0] ?? null, [withAttempts]);

  // ── AI Insights ──────────────────────────────────────────────────────
  const assessmentInsights = useMemo(
    () => buildAssessmentInsights(assessments, classPerformance, classifiedQuestions, trends?.participationOverTime ?? []),
    [assessments, classPerformance, classifiedQuestions, trends],
  );
  const questionInsights = useMemo(() => buildQuestionInsights(classifiedQuestions), [classifiedQuestions]);

  // ── Class comparison ─────────────────────────────────────────────────
  const compareRows = useMemo(() => classPerformance.filter(c => compareIds.has(c.classId ?? '__none__')), [classPerformance, compareIds]);
  const toggleCompare = (key: string) => setCompareIds(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // ── Export ───────────────────────────────────────────────────────────
  const exportHeaders = [
    'Assessment', 'Class', 'Subject', 'Total Questions', 'Students Assigned', 'Students Attempted', 'Students Completed',
    'Participation Rate (%)', 'Average Score', 'Average Percentage (%)', 'Highest Score', 'Lowest Score', 'Median Score',
    'Std Deviation', 'Pass Rate (%)', 'Fail Rate (%)', 'Average Completion Time (s)', 'Status',
  ];
  const exportRows = () => sorted.map(a => [
    a.title, a.className, a.subjectName, a.totalQuestions, a.studentsAssigned, a.studentsAttempted, a.studentsCompleted,
    a.participationRate, a.averageScore, a.averagePercentage, a.highestScore, a.lowestScore, a.medianScore,
    a.stdDeviationScore, a.passRate, a.failRate, a.averageCompletionTimeSec, a.status,
  ]);
  const handleExportCsv = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv('assessment-analytics.csv', exportRows(), exportHeaders);
  };
  const handleExportExcel = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows()]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Assessment Analytics');
    XLSX.writeFile(workbook, 'assessment-analytics.xlsx');
  };

  return (
    <>
      {toastNode}
      <PageHeader
        eyebrow="Analytics · Feature 5"
        title="Assessment Analytics"
        subtitle="Complete analytics for the Assessment module — never mixed with Practice Olympiad data."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search assessment, class, subject…" />
          <Select value={classFilter} onChange={setClassFilter} options={classOptions} />
          <Select value={subjectFilter} onChange={setSubjectFilter} options={subjectOptions} />
          <Select value={assessmentFilter} onChange={setAssessmentFilter} options={assessmentOptions} />
          <Select value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <span className="text-fg4 text-[12px]">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className="ml-auto" />
        </div>
        <div className="text-[12px] text-fg3 mt-3">{loading ? 'Loading…' : `${sorted.length} of ${assessments.length} assessments`}</div>
      </Card>

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>}

      {loading || !kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <StatCard label="Total Assessments" value={kpis.totalAssessments} icon={ClipboardCheck} tone="brand" />
          <StatCard label="Draft" value={kpis.draftAssessments} icon={ClipboardCheck} tone="amber" />
          <StatCard label="Published" value={kpis.publishedAssessments} icon={ClipboardCheck} tone="emerald" />
          <StatCard label="Active" value={kpis.activeAssessments} icon={ClipboardCheck} tone="emerald" />
          <StatCard label="Closed" value={kpis.closedAssessments} icon={ClipboardCheck} tone="violet" />
          <StatCard label="Total Attempts" value={kpis.totalAttempts} icon={Users} tone="brand" />
          <StatCard label="Completed Attempts" value={kpis.completedAttempts} icon={Users} tone="emerald" />
          <StatCard label="Incomplete Attempts" value={kpis.incompleteAttempts} icon={Users} tone="amber" />
          <StatCard label="Average Score" value={kpis.averageScore} icon={TrendingUp} tone="brand" />
          <StatCard label="Average Percentage" value={`${kpis.averagePercentage}%`} icon={TrendingUp} tone="brand" />
          <StatCard label="Avg Completion Time" value={fmtSeconds(kpis.averageCompletionTimeSec)} icon={Clock} tone="violet" />
          <StatCard label="Pass Rate" value={`${kpis.passRate}%`} icon={TrendingUp} tone="emerald" />
        </div>
      )}

      {!loading && (!!assessmentInsights.length || !!questionInsights.length) && (
        <Card className="p-4 mb-5">
          <h3 className="text-[13px] font-semibold text-fg1 mb-2.5 flex items-center gap-1.5"><Sparkles size={14} />AI Insights</h3>
          <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
            {assessmentInsights.map(i => <li key={i.id}>{i.text}</li>)}
            {questionInsights.map(i => <li key={i.id}>{i.text}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Highest Participation</h3>
          {highestParticipation.length ? <RankedBarList items={highestParticipation} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingDown size={14} />Lowest Participation</h3>
          {lowestParticipation.length ? <RankedBarList items={lowestParticipation} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><AlertTriangle size={14} />Highest Abandonment Rate</h3>
          {highestAbandonment.length ? <RankedBarList items={highestAbandonment} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3">Class-wise Performance</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {classPerformance.map(c => {
            const key = c.classId ?? '__none__';
            return (
              <button
                key={key}
                onClick={() => toggleCompare(key)}
                className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
                  compareIds.has(key) ? 'bg-brand text-brand-ink border-transparent' : 'bg-surface1 border-line text-fg2 hover:border-brand/40'
                }`}
              >
                {c.className}
              </button>
            );
          })}
        </div>
        <Table
          columns={[
            { key: 'className', label: 'Class' },
            { key: 'totalAssessments', label: 'Assessments' },
            { key: 'studentsAttempted', label: 'Attempted' },
            { key: 'participationRate', label: 'Participation', render: (c) => `${c.participationRate}%` },
            { key: 'averageScore', label: 'Avg Score' },
            { key: 'averagePercentage', label: 'Avg Accuracy', render: (c) => `${c.averagePercentage}%` },
            { key: 'passRate', label: 'Pass Rate', render: (c) => `${c.passRate}%` },
          ]}
          rows={compareRows.length ? compareRows : classPerformance}
          empty={<div className="text-center py-8 text-fg3 text-[13px]">No class data yet</div>}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Strongest Subjects</h3>
          {strongestSubjects.length ? <RankedBarList items={strongestSubjects} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingDown size={14} />Weakest Subjects</h3>
          {weakestSubjects.length ? <RankedBarList items={weakestSubjects} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
      </div>
      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3">Subject-wise Performance</h3>
        <RollupTable rows={subjectRollup} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <RankedQuestionsPanel title="Most Missed / Hardest Questions" icon={TrendingDown} rows={mostMissed} />
        <RankedQuestionsPanel title="Easiest Questions" icon={TrendingUp} rows={easiest} />
        <RankedQuestionsPanel title="Most Skipped Questions" icon={AlertTriangle} rows={mostSkipped} metricColumn="skip" />
        <RankedQuestionsPanel title="Most Attempted Questions" icon={Users} rows={mostAttempted} metricColumn="attempts" />
      </div>
      {questionsLoading && <div className="mb-5"><Skeleton className="h-20 rounded-2xl" /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Clock size={14} />Time Analytics</h3>
          <div className="space-y-2 text-[12.5px]">
            <div className="flex justify-between"><span className="text-fg3">Fastest Completion</span><span className="font-semibold text-fg1">{fastestAssessment ? `${fastestAssessment.title} · ${fmtSeconds(fastestAssessment.averageCompletionTimeSec)}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-fg3">Slowest Completion</span><span className="font-semibold text-fg1">{slowestAssessment ? `${slowestAssessment.title} · ${fmtSeconds(slowestAssessment.averageCompletionTimeSec)}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-fg3">Platform Average</span><span className="font-semibold text-fg1">{kpis ? fmtSeconds(kpis.averageCompletionTimeSec) : '—'}</span></div>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Time Distribution</h3>
          <AccuracyDistributionBars bands={timeDistribution} />
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-fg1">Assessment Trends</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={granularity === 'weekly' ? 'soft' : 'ghost'} onClick={() => setGranularity('weekly')}>Weekly</Button>
            <Button size="sm" variant={granularity === 'monthly' ? 'soft' : 'ghost'} onClick={() => setGranularity('monthly')}>Monthly</Button>
            <Button size="sm" variant={granularity === 'yearly' ? 'soft' : 'ghost'} onClick={() => setGranularity('yearly')}>Yearly</Button>
          </div>
        </div>
        {trendsLoading || !trends ? (
          <Skeleton className="h-36 rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><p className="text-[11px] text-fg3 mb-1.5">Attempts over time</p><TimeSeriesChart data={trends.attemptsOverTime} colorVar="var(--brand)" /></div>
            <div><p className="text-[11px] text-fg3 mb-1.5">Average score over time</p><TimeSeriesChart data={trends.averageScoreOverTime} /></div>
            <div><p className="text-[11px] text-fg3 mb-1.5">Participation over time</p><TimeSeriesChart data={trends.participationOverTime} colorVar="var(--brand)" /></div>
            <div><p className="text-[11px] text-fg3 mb-1.5">Pass rate over time</p><TimeSeriesChart data={trends.passRateOverTime} /></div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !sorted.length ? (
          <EmptyState icon={ClipboardCheck} title="No assessments match these filters" desc="Try widening your search or clearing a filter." />
        ) : (
          <>
            <Table
              columns={[
                { key: 'title', label: 'Assessment', render: (a: AssessmentTableRow) => <span className="font-semibold text-fg1">{a.title}</span> },
                { key: 'className', label: 'Class' },
                { key: 'subjectName', label: 'Subject' },
                { key: 'totalQuestions', label: 'Questions' },
                { key: 'studentsAssigned', label: 'Assigned' },
                { key: 'studentsAttempted', label: 'Attempted' },
                { key: 'studentsCompleted', label: 'Completed' },
                { key: 'participationRate', label: 'Participation', render: (a: AssessmentTableRow) => `${a.participationRate}%` },
                { key: 'averageScore', label: 'Avg Score' },
                { key: 'averagePercentage', label: 'Avg %', render: (a: AssessmentTableRow) => `${a.averagePercentage}%` },
                { key: 'highestScore', label: 'Highest' },
                { key: 'lowestScore', label: 'Lowest' },
                { key: 'averageCompletionTimeSec', label: 'Avg Time', render: (a: AssessmentTableRow) => fmtSeconds(a.averageCompletionTimeSec) },
                { key: 'status', label: 'Status', render: (a: AssessmentTableRow) => <Badge tone={statusBadgeTone(a.status)}>{a.status}</Badge> },
                { key: 'actions', label: '', render: (a: AssessmentTableRow) => <Button size="sm" variant="ghost" onClick={() => setStudentsAssessment(a)}>View Students</Button> },
              ]}
              rows={pageRows}
            />
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </Card>

      <AssessmentStudentsModal
        assessmentId={studentsAssessment?.assessmentId ?? null}
        assessmentTitle={studentsAssessment?.title ?? ''}
        onClose={() => setStudentsAssessment(null)}
      />
    </>
  );
}
