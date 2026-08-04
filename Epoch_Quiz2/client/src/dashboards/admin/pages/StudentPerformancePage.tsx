import { useEffect, useMemo, useState } from 'react';
import { Download, Users, AlertTriangle, TrendingUp, TrendingDown, Flame } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, StatCard, SearchInput, Select,
  Table, Pagination, Avatar, ProgressBar, Skeleton, EmptyState, useToasts,
} from '../../shared/ui';
import { RankedBarList } from '../components/DashboardCharts';
import { exportCsv } from '../../../lib/csv';
import {
  useStudentCandidates, studentPerformanceApi,
  type StudentCandidate, type StudentBulkInsight,
} from '../../../hooks/useStudentPerformance';
import type { PracticeOverviewData, SubjectStat, QuestionTypeStat } from '../../../hooks/useStudentAnalytics';
import { computeConfidence } from '../../../lib/confidenceScore';
import { deriveInsights } from '../../../lib/strengthWeaknessInsights';
import { deriveAccuracyInsights } from '../../../lib/accuracyInsights';
import { computeStreak, practiceDatesFromOverview } from '../../../lib/studyPlanEngine';
import { evaluateAtRisk } from '../../../lib/atRiskDetection';
import { StudentPerformanceSummaryPanel } from './StudentPerformanceSummaryPanel';

/**
 * Admin Analytics — Feature 2: Student Performance Analytics.
 *
 * Practice Olympiad only. Every "smart" number (confidence, strongest/
 * weakest subject, trend, practice streak) is computed by the exact same
 * functions the student's own AnalyticsPage.tsx already imports — this page
 * just calls them once per student instead of once for the logged-in
 * student. See PLAN / analytics.service.ts for the reuse rationale.
 */

type Trend = 'Improving' | 'Stable' | 'Declining';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  className: string | null;
  hasData: boolean;
  totalAttempts: number;
  totalQuestionsSolved: number;
  averageScore: number;
  accuracyPercent: number;
  averageTimePerQuestionSec: number;
  lastPracticeDate: string | null;
  practiceStreak: number;
  revisionStreak: number;
  confidenceScore: number | null;
  confidenceBand: string | null;
  strongestSubject: string | null;
  weakestSubject: string | null;
  subjectIds: string[];
  trend: Trend | null;
  atRisk: boolean;
  atRiskReasons: string[];
}

function buildRow(candidate: StudentCandidate, insight: StudentBulkInsight | undefined): StudentRow {
  const base = {
    id: candidate.id, name: candidate.name, email: candidate.email,
    avatarHue: candidate.avatarHue, className: candidate.className,
  };

  const overview = insight?.overview;
  if (!insight || !overview || overview.hasData === false) {
    return {
      ...base,
      hasData: false,
      totalAttempts: 0, totalQuestionsSolved: 0, averageScore: 0, accuracyPercent: 0,
      averageTimePerQuestionSec: 0, lastPracticeDate: null,
      practiceStreak: 0, revisionStreak: insight?.revisionStreak.currentStreak ?? 0,
      confidenceScore: null, confidenceBand: null,
      strongestSubject: null, weakestSubject: null, subjectIds: [],
      trend: null, atRisk: true, atRiskReasons: ['Never practiced'],
    };
  }

  const data: PracticeOverviewData = overview;
  const subjects: SubjectStat[] = insight.subjects;
  const questionTypes: QuestionTypeStat[] = insight.questionTypes;

  const confidence = computeConfidence(data, subjects, questionTypes);
  const strengthWeakness = deriveInsights(subjects);
  const accuracyInsights = deriveAccuracyInsights(data);
  const practiceDates = practiceDatesFromOverview(data);
  const streak = computeStreak(practiceDates, new Set(), new Date());
  const atRisk = evaluateAtRisk({ overview: data, confidence });

  const trend: Trend =
    accuracyInsights.trendDirection === 'improved' ? 'Improving' :
    accuracyInsights.trendDirection === 'declined' ? 'Declining' : 'Stable';

  return {
    ...base,
    hasData: true,
    totalAttempts: data.totalAttempts,
    totalQuestionsSolved: data.totalQuestionsAttempted,
    averageScore: data.averageScore,
    accuracyPercent: data.accuracyPercent,
    averageTimePerQuestionSec: data.averageTimePerQuestionSec,
    lastPracticeDate: data.lastPracticeDate,
    practiceStreak: streak.currentStreak,
    revisionStreak: insight.revisionStreak.currentStreak,
    confidenceScore: confidence.score,
    confidenceBand: confidence.band,
    strongestSubject: strengthWeakness?.strongest.subjectName ?? null,
    weakestSubject: strengthWeakness?.weakest.subjectName ?? null,
    subjectIds: subjects.map(s => s.subjectId),
    trend,
    atRisk: atRisk.atRisk,
    atRiskReasons: atRisk.reasons,
  };
}

function daysSince(dateIso: string | null, now: number): number | null {
  if (!dateIso) return null;
  return Math.floor((now - new Date(dateIso).getTime()) / 86_400_000);
}

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
  { value: 'active', label: 'Active (practiced ≤ 7d)' },
  { value: 'inactive', label: 'Inactive (> 30d or never)' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'accuracy-desc', label: 'Accuracy (high–low)' },
  { value: 'avgScore-desc', label: 'Avg score (high–low)' },
  { value: 'attempts-desc', label: 'Attempts (high–low)' },
  { value: 'practiceStreak-desc', label: 'Practice streak (high–low)' },
  { value: 'confidence-desc', label: 'Confidence (high–low)' },
  { value: 'lastPractice-desc', label: 'Last practice (recent first)' },
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
    return [{ value: 'all', label: 'All classes' }, ...[...map.entries()].map(([value, label]) => ({ value, label }))];
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
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const now = Date.now();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const accMin = accuracyMin === 'all' ? null : Number(accuracyMin);
    const attMin = attemptsMin === 'all' ? null : Number(attemptsMin);
    const confMin = confidenceMin === 'all' ? null : Number(confidenceMin);

    return rows.filter(r => {
      if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.className ?? '').toLowerCase().includes(q))) return false;
      if (subjectFilter !== 'all' && !r.subjectIds.includes(subjectFilter)) return false;
      if (accMin !== null && r.accuracyPercent < accMin) return false;
      if (attMin !== null && r.totalAttempts < attMin) return false;
      if (confMin !== null && (r.confidenceScore ?? -1) < confMin) return false;

      const days = daysSince(r.lastPracticeDate, now);
      if (statusFilter === 'at-risk' && !r.atRisk) return false;
      if (statusFilter === 'active' && (days === null || days > 7)) return false;
      if (statusFilter === 'inactive' && !(days === null || days > 30)) return false;

      return true;
    });
  }, [rows, search, subjectFilter, accuracyMin, attemptsMin, confidenceMin, statusFilter, now]);

  const sorted = useMemo(() => {
    const [key, dir] = sort.split('-') as [string, 'asc' | 'desc'];
    const mul = dir === 'asc' ? 1 : -1;
    const improvement = (r: StudentRow) => r.trend === 'Improving' ? 1 : r.trend === 'Declining' ? -1 : 0;
    const valueOf = (r: StudentRow): number | string => {
      switch (key) {
        case 'name': return r.name.toLowerCase();
        case 'accuracy': return r.accuracyPercent;
        case 'avgScore': return r.averageScore;
        case 'attempts': return r.totalAttempts;
        case 'practiceStreak': return r.practiceStreak;
        case 'confidence': return r.confidenceScore ?? -1;
        case 'lastPractice': return r.lastPracticeDate ? new Date(r.lastPracticeDate).getTime() : -Infinity;
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

  // ── Summary widgets — different sorts/slices of the same row array ──────
  const withData = useMemo(() => rows.filter(r => r.hasData), [rows]);
  const atRiskCount = useMemo(() => rows.filter(r => r.atRisk).length, [rows]);
  const inactive7 = useMemo(() => rows.filter(r => { const d = daysSince(r.lastPracticeDate, now); return d === null || d > 7; }).length, [rows, now]);
  const inactive14 = useMemo(() => rows.filter(r => { const d = daysSince(r.lastPracticeDate, now); return d === null || d > 14; }).length, [rows, now]);
  const inactive30 = useMemo(() => rows.filter(r => { const d = daysSince(r.lastPracticeDate, now); return d === null || d > 30; }).length, [rows, now]);

  const topByAccuracy = useMemo(
    () => [...withData].sort((a, b) => b.accuracyPercent - a.accuracyPercent).slice(0, 5)
      .map(r => ({ label: r.name, count: r.accuracyPercent })),
    [withData],
  );
  const fastestImproving = useMemo(
    () => withData.filter(r => r.trend === 'Improving' && r.hasData)
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0)).slice(0, 5)
      .map(r => ({ label: r.name, count: r.accuracyPercent })),
    [withData],
  );
  const longestStreaks = useMemo(
    () => [...withData].sort((a, b) => b.practiceStreak - a.practiceStreak).slice(0, 5)
      .map(r => ({ label: r.name, count: r.practiceStreak })),
    [withData],
  );

  // ── Export ───────────────────────────────────────────────────────────────
  const exportHeaders = [
    'Name', 'Email', 'Class', 'Total Attempts', 'Questions Solved', 'Avg Score', 'Avg Accuracy',
    'Avg Time/Question (s)', 'Practice Streak', 'Revision Streak', 'Confidence Score',
    'Strongest Subject', 'Weakest Subject', 'Last Practice Date', 'Trend', 'Needs Attention',
  ];
  const exportRows = () => sorted.map(r => [
    r.name, r.email, r.className ?? '', r.totalAttempts, r.totalQuestionsSolved, r.averageScore,
    r.accuracyPercent, r.averageTimePerQuestionSec, r.practiceStreak, r.revisionStreak,
    r.confidenceScore ?? '', r.strongestSubject ?? '', r.weakestSubject ?? '',
    r.lastPracticeDate ? new Date(r.lastPracticeDate).toLocaleDateString() : 'Never',
    r.trend ?? '', r.atRisk ? 'Yes' : 'No',
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
        eyebrow="Analytics · Feature 2"
        title="Student Performance"
        subtitle="Every student's Practice Olympiad performance — spot who's improving, struggling, or needs intervention."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label="Students" value={rows.length} icon={Users} tone="brand" />
        <StatCard label="Needs Attention" value={atRiskCount} icon={AlertTriangle} tone="amber" />
        <StatCard label="Inactive 14+ days" value={inactive14} icon={TrendingDown} tone="violet" />
        <StatCard label="Longest streak" value={longestStreaks[0]?.count ?? 0} icon={Flame} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3">Top Performing (Accuracy)</h3>
          {topByAccuracy.length ? <RankedBarList items={topByAccuracy} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Fastest Improving</h3>
          {fastestImproving.length ? <RankedBarList items={fastestImproving} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><Flame size={14} />Longest Practice Streaks</h3>
          {longestStreaks.length ? <RankedBarList items={longestStreaks} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
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
          <Select value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} />
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
                { key: 'totalAttempts', label: 'Attempts', render: (r: StudentRow) => <span className="font-mono">{r.totalAttempts}</span> },
                { key: 'totalQuestionsSolved', label: 'Solved', render: (r: StudentRow) => <span className="font-mono">{r.totalQuestionsSolved}</span> },
                {
                  key: 'accuracyPercent', label: 'Accuracy',
                  render: (r: StudentRow) => (
                    <div className="min-w-[100px]">
                      <div className="flex items-center justify-between mb-1"><span className="font-mono text-[12px]">{r.accuracyPercent}%</span></div>
                      <ProgressBar value={r.accuracyPercent} tone={r.accuracyPercent >= 75 ? 'emerald' : r.accuracyPercent >= 50 ? 'amber' : 'rose'} />
                    </div>
                  ),
                },
                { key: 'averageScore', label: 'Avg Score', render: (r: StudentRow) => <span className="font-mono">{r.averageScore}</span> },
                { key: 'averageTimePerQuestionSec', label: 'Avg Time/Q', render: (r: StudentRow) => <span className="font-mono">{r.averageTimePerQuestionSec}s</span> },
                { key: 'practiceStreak', label: 'Practice Streak', render: (r: StudentRow) => <span className="font-mono">{r.practiceStreak}d</span> },
                { key: 'revisionStreak', label: 'Revision Streak', render: (r: StudentRow) => <span className="font-mono">{r.revisionStreak}d</span> },
                {
                  key: 'confidenceScore', label: 'Confidence',
                  render: (r: StudentRow) => r.confidenceScore === null ? <span className="text-fg3">—</span> : (
                    <Badge tone={r.confidenceScore >= 61 ? 'success' : r.confidenceScore >= 41 ? 'warning' : 'danger'}>{r.confidenceScore}</Badge>
                  ),
                },
                { key: 'strongestSubject', label: 'Strongest', render: (r: StudentRow) => <span className="text-fg2">{r.strongestSubject ?? '—'}</span> },
                { key: 'weakestSubject', label: 'Weakest', render: (r: StudentRow) => <span className="text-fg2">{r.weakestSubject ?? '—'}</span> },
                {
                  key: 'lastPracticeDate', label: 'Last Practice',
                  render: (r: StudentRow) => <span className="text-fg2">{r.lastPracticeDate ? new Date(r.lastPracticeDate).toLocaleDateString() : 'Never'}</span>,
                },
                {
                  key: 'trend', label: 'Trend',
                  render: (r: StudentRow) => r.trend === null ? <span className="text-fg3">—</span> : (
                    <Badge tone={r.trend === 'Improving' ? 'success' : r.trend === 'Declining' ? 'danger' : 'neutral'}>{r.trend}</Badge>
                  ),
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
