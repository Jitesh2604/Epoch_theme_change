import { useEffect, useMemo, useState } from 'react';
import {
  Download, School, Activity, Award, Target, ClipboardCheck, AlertTriangle,
  TrendingUp, Flame, Layers, Sparkles, Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, StatCard, SearchInput, Select,
  Table, Pagination, Skeleton, EmptyState, useToasts,
} from '../../shared/ui';
import { RankedBarList } from '../components/DashboardCharts';
import { exportCsv } from '../../../lib/csv';
import { useStudentCandidates, studentPerformanceApi, type StudentBulkInsight } from '../../../hooks/useStudentPerformance';
import { useAssessmentOverview, assessmentAnalyticsApi } from '../../../hooks/useAssessmentAnalytics';
import type { PracticeOverviewData } from '../../../hooks/useStudentAnalytics';
import { buildRow, daysSince, ACTIVE_WINDOW_DAYS, type StudentRow } from '../../../lib/studentRowBuilder';
import { practiceDatesFromOverview } from '../../../lib/studyPlanEngine';
import { computePracticeFrequency } from '../../../lib/consistencyEngine';
import { buildClassAnalyticsRows, type ClassAnalyticsRow } from '../../../lib/classAnalyticsAggregation';
import { buildClassInsights } from '../../../lib/classInsightsEngine';
import { sortByClassName } from '../../../lib/classOrder';
import { ClassTrendsModal } from './ClassTrendsModal';

/**
 * Admin Analytics — Feature 8: Class Analytics.
 *
 * Zero new backend calls: reuses Feature 6's exact student roster + bulk
 * insights fetch (buildRow(), now shared via studentRowBuilder.ts) and
 * Feature 5's exact classPerformance rollup (useAssessmentOverview) —
 * classAnalyticsAggregation.ts only groups those already-computed numbers
 * by class. See PLAN for the full reuse rationale.
 */

const GRADE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any grade' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Average', label: 'Average' },
  { value: 'Needs Improvement', label: 'Needs Improvement' },
  { value: 'At Risk', label: 'At Risk' },
];
const RISK_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any risk level' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'on-track', label: 'On track' },
];
const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any activity status' },
  { value: 'active', label: `Has active students (≤ ${ACTIVE_WINDOW_DAYS}d)` },
  { value: 'inactive', label: 'No active students' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'overallScore-desc', label: 'Overall Score (high–low)' },
  { value: 'practiceAverage-desc', label: 'Practice Average (high–low)' },
  { value: 'assessmentAverage-desc', label: 'Assessment Average (high–low)' },
  { value: 'accuracy-desc', label: 'Accuracy (high–low)' },
  { value: 'activeStudents-desc', label: 'Active Students (high–low)' },
  { value: 'participation-desc', label: 'Participation (high–low)' },
  { value: 'trend-desc', label: 'Trend (improving first)' },
  { value: 'name-asc', label: 'Name (A–Z)' },
];

const PAGE_SIZE = 20;

function gradeTone(grade: string | null): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (grade) {
    case 'Excellent': case 'Good': return 'success';
    case 'Average': return 'info';
    case 'Needs Improvement': return 'warning';
    case 'At Risk': return 'danger';
    default: return 'neutral';
  }
}
function trendTone(trend: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  return trend === 'Improving' ? 'success' : trend === 'Declining' ? 'danger' : 'neutral';
}

export function ClassAnalyticsPage() {
  const { data: candidates, loading: candidatesLoading, error: candidatesError } = useStudentCandidates();
  const { data: assessmentOverview, loading: assessmentLoading, error: assessmentError } = useAssessmentOverview({});

  const [insights, setInsights] = useState<StudentBulkInsight[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const { push, node: toastNode } = useToasts();

  useEffect(() => {
    if (!candidates) return;
    if (!candidates.length) { setInsights([]); return; }
    let cancelled = false;
    setInsightsLoading(true);
    setInsightsError(null);
    studentPerformanceApi.getBulkInsights(candidates.map(c => c.id))
      .then(data => { if (!cancelled) setInsights(data); })
      .catch(e => { if (!cancelled) setInsightsError(e?.message ?? 'Could not load student analytics'); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [candidates]);

  // Platform-wide assessment participation trend — one extra lazy call, not
  // per-class (see classInsightsEngine.ts's header for why).
  const [participationTrendLine, setParticipationTrendLine] = useState<string | null>(null);
  useEffect(() => {
    assessmentAnalyticsApi.getTrends('weekly', {})
      .then(trends => {
        const pts = trends.participationOverTime;
        if (pts.length < 2) return;
        const last = pts[pts.length - 1].count;
        const prev = pts[pts.length - 2].count;
        if (prev > 0 && last < prev) {
          const dropPercent = Math.round(((prev - last) / prev) * 100);
          setParticipationTrendLine(`Assessment participation dropped ${dropPercent}% this week.`);
        } else if (prev > 0 && last > prev) {
          const risePercent = Math.round(((last - prev) / prev) * 100);
          setParticipationTrendLine(`Assessment participation grew ${risePercent}% this week.`);
        }
      })
      .catch(() => { /* non-critical — insights card simply omits this line */ });
  }, []);

  const studentRows: StudentRow[] = useMemo(() => {
    if (!candidates) return [];
    const byId = new Map((insights ?? []).map(i => [i.studentId, i]));
    return candidates.map(c => buildRow(c, byId.get(c.id)));
  }, [candidates, insights]);

  const classRows: ClassAnalyticsRow[] = useMemo(
    () => buildClassAnalyticsRows(studentRows, assessmentOverview?.classPerformance ?? []),
    [studentRows, assessmentOverview],
  );

  const insightLines = useMemo(() => {
    const lines = buildClassInsights(classRows);
    return participationTrendLine ? [...lines, participationTrendLine] : lines;
  }, [classRows, participationTrendLine]);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('overallScore-desc');
  const [page, setPage] = useState(1);
  const [trendsClassId, setTrendsClassId] = useState<string | null>(null);
  const [trendsClassName, setTrendsClassName] = useState('');

  const classOptions = useMemo(() => [
    { value: 'all', label: 'All classes' },
    ...sortByClassName(classRows.map(r => ({ value: r.classId, label: r.className })), o => o.label),
  ], [classRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classRows.filter(r => {
      if (q && !r.className.toLowerCase().includes(q)) return false;
      if (classFilter !== 'all' && r.classId !== classFilter) return false;
      if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false;
      if (riskFilter === 'at-risk' && !r.atRisk) return false;
      if (riskFilter === 'on-track' && r.atRisk) return false;
      if (activityFilter === 'active' && r.activeStudents === 0) return false;
      if (activityFilter === 'inactive' && r.activeStudents > 0) return false;
      return true;
    });
  }, [classRows, search, classFilter, gradeFilter, riskFilter, activityFilter]);

  const sorted = useMemo(() => {
    const dashIdx = sort.lastIndexOf('-');
    const key = sort.slice(0, dashIdx);
    const dir = sort.slice(dashIdx + 1) as 'asc' | 'desc';
    const mul = dir === 'asc' ? 1 : -1;
    const trendRank = (r: ClassAnalyticsRow) => r.practiceTrendDirection === 'Improving' ? 1 : r.practiceTrendDirection === 'Declining' ? -1 : 0;
    const valueOf = (r: ClassAnalyticsRow): number | string => {
      switch (key) {
        case 'overallScore': return r.overallScorePercent ?? -1;
        case 'practiceAverage': return r.practiceAverage ?? -1;
        case 'assessmentAverage': return r.assessmentAverage ?? -1;
        case 'accuracy': return r.accuracyPercent ?? -1;
        case 'activeStudents': return r.activeStudents;
        case 'participation': return r.assessmentParticipationRate ?? -1;
        case 'trend': return trendRank(r);
        case 'name': return r.className.toLowerCase();
        default: return r.overallScorePercent ?? -1;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return a.className.localeCompare(b.className);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalClasses = classRows.length;
  const activeClasses = classRows.filter(r => r.activeStudents > 0).length;
  const withPracticeAvg = classRows.filter(r => r.practiceAverage !== null);
  const withAssessmentAvg = classRows.filter(r => r.assessmentAverage !== null);
  const avgPracticeScore = withPracticeAvg.length ? Math.round((withPracticeAvg.reduce((s, r) => s + r.practiceAverage!, 0) / withPracticeAvg.length) * 100) / 100 : 0;
  const avgAssessmentScore = withAssessmentAvg.length ? Math.round((withAssessmentAvg.reduce((s, r) => s + r.assessmentAverage!, 0) / withAssessmentAvg.length) * 100) / 100 : 0;
  const totalPracticeAttempts = classRows.reduce((s, r) => s + r.practiceAttempts, 0);
  const totalAssessmentAttempts = classRows.reduce((s, r) => s + r.assessmentAttempts, 0);
  const withOverall = classRows.filter(r => r.overallScorePercent !== null);
  const bestClass = withOverall.length ? withOverall.reduce((a, b) => (b.overallScorePercent! > a.overallScorePercent! ? b : a)) : null;
  const lowestClass = withOverall.length ? withOverall.reduce((a, b) => (b.overallScorePercent! < a.overallScorePercent! ? b : a)) : null;

  // ── Rankings ─────────────────────────────────────────────────────────────
  const rankBy = (valueOf: (r: ClassAnalyticsRow) => number | null) =>
    [...classRows].filter(r => valueOf(r) !== null).sort((a, b) => valueOf(b)! - valueOf(a)!).slice(0, 5)
      .map(r => ({ label: r.className, count: valueOf(r)! }));
  const rankOverall = useMemo(() => rankBy(r => r.overallScorePercent), [classRows]);
  const rankPractice = useMemo(() => rankBy(r => r.practiceAverage), [classRows]);
  const rankAssessment = useMemo(() => rankBy(r => r.assessmentAverage), [classRows]);
  const rankAccuracy = useMemo(() => rankBy(r => r.accuracyPercent), [classRows]);
  const rankParticipation = useMemo(() => rankBy(r => r.assessmentParticipationRate), [classRows]);

  const mostActive = useMemo(
    () => [...classRows].filter(r => r.totalStudents > 0)
      .sort((a, b) => (b.activeStudents / b.totalStudents) - (a.activeStudents / a.totalStudents)).slice(0, 5)
      .map(r => ({ label: r.className, count: Math.round((r.activeStudents / r.totalStudents) * 100) })),
    [classRows],
  );
  const mostImproved = useMemo(
    () => [...classRows].filter(r => r.practiceTrendDeltaPercent !== null && r.practiceTrendDeltaPercent > 0)
      .sort((a, b) => b.practiceTrendDeltaPercent! - a.practiceTrendDeltaPercent!).slice(0, 5)
      .map(r => ({ label: r.className, count: r.practiceTrendDeltaPercent! })),
    [classRows],
  );

  const atRiskClasses = useMemo(() => classRows.filter(r => r.atRisk), [classRows]);

  // ── Activity Analytics (platform-wide, from already-fetched studentRows) ─
  const now = Date.now();
  const dau = useMemo(() => studentRows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 0; }).length, [studentRows, now]);
  const wau = useMemo(() => studentRows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 7; }).length, [studentRows, now]);
  const mau = useMemo(() => studentRows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 30; }).length, [studentRows, now]);
  const avgSessionsPerWeek = useMemo(() => {
    if (!insights?.length) return 0;
    const freqs = insights.filter(i => i.overview.hasData === true)
      .map(i => computePracticeFrequency(i.overview as PracticeOverviewData, practiceDatesFromOverview(i.overview as PracticeOverviewData)).avgSessionsPerWeek);
    return freqs.length ? Math.round((freqs.reduce((s, v) => s + v, 0) / freqs.length) * 10) / 10 : 0;
  }, [insights]);
  const avgAssessmentParticipation = useMemo(() => {
    const withRate = classRows.filter(r => r.assessmentParticipationRate !== null);
    return withRate.length ? Math.round(withRate.reduce((s, r) => s + r.assessmentParticipationRate!, 0) / withRate.length) : 0;
  }, [classRows]);

  // ── Export ───────────────────────────────────────────────────────────────
  const exportHeaders = [
    'Class', 'Students', 'Active Students', 'Practice Attempts', 'Assessment Attempts',
    'Practice Average', 'Assessment Average', 'Overall Score', 'Accuracy (%)', 'Avg Time/Question (s)',
    'Performance Grade', 'Risk Level', 'Trend',
  ];
  const exportRows = () => sorted.map(r => [
    r.className, r.totalStudents, r.activeStudents, r.practiceAttempts, r.assessmentAttempts,
    r.practiceAverage ?? '', r.assessmentAverage ?? '', r.overallScorePercent ?? '', r.accuracyPercent ?? '',
    r.avgTimePerQuestionSec ?? '', r.grade ?? 'No data', r.atRisk ? 'At Risk' : 'On Track', r.practiceTrendDirection ?? '',
  ]);
  const handleExportCsv = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv('class-analytics.csv', exportRows(), exportHeaders);
  };
  const handleExportExcel = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows()]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Class Analytics');
    XLSX.writeFile(workbook, 'class-analytics.xlsx');
  };

  const loading = candidatesLoading || insightsLoading || assessmentLoading;
  const error = candidatesError ?? insightsError ?? assessmentError;

  return (
    <>
      {toastNode}
      <PageHeader
        eyebrow="Analytics · Feature 8"
        title="Class Analytics"
        subtitle="Every class's Practice Olympiad and Assessment performance — spot who's excelling, practicing the most, or needs intervention."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Classes" value={totalClasses} icon={School} tone="brand" />
        <StatCard label="Active Classes" value={activeClasses} icon={Activity} tone="emerald" />
        <StatCard label="Avg Practice Score" value={avgPracticeScore} icon={Target} tone="emerald" />
        <StatCard label="Avg Assessment Score" value={avgAssessmentScore} icon={ClipboardCheck} tone="amber" />
        <StatCard label="Total Practice Attempts" value={totalPracticeAttempts} icon={Flame} tone="violet" />
        <StatCard label="Total Assessment Attempts" value={totalAssessmentAttempts} icon={ClipboardCheck} tone="violet" />
        <StatCard label="Best Performing Class" value={bestClass?.className ?? '—'} icon={Award} tone="emerald" />
        <StatCard label="Lowest Performing Class" value={lowestClass?.className ?? '—'} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Ranked by Overall Score</h3>
          {rankOverall.length ? <RankedBarList items={rankOverall} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Ranked by Practice Performance</h3>
          {rankPractice.length ? <RankedBarList items={rankPractice} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Ranked by Assessment Performance</h3>
          {rankAssessment.length ? <RankedBarList items={rankAssessment} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Ranked by Accuracy</h3>
          {rankAccuracy.length ? <RankedBarList items={rankAccuracy} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Ranked by Participation</h3>
          {rankParticipation.length ? <RankedBarList items={rankParticipation} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Activity size={14} />Most Active</h3>
          {mostActive.length ? <RankedBarList items={mostActive} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Most Improved</h3>
          {mostImproved.length ? <RankedBarList items={mostImproved} /> : <p className="text-[12px] text-fg3">No classes trending up yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Activity size={14} />Activity Analytics</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStat label="Daily Active" value={dau} />
            <MiniStat label="Weekly Active" value={wau} />
            <MiniStat label="Monthly Active" value={mau} />
            <MiniStat label="Avg Sessions/Week" value={avgSessionsPerWeek} />
            <MiniStat label="Assessment Participation" value={`${avgAssessmentParticipation}%`} wide />
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Sparkles size={14} />AI Insights</h3>
          {insightLines.length ? (
            <ul className="list-disc list-inside space-y-1.5 text-[12.5px] text-fg2">
              {insightLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : <p className="text-[12px] text-fg3">Not enough data yet to generate insights.</p>}
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Layers size={14} />Subject Comparison by Class</h3>
        {classRows.some(r => r.subjects.length) ? (
          <div className="overflow-x-auto">
            <Table
              columns={[
                { key: 'className', label: 'Class' },
                { key: 'best', label: 'Best Subject', render: (r: ClassAnalyticsRow) => {
                  const best = [...r.subjects].sort((a, b) => b.avgAccuracy - a.avgAccuracy)[0];
                  return best ? `${best.subjectName} (${best.avgAccuracy}%)` : '—';
                } },
                { key: 'weakest', label: 'Weakest Subject', render: (r: ClassAnalyticsRow) => {
                  const weakest = [...r.subjects].sort((a, b) => a.avgAccuracy - b.avgAccuracy)[0];
                  return weakest ? `${weakest.subjectName} (${weakest.avgAccuracy}%)` : '—';
                } },
                { key: 'avgScore', label: 'Subject Avg Score', render: (r: ClassAnalyticsRow) => {
                  if (!r.subjects.length) return '—';
                  const mean = r.subjects.reduce((s, x) => s + x.avgScore, 0) / r.subjects.length;
                  return Math.round(mean * 100) / 100;
                } },
                { key: 'participation', label: 'Subject Participation', render: (r: ClassAnalyticsRow) => {
                  if (!r.subjects.length) return '—';
                  const total = r.subjects.reduce((s, x) => s + x.participation, 0);
                  return total;
                } },
              ]}
              rows={classRows}
            />
          </div>
        ) : <p className="text-[12px] text-fg3">No subject data yet.</p>}
      </Card>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-500" />At-Risk Classes</h3>
        {atRiskClasses.length ? (
          <div className="space-y-2.5">
            {atRiskClasses.map(r => (
              <div key={r.classId} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-[13px] text-fg1">{r.className}</span>
                  <Badge tone="danger">At Risk</Badge>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[12px] text-fg2">
                  {r.atRiskReasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-fg3">No classes currently at risk.</p>}
      </Card>

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search class…" />
          <Select value={classFilter} onChange={v => { setClassFilter(v); setPage(1); }} options={classOptions} />
          <Select value={gradeFilter} onChange={v => { setGradeFilter(v); setPage(1); }} options={GRADE_OPTIONS} />
          <Select value={riskFilter} onChange={v => { setRiskFilter(v); setPage(1); }} options={RISK_OPTIONS} />
          <Select value={activityFilter} onChange={v => { setActivityFilter(v); setPage(1); }} options={ACTIVITY_OPTIONS} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <span className="text-fg4 text-[12px]">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className="ml-auto" />
        </div>
        <p className="text-[11px] text-fg3 mt-2">Date range scopes the per-class Assessment trends modal below — the practice/assessment averages above are all-time (see plan's scope note).</p>
        <div className="text-[12px] text-fg3 mt-2">{loading ? 'Loading…' : `${sorted.length} of ${classRows.length} classes`}</div>
      </Card>

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !sorted.length ? (
          <EmptyState icon={School} title="No classes match these filters" desc="Try widening your search or clearing a filter." />
        ) : (
          <>
            <Table
              columns={[
                {
                  key: 'className', label: 'Class',
                  render: (r: ClassAnalyticsRow) => (
                    <button className="flex items-center gap-1.5 text-left" onClick={() => { setTrendsClassId(r.classId); setTrendsClassName(r.className); }}>
                      <span className="font-semibold text-fg1">{r.className}</span>
                      {r.atRisk && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                    </button>
                  ),
                },
                { key: 'totalStudents', label: 'Students', render: (r: ClassAnalyticsRow) => <span className="font-mono">{r.totalStudents}</span> },
                { key: 'activeStudents', label: 'Active Students', render: (r: ClassAnalyticsRow) => <span className="font-mono">{r.activeStudents}</span> },
                { key: 'practiceAttempts', label: 'Practice Attempts', render: (r: ClassAnalyticsRow) => <span className="font-mono">{r.practiceAttempts}</span> },
                { key: 'assessmentAttempts', label: 'Assessment Attempts', render: (r: ClassAnalyticsRow) => <span className="font-mono">{r.assessmentAttempts}</span> },
                { key: 'practiceAverage', label: 'Practice Average', render: (r: ClassAnalyticsRow) => r.practiceAverage ?? '—' },
                { key: 'assessmentAverage', label: 'Assessment Average', render: (r: ClassAnalyticsRow) => r.assessmentAverage ?? '—' },
                { key: 'overallScorePercent', label: 'Overall Score', render: (r: ClassAnalyticsRow) => r.overallScorePercent !== null ? `${r.overallScorePercent}%` : '—' },
                { key: 'accuracyPercent', label: 'Accuracy', render: (r: ClassAnalyticsRow) => r.accuracyPercent !== null ? `${r.accuracyPercent}%` : '—' },
                { key: 'avgTimePerQuestionSec', label: 'Avg Time/Question', render: (r: ClassAnalyticsRow) => r.avgTimePerQuestionSec !== null ? `${r.avgTimePerQuestionSec}s` : '—' },
                {
                  key: 'grade', label: 'Performance Grade',
                  render: (r: ClassAnalyticsRow) => r.grade === null ? <span className="text-fg3">—</span> : <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>,
                },
                {
                  key: 'atRisk', label: 'Risk Level',
                  render: (r: ClassAnalyticsRow) => r.atRisk
                    ? <span title={r.atRiskReasons.join(' ')}><Badge tone="danger">At Risk</Badge></span>
                    : <Badge tone="success">On Track</Badge>,
                },
                {
                  key: 'trend', label: 'Trend',
                  render: (r: ClassAnalyticsRow) => r.practiceTrendDirection === null ? <span className="text-fg3">—</span> : (
                    <Badge tone={trendTone(r.practiceTrendDirection)}>{r.practiceTrendDirection}</Badge>
                  ),
                },
                {
                  key: 'actions', label: '',
                  render: (r: ClassAnalyticsRow) => (
                    <Button size="sm" variant="ghost" icon={Clock} onClick={() => { setTrendsClassId(r.classId); setTrendsClassName(r.className); }}>
                      Trends
                    </Button>
                  ),
                },
              ]}
              rows={pageRows}
            />
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </Card>

      <ClassTrendsModal
        classId={trendsClassId}
        className={trendsClassName}
        onClose={() => setTrendsClassId(null)}
      />
    </>
  );
}

function MiniStat({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-line bg-surface1 px-2.5 py-2 ${wide ? 'col-span-2' : ''}`}>
      <div className="text-[14px] font-display font-semibold text-fg1">{value}</div>
      <div className="text-[10.5px] text-fg3">{label}</div>
    </div>
  );
}
