import { useEffect, useMemo, useState } from 'react';
import {
  Download, Users, AlertTriangle, TrendingUp, TrendingDown, Flame, Award, Target,
  Activity, Layers, Sparkles, ClipboardCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, StatCard, SearchInput, Select,
  Table, Pagination, Avatar, ProgressBar, Skeleton, EmptyState, useToasts,
} from '../../shared/ui';
import { RankedBarList } from '../components/DashboardCharts';
import { exportCsv } from '../../../lib/csv';
import { fmtDuration } from '../../../lib/formatters';
import { sortByClassName } from '../../../lib/classOrder';
import {
  useStudentCandidates, studentPerformanceApi, type StudentBulkInsight,
} from '../../../hooks/useStudentPerformance';
import type { PracticeOverviewData } from '../../../hooks/useStudentAnalytics';
import { practiceDatesFromOverview } from '../../../lib/studyPlanEngine';
import { computePracticeFrequency } from '../../../lib/consistencyEngine';
import { buildPlatformInsights, type PlatformInsightRow } from '../../../lib/studentPerformanceInsights';
import {
  buildRow, daysSince, ACTIVE_WINDOW_DAYS, INACTIVE_WINDOW_DAYS,
  type StudentRow,
} from '../../../lib/studentRowBuilder';
import { StudentPerformanceSummaryPanel } from './StudentPerformanceSummaryPanel';

/**
 * Admin Analytics — Feature 2/6: Student Performance Analytics.
 *
 * Every "smart" number (confidence, strongest/weakest subject, trend,
 * practice streak, at-risk reasons, grade) is computed by the exact same
 * functions the student's own AnalyticsPage.tsx and Feature 5's assessment
 * engine already use — this page only calls them once per student and
 * merges the two domains' already-computed stats into one row. See
 * PLAN / studentPerformance.service.ts for the reuse rationale. buildRow()
 * itself now lives in lib/studentRowBuilder.ts (Feature 8 reuses it to
 * group the same per-student numbers by class).
 */

const CONFIDENCE_MIN_OPTIONS = [
  { value: 'all', label: 'Any confidence' },
  { value: '80', label: '≥ 80' },
  { value: '60', label: '≥ 60' },
  { value: '40', label: '≥ 40' },
];
const ACCURACY_MIN_OPTIONS = [
  { value: 'all', label: 'Any accuracy' },
  { value: '80', label: '≥ 80%' },
  { value: '60', label: '≥ 60%' },
  { value: '40', label: '≥ 40%' },
];
const ATTEMPTS_MIN_OPTIONS = [
  { value: 'all', label: 'Any attempts' },
  { value: '20', label: '≥ 20' },
  { value: '10', label: '≥ 10' },
  { value: '5', label: '≥ 5' },
  { value: '1', label: '≥ 1' },
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'All students' },
  { value: 'at-risk', label: 'Needs attention' },
  { value: 'active', label: `Active (≤ ${ACTIVE_WINDOW_DAYS}d)` },
  { value: 'inactive', label: `Inactive (> ${INACTIVE_WINDOW_DAYS}d or never)` },
];
const GRADE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Any grade' },
  { value: 'Excellent', label: 'Excellent' },
  { value: 'Good', label: 'Good' },
  { value: 'Average', label: 'Average' },
  { value: 'Needs Improvement', label: 'Needs Improvement' },
  { value: 'At Risk', label: 'At Risk' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'accuracy-desc', label: 'Accuracy (high–low)' },
  { value: 'avgScore-desc', label: 'Avg score (high–low)' },
  { value: 'attempts-desc', label: 'Attempts (high–low)' },
  { value: 'assessmentAttempts-desc', label: 'Assessment attempts (high–low)' },
  { value: 'assessmentAverage-desc', label: 'Assessment average (high–low)' },
  { value: 'practiceStreak-desc', label: 'Practice streak (high–low)' },
  { value: 'confidence-desc', label: 'Confidence (high–low)' },
  { value: 'lastActive-desc', label: 'Last active (recent first)' },
  { value: 'improvement-desc', label: 'Improvement (best first)' },
];

const PAGE_SIZE = 20;

export function StudentPerformancePage() {
  const [classFilter, setClassFilter] = useState('all');
  const { data: candidates, loading: candidatesLoading, error: candidatesError } =
    useStudentCandidates(classFilter !== 'all' ? classFilter : undefined);

  const [insights, setInsights] = useState<StudentBulkInsight[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const { push, node: toastNode } = useToasts();

  // Fetch bulk insights whenever the candidate roster changes — identical
  // to Feature 2's original data-fetch effect.
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

  const rows: StudentRow[] = useMemo(() => {
    if (!candidates) return [];
    const byId = new Map((insights ?? []).map(i => [i.studentId, i]));
    return candidates.map(c => buildRow(c, byId.get(c.id)));
  }, [candidates, insights]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates ?? []) {
      if (c.classExternalId) map.set(c.classExternalId, c.className ?? c.classExternalId);
    }
    const options = sortByClassName([...map.entries()].map(([value, label]) => ({ value, label })), o => o.label);
    return [{ value: 'all', label: 'All classes' }, ...options];
  }, [candidates]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of insights ?? []) {
      for (const s of i.subjects) map.set(s.subjectId, s.subjectName);
    }
    return [{ value: 'all', label: 'All subjects' }, ...[...map.entries()].map(([value, label]) => ({ value, label }))];
  }, [insights]);

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [accuracyMin, setAccuracyMin] = useState('all');
  const [attemptsMin, setAttemptsMin] = useState('all');
  const [confidenceMin, setConfidenceMin] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const now = Date.now();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const accMin = accuracyMin === 'all' ? null : Number(accuracyMin);
    const attMin = attemptsMin === 'all' ? null : Number(attemptsMin);
    const confMin = confidenceMin === 'all' ? null : Number(confidenceMin);
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() : null;

    return rows.filter(r => {
      if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.className ?? '').toLowerCase().includes(q))) return false;
      if (subjectFilter !== 'all' && !r.subjectIds.includes(subjectFilter) && !r.assessmentSubjectIds.includes(subjectFilter)) return false;
      if (accMin !== null && r.accuracyPercent < accMin) return false;
      if (attMin !== null && r.totalAttempts < attMin) return false;
      if (confMin !== null && (r.confidenceScore ?? -1) < confMin) return false;
      if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false;

      const activeDays = daysSince(r.lastActiveDate, now);
      if (statusFilter === 'at-risk' && !r.atRisk) return false;
      if (statusFilter === 'active' && (activeDays === null || activeDays > ACTIVE_WINDOW_DAYS)) return false;
      if (statusFilter === 'inactive' && !(activeDays === null || activeDays > INACTIVE_WINDOW_DAYS)) return false;

      // Date Range scopes "last active" recency only — see plan's scope note
      // (Practice's shared analytics engine has no date-window param; a true
      // within-range recompute would require changing analytics.service.ts,
      // which the student's own AnalyticsPage also depends on).
      if (from !== null || to !== null) {
        if (!r.lastActiveDate) return false;
        const t = new Date(r.lastActiveDate).getTime();
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }

      return true;
    });
  }, [rows, search, subjectFilter, accuracyMin, attemptsMin, confidenceMin, statusFilter, gradeFilter, dateFrom, dateTo, now]);

  const sorted = useMemo(() => {
    // Sort key can itself contain a dash (assessmentAttempts-desc), so
    // split on the trailing token only, not the first dash.
    const dashIdx = sort.lastIndexOf('-');
    const realKey = sort.slice(0, dashIdx);
    const realDir = sort.slice(dashIdx + 1) as 'asc' | 'desc';
    const mul = realDir === 'asc' ? 1 : -1;
    const improvement = (r: StudentRow) => r.trend === 'Improving' ? 1 : r.trend === 'Declining' ? -1 : 0;
    const valueOf = (r: StudentRow): number | string => {
      switch (realKey) {
        case 'name': return r.name.toLowerCase();
        case 'accuracy': return r.accuracyPercent;
        case 'avgScore': return r.averageScore;
        case 'attempts': return r.totalAttempts;
        case 'assessmentAttempts': return r.assessmentAttempts;
        case 'assessmentAverage': return r.assessmentAveragePercent ?? -1;
        case 'practiceStreak': return r.practiceStreak;
        case 'confidence': return r.confidenceScore ?? -1;
        case 'lastActive': return r.lastActiveDate ? new Date(r.lastActiveDate).getTime() : -Infinity;
        case 'improvement': return improvement(r);
        default: return r.name.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const withData = useMemo(() => rows.filter(r => r.hasData), [rows]);
  const withAssessmentData = useMemo(() => rows.filter(r => r.assessmentCompletedAttempts > 0), [rows]);
  const activeCount = useMemo(() => rows.filter(r => { const d = daysSince(r.lastActiveDate, now); return d !== null && d <= ACTIVE_WINDOW_DAYS; }).length, [rows, now]);
  const inactiveCount = useMemo(() => rows.filter(r => { const d = daysSince(r.lastActiveDate, now); return d === null || d > INACTIVE_WINDOW_DAYS; }).length, [rows, now]);
  const practicingThisWeek = useMemo(() => rows.filter(r => { const d = daysSince(r.lastPracticeDate, now); return d !== null && d <= 7; }).length, [rows, now]);
  const completingAssessments = useMemo(() => rows.filter(r => r.assessmentCompletedAttempts > 0).length, [rows]);
  const atRiskCount = useMemo(() => rows.filter(r => r.atRisk).length, [rows]);
  const inactive14 = useMemo(() => rows.filter(r => { const d = daysSince(r.lastPracticeDate, now); return d === null || d > 14; }).length, [rows, now]);

  const avgAccuracy = useMemo(() => withData.length ? Math.round(withData.reduce((s, r) => s + r.accuracyPercent, 0) / withData.length) : 0, [withData]);
  const avgScore = useMemo(() => withData.length ? Math.round((withData.reduce((s, r) => s + r.averageScore, 0) / withData.length) * 100) / 100 : 0, [withData]);
  const avgPracticeTimeSec = useMemo(() => withData.length ? Math.round(withData.reduce((s, r) => s + r.totalPracticeTimeSec, 0) / withData.length) : 0, [withData]);
  const avgAssessmentScore = useMemo(
    () => withAssessmentData.length ? Math.round((withAssessmentData.reduce((s, r) => s + (r.assessmentAverageScore ?? 0), 0) / withAssessmentData.length) * 100) / 100 : 0,
    [withAssessmentData],
  );

  // ── Rank widgets ─────────────────────────────────────────────────────────
  const topByAccuracy = useMemo(
    () => [...withData].sort((a, b) => b.accuracyPercent - a.accuracyPercent).slice(0, 5)
      .map(r => ({ label: r.name, count: r.accuracyPercent })),
    [withData],
  );
  const fastestImproving = useMemo(
    () => withData.filter(r => r.trend === 'Improving').sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0)).slice(0, 5)
      .map(r => ({ label: r.name, count: r.accuracyPercent })),
    [withData],
  );
  const longestStreaks = useMemo(
    () => [...withData].sort((a, b) => b.practiceStreak - a.practiceStreak).slice(0, 5)
      .map(r => ({ label: r.name, count: r.practiceStreak })),
    [withData],
  );
  const highestAvgScore = useMemo(
    () => [...withData].sort((a, b) => b.averageScore - a.averageScore).slice(0, 5)
      .map(r => ({ label: r.name, count: r.averageScore })),
    [withData],
  );
  const mostAttempts = useMemo(
    () => [...withData].sort((a, b) => b.totalAttempts - a.totalAttempts).slice(0, 5)
      .map(r => ({ label: r.name, count: r.totalAttempts })),
    [withData],
  );
  const highestAssessmentAverage = useMemo(
    () => [...withAssessmentData].sort((a, b) => (b.assessmentAveragePercent ?? 0) - (a.assessmentAveragePercent ?? 0)).slice(0, 5)
      .map(r => ({ label: r.name, count: r.assessmentAveragePercent ?? 0 })),
    [withAssessmentData],
  );

  // ── Activity Analytics ──────────────────────────────────────────────────
  const dau = useMemo(() => rows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 0; }).length, [rows, now]);
  const wau = useMemo(() => rows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 7; }).length, [rows, now]);
  const mau = useMemo(() => rows.filter(r => { const d = daysSince(r.lastLoginAt, now); return d !== null && d <= 30; }).length, [rows, now]);
  const avgSessionsPerWeek = useMemo(() => {
    if (!insights?.length) return 0;
    const freqs = insights
      .filter(i => i.overview.hasData === true)
      .map(i => computePracticeFrequency(i.overview as PracticeOverviewData, practiceDatesFromOverview(i.overview as PracticeOverviewData)).avgSessionsPerWeek);
    return freqs.length ? Math.round((freqs.reduce((s, v) => s + v, 0) / freqs.length) * 10) / 10 : 0;
  }, [insights]);
  const assessmentParticipationRate = useMemo(
    () => rows.length ? Math.round((rows.filter(r => r.assessmentAttempts > 0).length / rows.length) * 100) : 0,
    [rows],
  );

  // ── Subject Comparison (platform-wide) ──────────────────────────────────
  const subjectComparison = useMemo(() => {
    const bySubject = new Map<string, number[]>();
    for (const r of withData) {
      for (const s of r.subjects) {
        const list = bySubject.get(s.subjectName) ?? [];
        list.push(s.accuracyPercent);
        bySubject.set(s.subjectName, list);
      }
    }
    const entries = [...bySubject.entries()].map(([subjectName, vals]) => ({
      subjectName, avgAccuracy: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }));
    entries.sort((a, b) => b.avgAccuracy - a.avgAccuracy);
    return { best: entries[0] ?? null, weakest: entries[entries.length - 1] ?? null, entries };
  }, [withData]);

  // ── AI Insights ──────────────────────────────────────────────────────────
  const platformInsights = useMemo(() => {
    const insightRows: PlatformInsightRow[] = rows.map(r => ({
      id: r.id, name: r.name, className: r.className,
      hasPracticeData: r.hasData, accuracyPercent: r.hasData ? r.accuracyPercent : null,
      practiceTrendDirection: r.trend === 'Improving' ? 'improved' : r.trend === 'Declining' ? 'declined' : r.trend === 'Stable' ? 'consistent' : null,
      practiceTrendDeltaPercent: r.practiceTrendDeltaPercent,
      lastPracticeDate: r.lastPracticeDate,
      assessmentAveragePercent: r.assessmentAveragePercent,
      assessmentTrendDirection: null, // not cheaply available in the bulk view — see plan's scope note
      atRisk: r.atRisk,
      subjects: r.subjects,
    }));
    return buildPlatformInsights(insightRows);
  }, [rows]);

  // ── Export ───────────────────────────────────────────────────────────────
  const exportHeaders = [
    'Name', 'Email', 'Class', 'Total Attempts', 'Questions Solved', 'Avg Score', 'Avg Accuracy',
    'Avg Time/Question (s)', 'Practice Streak', 'Revision Streak', 'Confidence Score',
    'Strongest Subject', 'Weakest Subject', 'Subjects Practiced', 'Last Practice Date',
    'Assessment Attempts', 'Assessment Average (%)', 'Assessment Pass Rate (%)', 'Last Assessment Date',
    'Performance Grade', 'Trend', 'Needs Attention',
  ];
  const exportRows = () => sorted.map(r => [
    r.name, r.email, r.className ?? '', r.totalAttempts, r.totalQuestionsSolved, r.averageScore,
    r.accuracyPercent, r.averageTimePerQuestionSec, r.practiceStreak, r.revisionStreak,
    r.confidenceScore ?? '', r.strongestSubject ?? '', r.weakestSubject ?? '', r.subjectIds.length,
    r.lastPracticeDate ? new Date(r.lastPracticeDate).toLocaleDateString() : 'Never',
    r.assessmentAttempts, r.assessmentAveragePercent ?? '', r.assessmentPassRate ?? '',
    r.lastAssessmentDate ? new Date(r.lastAssessmentDate).toLocaleDateString() : 'Never',
    r.grade ?? 'No data', r.trend ?? '', r.atRisk ? 'Yes' : 'No',
  ]);

  const handleExportCsv = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv('student-performance.csv', exportRows(), exportHeaders);
  };

  const handleExportExcel = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows()]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Student Performance');
    XLSX.writeFile(workbook, 'student-performance.xlsx');
  };

  const loading = candidatesLoading || insightsLoading;

  return (
    <>
      {toastNode}
      <PageHeader
        eyebrow="Analytics · Feature 6"
        title="Student Performance"
        subtitle="Every student's Practice Olympiad and Assessment performance — spot who's improving, struggling, or needs intervention."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
        <StatCard label="Total Students" value={rows.length} icon={Users} tone="brand" />
        <StatCard label="Active Students" value={activeCount} icon={Activity} tone="emerald" />
        <StatCard label="Inactive Students" value={inactiveCount} icon={TrendingDown} tone="violet" />
        <StatCard label="Practicing This Week" value={practicingThisWeek} icon={Flame} tone="amber" />
        <StatCard label="Completing Assessments" value={completingAssessments} icon={ClipboardCheck} tone="brand" />
        <StatCard label="Avg Student Accuracy" value={`${avgAccuracy}%`} icon={Target} tone="emerald" />
        <StatCard label="Avg Student Score" value={avgScore} icon={Award} tone="brand" />
        <StatCard label="Avg Practice Time" value={fmtDuration(avgPracticeTimeSec)} icon={Activity} tone="violet" />
        <StatCard label="Avg Assessment Score" value={avgAssessmentScore} icon={ClipboardCheck} tone="amber" />
        <StatCard label="Needs Attention" value={atRiskCount} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Highest Accuracy</h3>
          {topByAccuracy.length ? <RankedBarList items={topByAccuracy} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Best Improvement</h3>
          {fastestImproving.length ? <RankedBarList items={fastestImproving} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Flame size={14} />Longest Practice Streaks</h3>
          {longestStreaks.length ? <RankedBarList items={longestStreaks} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Award size={14} />Highest Average Score</h3>
          {highestAvgScore.length ? <RankedBarList items={highestAvgScore} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Most Practice Attempts</h3>
          {mostAttempts.length ? <RankedBarList items={mostAttempts} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><ClipboardCheck size={14} />Highest Assessment Average</h3>
          {highestAssessmentAverage.length ? <RankedBarList items={highestAssessmentAverage} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Activity size={14} />Activity Analytics</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStat label="Daily Active" value={dau} />
            <MiniStat label="Weekly Active" value={wau} />
            <MiniStat label="Monthly Active" value={mau} />
            <MiniStat label="Avg Sessions/Week" value={avgSessionsPerWeek} />
            <MiniStat label="Assessment Participation" value={`${assessmentParticipationRate}%`} />
            <MiniStat label="Practicing This Week" value={practicingThisWeek} />
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Layers size={14} />Subject Comparison</h3>
          {subjectComparison.entries.length ? (
            <div className="space-y-2">
              <MiniStat label="Best Subject" value={subjectComparison.best ? `${subjectComparison.best.subjectName} (${subjectComparison.best.avgAccuracy}%)` : '—'} wide />
              <MiniStat label="Weakest Subject" value={subjectComparison.weakest ? `${subjectComparison.weakest.subjectName} (${subjectComparison.weakest.avgAccuracy}%)` : '—'} wide />
            </div>
          ) : <p className="text-[12px] text-fg3">No subject data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Sparkles size={14} />AI Insights</h3>
          {platformInsights.length ? (
            <ul className="list-disc list-inside space-y-1.5 text-[12.5px] text-fg2">
              {platformInsights.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : <p className="text-[12px] text-fg3">Not enough data yet to generate insights.</p>}
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search name, email, class…" />
          <Select value={classFilter} onChange={v => { setClassFilter(v); setPage(1); }} options={classOptions} />
          <Select value={subjectFilter} onChange={v => { setSubjectFilter(v); setPage(1); }} options={subjectOptions} />
          <Select value={accuracyMin} onChange={v => { setAccuracyMin(v); setPage(1); }} options={ACCURACY_MIN_OPTIONS} />
          <Select value={attemptsMin} onChange={v => { setAttemptsMin(v); setPage(1); }} options={ATTEMPTS_MIN_OPTIONS} />
          <Select value={confidenceMin} onChange={v => { setConfidenceMin(v); setPage(1); }} options={CONFIDENCE_MIN_OPTIONS} />
          <Select value={gradeFilter} onChange={v => { setGradeFilter(v); setPage(1); }} options={GRADE_OPTIONS} />
          <Select value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} />
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} aria-label="Last active from"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <span className="text-fg4 text-[12px]">to</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} aria-label="Last active to"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className="ml-auto" />
        </div>
        <div className="text-[12px] text-fg3 mt-3">
          {loading ? 'Loading…' : `${sorted.length} of ${rows.length} students`}
        </div>
      </Card>

      {(candidatesError || insightsError) && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{candidatesError ?? insightsError}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !sorted.length ? (
          <EmptyState icon={Users} title="No students match these filters" desc="Try widening your search or clearing a filter." />
        ) : (
          <>
            <Table
              columns={[
                {
                  key: 'name', label: 'Student',
                  render: (r: StudentRow) => (
                    <button className="flex items-center gap-3 text-left" onClick={() => setSelectedStudentId(r.id)}>
                      <Avatar name={r.name} hue={r.avatarHue} />
                      <div className="min-w-0">
                        <div className="font-semibold text-fg1 truncate flex items-center gap-1.5">
                          {r.name}
                          {r.atRisk && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                        </div>
                        <div className="text-[11.5px] text-fg3 truncate">{r.email}</div>
                      </div>
                    </button>
                  ),
                },
                { key: 'className', label: 'Class', render: (r: StudentRow) => <span className="text-fg2">{r.className ?? '—'}</span> },
                { key: 'totalAttempts', label: 'Practice Attempts', render: (r: StudentRow) => <span className="font-mono">{r.totalAttempts}</span> },
                { key: 'assessmentAttempts', label: 'Assessment Attempts', render: (r: StudentRow) => <span className="font-mono">{r.assessmentAttempts}</span> },
                {
                  key: 'accuracyPercent', label: 'Practice Accuracy',
                  render: (r: StudentRow) => (
                    <div className="min-w-[100px]">
                      <div className="flex items-center justify-between mb-1"><span className="font-mono text-[12px]">{r.accuracyPercent}%</span></div>
                      <ProgressBar value={r.accuracyPercent} tone={r.accuracyPercent >= 75 ? 'emerald' : r.accuracyPercent >= 50 ? 'amber' : 'rose'} />
                    </div>
                  ),
                },
                {
                  key: 'assessmentAveragePercent', label: 'Assessment Average',
                  render: (r: StudentRow) => r.assessmentAveragePercent === null ? <span className="text-fg3">—</span> : (
                    <div className="min-w-[100px]">
                      <div className="flex items-center justify-between mb-1"><span className="font-mono text-[12px]">{r.assessmentAveragePercent}%</span></div>
                      <ProgressBar value={r.assessmentAveragePercent} tone={r.assessmentAveragePercent >= 75 ? 'emerald' : r.assessmentAveragePercent >= 50 ? 'amber' : 'rose'} />
                    </div>
                  ),
                },
                { key: 'subjectsCount', label: 'Subjects Practiced', render: (r: StudentRow) => <span className="font-mono">{r.subjectIds.length}</span> },
                { key: 'practiceStreak', label: 'Practice Streak', render: (r: StudentRow) => <span className="font-mono">{r.practiceStreak}d</span> },
                {
                  key: 'lastActiveDate', label: 'Last Active',
                  render: (r: StudentRow) => <span className="text-fg2">{r.lastActiveDate ? new Date(r.lastActiveDate).toLocaleDateString() : 'Never'}</span>,
                },
                {
                  key: 'grade', label: 'Grade',
                  render: (r: StudentRow) => r.grade === null ? <span className="text-fg3">—</span> : (
                    <Badge tone={r.grade === 'Excellent' || r.grade === 'Good' ? 'success' : r.grade === 'Average' ? 'warning' : 'danger'}>{r.grade}</Badge>
                  ),
                },
                {
                  key: 'trend', label: 'Trend',
                  render: (r: StudentRow) => r.trend === null ? <span className="text-fg3">—</span> : (
                    <Badge tone={r.trend === 'Improving' ? 'success' : r.trend === 'Declining' ? 'danger' : 'neutral'}>{r.trend}</Badge>
                  ),
                },
                {
                  key: 'atRisk', label: 'Risk Status',
                  render: (r: StudentRow) => r.atRisk
                    ? <Badge tone="danger">At Risk</Badge>
                    : <Badge tone="success">On Track</Badge>,
                },
              ]}
              rows={pageRows}
            />
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </Card>

      <StudentPerformanceSummaryPanel
        studentId={selectedStudentId}
        studentName={rows.find(r => r.id === selectedStudentId)?.name ?? ''}
        onClose={() => setSelectedStudentId(null)}
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
