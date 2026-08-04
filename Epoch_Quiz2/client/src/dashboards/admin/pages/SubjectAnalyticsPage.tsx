import { useEffect, useMemo, useState } from 'react';
import {
  Download, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Users, Sparkles, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  PageHeader, Card, Button, Badge, Select, Table, ProgressBar, Skeleton, EmptyState, useToasts,
} from '../../shared/ui';
import { RankedBarList, TimeSeriesChart } from '../components/DashboardCharts';
import { exportCsv } from '../../../lib/csv';
import { useClasses, useBoards } from '../../../hooks/useCatalog';
import {
  useSubjectOverview, subjectAnalyticsApi,
  type SubjectOverviewRow, type SubjectChapterRow, type SubjectTrends,
} from '../../../hooks/useSubjectAnalytics';
import { getPerformanceBand } from '../../../lib/performanceBand';
import { buildSubjectInsights } from '../../../lib/subjectInsightsEngine';

/**
 * Admin Analytics — Feature 3: Subject Analytics.
 *
 * Practice Olympiad only. Overview/difficulty/growth numbers come
 * pre-aggregated from the server (subjectAnalytics.service.ts — platform-
 * wide, so aggregation happens there, not in the browser). This page reuses
 * getPerformanceBand() for band labels and buildSubjectInsights() for the
 * AI Insights card — the same reuse discipline as Feature 2.
 */

const SORT_OPTIONS = [
  { value: 'accuracy-desc', label: 'Accuracy (high–low)' },
  { value: 'score-desc', label: 'Score (high–low)' },
  { value: 'participation-desc', label: 'Participation (high–low)' },
  { value: 'attempts-desc', label: 'Attempts (high–low)' },
  { value: 'time-asc', label: 'Time/Question (fast–slow)' },
  { value: 'growth-desc', label: 'Growth (best–worst)' },
  { value: 'name-asc', label: 'Name (A–Z)' },
];

function bandTone(accuracy: number): 'emerald' | 'amber' | 'rose' {
  return accuracy >= 75 ? 'emerald' : accuracy >= 50 ? 'amber' : 'rose';
}

export function SubjectAnalyticsPage() {
  const { data: classes } = useClasses();
  const { data: boards } = useBoards();

  const [classFilter, setClassFilter] = useState('all');
  const [boardFilter, setBoardFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, loading, error } = useSubjectOverview({
    classExternalId: classFilter !== 'all' ? classFilter : undefined,
    boardExternalId: boardFilter !== 'all' ? boardFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { push, node: toastNode } = useToasts();

  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sort, setSort] = useState('accuracy-desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [comparisonIds, setComparisonIds] = useState<Set<string>>(new Set());

  const subjects = data?.subjects ?? [];

  const classOptions = [{ value: 'all', label: 'All classes' }, ...(classes ?? []).map(c => ({ value: c.id, label: c.name }))];
  const boardOptions = [{ value: 'all', label: 'All boards' }, ...(boards ?? []).map(b => ({ value: b.id, label: b.name }))];
  const subjectOptions = [{ value: 'all', label: 'All subjects' }, ...subjects.map(s => ({ value: s.subjectId, label: s.subjectName }))];

  const filtered = useMemo(
    () => subjectFilter === 'all' ? subjects : subjects.filter(s => s.subjectId === subjectFilter),
    [subjects, subjectFilter],
  );

  const sorted = useMemo(() => {
    const [key, dir] = sort.split('-') as [string, 'asc' | 'desc'];
    const mul = dir === 'asc' ? 1 : -1;
    const valueOf = (s: SubjectOverviewRow): number | string => {
      switch (key) {
        case 'accuracy': return s.accuracyPercent;
        case 'score': return s.averageScore;
        case 'participation': return s.totalStudentsPracticed;
        case 'attempts': return s.totalAttempts;
        case 'time': return s.averageTimePerQuestionSec;
        case 'growth': return s.growthPercent ?? -Infinity;
        case 'name': return s.subjectName.toLowerCase();
        default: return s.subjectName.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return a.subjectName.localeCompare(b.subjectName);
    });
  }, [filtered, sort]);

  const strongest5 = useMemo(
    () => [...subjects].filter(s => s.totalAttempts > 0).sort((a, b) => b.accuracyPercent - a.accuracyPercent).slice(0, 5)
      .map(s => ({ label: s.subjectName, count: s.accuracyPercent })),
    [subjects],
  );
  const weakest5 = useMemo(
    () => [...subjects].filter(s => s.totalAttempts > 0).sort((a, b) => a.accuracyPercent - b.accuracyPercent).slice(0, 5)
      .map(s => ({ label: s.subjectName, count: s.accuracyPercent })),
    [subjects],
  );

  const insights = useMemo(() => buildSubjectInsights(subjects), [subjects]);

  const mostPracticed = useMemo(() => subjects.length ? subjects.reduce((a, b) => (b.totalAttempts > a.totalAttempts ? b : a)) : null, [subjects]);
  const leastPracticed = useMemo(() => {
    const withData = subjects.filter(s => s.totalAttempts > 0);
    return withData.length ? withData.reduce((a, b) => (b.totalAttempts < a.totalAttempts ? b : a)) : null;
  }, [subjects]);
  const highestGrowth = useMemo(() => {
    const withGrowth = subjects.filter(s => s.growthPercent !== null);
    return withGrowth.length ? withGrowth.reduce((a, b) => (b.growthPercent! > a.growthPercent! ? b : a)) : null;
  }, [subjects]);
  const declining = useMemo(() => {
    const withGrowth = subjects.filter(s => s.growthPercent !== null);
    return withGrowth.length ? withGrowth.reduce((a, b) => (b.growthPercent! < a.growthPercent! ? b : a)) : null;
  }, [subjects]);

  const comparisonRows = useMemo(() => subjects.filter(s => comparisonIds.has(s.subjectId)), [subjects, comparisonIds]);

  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleComparison = (id: string) => setComparisonIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Export ───────────────────────────────────────────────────────────────
  const exportHeaders = [
    'Subject', 'Students Practiced', 'Students Never Practiced', 'Total Attempts', 'Questions Attempted',
    'Correct', 'Wrong', 'Skipped', 'Avg Accuracy', 'Avg Score', 'Avg Time/Question (s)',
    'Easy Accuracy', 'Medium Accuracy', 'Hard Accuracy', 'Growth %', 'Last Activity',
  ];
  const exportRows = () => sorted.map(s => [
    s.subjectName, s.totalStudentsPracticed, s.totalStudentsNeverPracticed, s.totalAttempts, s.totalQuestionsAttempted,
    s.totalCorrect, s.totalWrong, s.totalSkipped, s.accuracyPercent, s.averageScore, s.averageTimePerQuestionSec,
    s.difficulty.EASY ?? '', s.difficulty.MEDIUM ?? '', s.difficulty.HARD ?? '', s.growthPercent ?? '',
    s.lastActivityDate ? new Date(s.lastActivityDate).toLocaleDateString() : '—',
  ]);

  const handleExportCsv = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv('subject-analytics.csv', exportRows(), exportHeaders);
  };
  const handleExportExcel = () => {
    if (!sorted.length) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    const sheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows()]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Subject Analytics');
    XLSX.writeFile(workbook, 'subject-analytics.xlsx');
  };

  return (
    <>
      {toastNode}
      <PageHeader
        eyebrow="Analytics · Feature 3"
        title="Subject Analytics"
        subtitle="Platform-wide Practice Olympiad performance, grouped by subject."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExportCsv}>Export CSV</Button>
            <Button variant="outline" icon={Download} onClick={handleExportExcel}>Export Excel</Button>
          </>
        }
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={classFilter} onChange={setClassFilter} options={classOptions} />
          <Select value={boardFilter} onChange={setBoardFilter} options={boardOptions} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <span className="text-fg4 text-[12px]">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date"
            className="h-10 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1" />
          <Select value={subjectFilter} onChange={setSubjectFilter} options={subjectOptions} />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} className="ml-auto" />
        </div>
        <div className="text-[12px] text-fg3 mt-3">{loading ? 'Loading…' : `${sorted.length} of ${subjects.length} subjects`}</div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingUp size={14} />Top 5 Strongest Subjects</h3>
          {strongest5.length ? <RankedBarList items={strongest5} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-fg1 mb-3 flex items-center gap-1.5"><TrendingDown size={14} />Top 5 Weakest Subjects</h3>
          {weakest5.length ? <RankedBarList items={weakest5} /> : <p className="text-[12px] text-fg3">No data yet.</p>}
        </Card>
      </div>

      <Card className="p-4 mb-5">
        <h3 className="text-[13px] font-semibold text-fg1 mb-3">Subject Comparison</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {subjects.map(s => (
            <button
              key={s.subjectId}
              onClick={() => toggleComparison(s.subjectId)}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
                comparisonIds.has(s.subjectId) ? 'bg-brand text-brand-ink border-transparent' : 'bg-surface1 border-line text-fg2 hover:border-brand/40'
              }`}
            >
              {s.subjectName}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Most Practiced" value={mostPracticed?.subjectName ?? '—'} icon={Users} />
          <MiniStat label="Least Practiced" value={leastPracticed?.subjectName ?? '—'} icon={Users} />
          <MiniStat label="Highest Growth" value={highestGrowth ? `${highestGrowth.subjectName} (+${highestGrowth.growthPercent}%)` : '—'} icon={TrendingUp} />
          <MiniStat label="Declining" value={declining && declining.growthPercent !== null && declining.growthPercent < 0 ? `${declining.subjectName} (${declining.growthPercent}%)` : 'None'} icon={TrendingDown} />
        </div>

        {comparisonRows.length > 0 && (
          <Table
            columns={[
              { key: 'subjectName', label: 'Subject' },
              { key: 'accuracyPercent', label: 'Accuracy', render: (s: SubjectOverviewRow) => `${s.accuracyPercent}%` },
              { key: 'averageScore', label: 'Score' },
              { key: 'totalAttempts', label: 'Attempts' },
              { key: 'averageTimePerQuestionSec', label: 'Time/Q', render: (s: SubjectOverviewRow) => `${s.averageTimePerQuestionSec}s` },
              { key: 'totalStudentsPracticed', label: 'Participation' },
            ]}
            rows={comparisonRows}
          />
        )}
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : !sorted.length ? (
        <EmptyState icon={Layers} title="No subject data yet" desc="No Practice Olympiad attempts match these filters." />
      ) : (
        <div className="space-y-4">
          {sorted.map(s => (
            <SubjectCard
              key={s.subjectId}
              subject={s}
              expanded={expanded.has(s.subjectId)}
              onToggle={() => toggleExpanded(s.subjectId)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-line bg-surface1 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-fg3 mb-1"><Icon size={12} />{label}</div>
      <div className="text-[13px] font-semibold text-fg1 truncate">{value}</div>
    </div>
  );
}

function SubjectCard({ subject, expanded, onToggle }: { subject: SubjectOverviewRow; expanded: boolean; onToggle: () => void }) {
  const band = getPerformanceBand(subject.accuracyPercent);
  const practiced = subject.totalStudentsPracticed;
  const never = subject.totalStudentsNeverPracticed;
  const distributionTotal = Math.max(1, practiced + never);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-[16px] text-fg1">{subject.subjectName}</h3>
            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${band.pillClass}`}>{band.emoji} {band.label}</span>
            {subject.growthPercent !== null && (
              <Badge tone={subject.growthPercent >= 0 ? 'success' : 'danger'}>
                {subject.growthPercent >= 0 ? '+' : ''}{subject.growthPercent}% (30d)
              </Badge>
            )}
          </div>
          <p className="text-[11.5px] text-fg3 mt-1">
            Last activity: {subject.lastActivityDate ? new Date(subject.lastActivityDate).toLocaleDateString() : 'Never'}
          </p>
        </div>
        <Button variant="outline" size="sm" icon={expanded ? ChevronUp : ChevronDown} onClick={onToggle}>
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Students Practiced" value={practiced} />
        <Stat label="Total Attempts" value={subject.totalAttempts} />
        <Stat label="Questions Attempted" value={subject.totalQuestionsAttempted} />
        <Stat label="Correct" value={subject.totalCorrect} />
        <Stat label="Wrong" value={subject.totalWrong} />
        <Stat label="Skipped" value={subject.totalSkipped} />
        <Stat label="Average Score" value={subject.averageScore} />
        <Stat label="Avg Time/Question" value={`${subject.averageTimePerQuestionSec}s`} />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1 text-[11.5px] text-fg3">
          <span>Accuracy</span><span>{subject.accuracyPercent}%</span>
        </div>
        <ProgressBar value={subject.accuracyPercent} tone={bandTone(subject.accuracyPercent)} />
      </div>

      <div className="mb-4">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3 mb-2">Difficulty Analysis</p>
        <div className="space-y-2">
          {(['EASY', 'MEDIUM', 'HARD'] as const).map(band2 => {
            const acc = subject.difficulty[band2];
            return (
              <div key={band2}>
                <div className="flex items-center justify-between mb-1 text-[11.5px] text-fg3">
                  <span>{band2.charAt(0) + band2.slice(1).toLowerCase()}</span>
                  <span>{acc === null ? 'No data' : `${acc}%`}</span>
                </div>
                <ProgressBar value={acc ?? 0} tone={acc === null ? 'brand' : bandTone(acc)} />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3 mb-2">Student Distribution</p>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-surface2">
          <div className="h-full bg-emerald-500" style={{ width: `${(practiced / distributionTotal) * 100}%` }} />
          <div className="h-full bg-surface3" style={{ width: `${(never / distributionTotal) * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-fg3">
          <span>{practiced} practiced</span>
          <span>{never} never practiced</span>
        </div>
      </div>

      {expanded && <SubjectExpandedDetail subjectId={subject.subjectId} />}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface1 px-3 py-2.5">
      <div className="text-[15px] font-display font-semibold text-fg1">{value}</div>
      <div className="text-[11px] text-fg3">{label}</div>
    </div>
  );
}

function SubjectExpandedDetail({ subjectId }: { subjectId: string }) {
  const [chapters, setChapters] = useState<SubjectChapterRow[] | null>(null);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly');
  const [trends, setTrends] = useState<SubjectTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChaptersLoading(true);
    subjectAnalyticsApi.getChapters(subjectId, {})
      .then(data => { if (!cancelled) setChapters(data); })
      .finally(() => { if (!cancelled) setChaptersLoading(false); });
    return () => { cancelled = true; };
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    setTrendsLoading(true);
    subjectAnalyticsApi.getTrends(subjectId, granularity, {})
      .then(data => { if (!cancelled) setTrends(data); })
      .finally(() => { if (!cancelled) setTrendsLoading(false); });
    return () => { cancelled = true; };
  }, [subjectId, granularity]);

  return (
    <div className="mt-5 pt-5 border-t border-line space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3 mb-2">Chapter Performance</p>
        {chaptersLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : chapters && chapters.length ? (
          <Table
            columns={[
              { key: 'topicName', label: 'Chapter' },
              { key: 'totalAttempts', label: 'Attempts' },
              { key: 'accuracyPercent', label: 'Accuracy', render: (c: SubjectChapterRow) => `${c.accuracyPercent}%` },
              { key: 'averageScore', label: 'Avg Score' },
              { key: 'averageTimePerQuestionSec', label: 'Avg Time', render: (c: SubjectChapterRow) => `${c.averageTimePerQuestionSec}s` },
              {
                key: 'band', label: 'Performance Band',
                render: (c: SubjectChapterRow) => {
                  const b = getPerformanceBand(c.accuracyPercent);
                  return <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${b.pillClass}`}>{b.emoji} {b.label}</span>;
                },
              },
            ]}
            rows={chapters}
          />
        ) : (
          <p className="text-[12px] text-fg3">No chapter-level data yet for this subject.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg3">Subject Trends</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant={granularity === 'weekly' ? 'soft' : 'ghost'} onClick={() => setGranularity('weekly')}>Weekly</Button>
            <Button size="sm" variant={granularity === 'monthly' ? 'soft' : 'ghost'} onClick={() => setGranularity('monthly')}>Monthly</Button>
          </div>
        </div>
        {trendsLoading || !trends ? (
          <Skeleton className="h-36 rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] text-fg3 mb-1.5">Accuracy over time</p>
              <TimeSeriesChart data={trends.accuracyOverTime} />
            </div>
            <div>
              <p className="text-[11px] text-fg3 mb-1.5">Attempts over time</p>
              <TimeSeriesChart data={trends.attemptsOverTime} colorVar="var(--brand)" />
            </div>
            <div>
              <p className="text-[11px] text-fg3 mb-1.5">Participation over time</p>
              <TimeSeriesChart data={trends.participationOverTime} colorVar="var(--brand)" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
