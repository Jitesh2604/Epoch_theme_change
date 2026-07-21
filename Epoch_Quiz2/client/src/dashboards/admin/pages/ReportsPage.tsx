import { useState, useMemo } from 'react';
import {
  Award, BarChart3, Clock, Download, FileText,
  Users, TrendingUp, CheckCircle2, Filter, Trophy,
} from 'lucide-react';
import {
  PageHeader, Card, StatCard, Button, Select, Badge,
  ProgressBar, Skeleton, Table, Avatar, Pagination,
} from '../../shared/ui';
import { useSubmissions } from '../../../hooks/useSubmissions';
import { useDashboardStats } from '../../../hooks/useDashboard';
import { useAssessments } from '../../../hooks/useAssessments';
import { useStudents } from '../../../hooks/useUsers';
import { useQuizAttempts, type QuizAttemptSortBy } from '../../../hooks/useQuizAttempts';
import { useRealSubjects } from '../../../hooks/useSubjects';
import { exportCsv } from '../../../lib/csv';

// Teacher module is temporarily hidden — restore the 'teachers' tab, the
// useTeachers import above, and every block marked below to bring it back.
type Tab = 'overview' | 'assessments' | 'students' | 'practice';
type Range = '7d' | '30d' | '90d' | 'all';

function cutoffDate(range: Range): Date | null {
  if (range === 'all') return null;
  const ms = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date(); d.setDate(d.getDate() - ms); return d;
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('30d');

  const { data: stats, loading: statsLoading } = useDashboardStats();
  const { data: submissions, loading: subsLoading } = useSubmissions({ limit: 200 });
  const { data: assessments, loading: assLoading } = useAssessments({ limit: 100 });
  const { data: students, loading: studLoading } = useStudents({ limit: 100 });
  const { data: realSubjects } = useRealSubjects();

  // ── Practice/Olympiad tab — server-side paginated/filtered/sorted, unlike
  //     the other tabs, which fetch one fixed batch and slice it client-side.
  //     This table is expected to grow into the thousands, so every filter/
  //     sort/page change here is a fresh request, never a full-table load.
  const [pPage, setPPage]         = useState(1);
  const [pSortBy, setPSortBy]     = useState<QuizAttemptSortBy>('latest');
  const [pStatus, setPStatus]     = useState('');
  const [pQuizType, setPQuizType] = useState('');
  const [pSubject, setPSubject]   = useState('');
  const [pStudentId, setPStudentId] = useState('');
  const [pDateFrom, setPDateFrom] = useState('');
  const [pDateTo, setPDateTo]     = useState('');

  const { data: practiceAttempts, loading: practiceLoading, error: practiceError } = useQuizAttempts({
    page: pPage, limit: 20, sortBy: pSortBy,
    status: pStatus || undefined,
    quizType: pQuizType || undefined,
    subjectExternalId: pSubject || undefined,
    studentId: pStudentId || undefined,
    dateFrom: pDateFrom || undefined,
    dateTo: pDateTo || undefined,
  });

  // Any filter/sort change invalidates the current page — jump back to 1
  // rather than risk showing an out-of-range, empty page.
  const setPracticeFilter = (setter: (v: string) => void) => (v: string) => { setter(v); setPPage(1); };

  const loading = statsLoading || subsLoading || assLoading || studLoading;

  const cutoff = cutoffDate(range);

  const filteredSubs = useMemo(() => {
    const all = submissions?.items ?? [];
    if (!cutoff) return all;
    return all.filter(s => s.submittedAt && new Date(s.submittedAt) >= cutoff!);
  }, [submissions, range]);

  const subjectMap = useMemo(() => {
    const m: Record<string, { attempts: number; totalPct: number; passed: number }> = {};
    for (const s of filteredSubs) {
      const subj = s.assessment.subject?.name ?? 'Other';
      if (!m[subj]) m[subj] = { attempts: 0, totalPct: 0, passed: 0 };
      m[subj].attempts++;
      m[subj].totalPct += s.percent;
      if (s.percent >= 50) m[subj].passed++;
    }
    return Object.entries(m)
      .map(([subject, v]) => ({ subject, attempts: v.attempts, avg: Math.round(v.totalPct / v.attempts), passRate: Math.round((v.passed / v.attempts) * 100) }))
      .sort((a, b) => b.attempts - a.attempts);
  }, [filteredSubs]);

  const avgScore = filteredSubs.length
    ? Math.round(filteredSubs.reduce((s, r) => s + r.percent, 0) / filteredSubs.length)
    : 0;
  const completionRate = stats?.completionRate ?? 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'assessments', label: 'Assessments' },
    { key: 'students', label: 'Students' },
    { key: 'practice', label: 'Practice/Olympiad' },
  ];

  const handleExport = () => {
    if (tab === 'overview') {
      exportCsv('overview-report.csv', subjectMap.map(s => [s.subject, String(s.attempts), String(s.avg), String(s.passRate)]), ['Subject', 'Attempts', 'Avg Score (%)', 'Pass Rate (%)']);
    } else if (tab === 'assessments') {
      const rows = (assessments?.items ?? []).map(a => [a.title, a.status, String(a.questionCount), String(a.duration), String(a.attempts), a.createdBy.name, a.createdAt]);
      exportCsv('assessments-report.csv', rows, ['Title', 'Status', 'Questions', 'Duration (min)', 'Attempts', 'Created By', 'Created At']);
    } else if (tab === 'students') {
      const rows = (students?.items ?? []).map(s => [s.name, s.email, s.status, String(s.attempted), String(s.avgScore), s.schoolName ?? '']);
      exportCsv('students-report.csv', rows, ['Name', 'Email', 'Status', 'Attempted', 'Avg Score (%)', 'School']);
    } else if (tab === 'practice') {
      // Exports the current page only (same as every other tab here) — a
      // deliberate scalability call, not a shortcut: this table is expected
      // to reach thousands of rows, and pulling all of them into the browser
      // just to build a CSV would defeat the point of server-side paging.
      const rows = (practiceAttempts?.items ?? []).map(a => [
        a.student.name, a.student.email, a.quiz.title, a.quiz.quizType, a.quiz.subject?.name ?? '',
        String(a.attemptNumber), a.status, a.startTime, a.endTime ?? '', String(a.timeTakenSec),
        String(a.score), String(a.percentage), String(a.correctAnswers), String(a.wrongAnswers), String(a.skipped),
      ]);
      exportCsv('practice-olympiad-report.csv', rows, [
        'Student Name', 'Student Email', 'Quiz Title', 'Quiz Type', 'Subject',
        'Attempt #', 'Status', 'Start Time', 'End Time', 'Time Taken (s)',
        'Score', 'Percentage', 'Correct', 'Wrong', 'Skipped',
      ]);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Reports & Analytics"
        subtitle="Platform-wide performance metrics across all assessments and students."
        actions={
          <div className="flex gap-2">
            <Select
              value={range}
              onChange={v => setRange(v as Range)}
              options={[
                { value: '7d',  label: 'Last 7 days' },
                { value: '30d', label: 'Last 30 days' },
                { value: '90d', label: 'Last 90 days' },
                { value: 'all', label: 'All time'     },
              ]}
            />
            <Button variant="outline" icon={Download} onClick={handleExport}>Export CSV</Button>
          </div>
        }
      />

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 p-1 bg-surface1/50 rounded-xl w-fit max-w-full overflow-x-auto border border-line no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition shrink-0 whitespace-nowrap ${
              tab === t.key ? 'bg-brand text-brand-ink shadow-elev1' : 'text-fg2 hover:text-fg1'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
            {statsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
            ) : (
              <>
                <StatCard label="Total Submissions"  value={stats?.counts.submissions ?? 0}   icon={BarChart3}  tone="brand"   />
                <StatCard label="Avg Score"           value={`${avgScore}%`}                   icon={TrendingUp} tone="emerald" />
                <StatCard label="Total Assessments"   value={stats?.counts.assessments ?? 0}   icon={FileText}   tone="amber"   />
                <StatCard label="Practice/Olympiad Attempts" value={stats?.counts.practiceAttempts ?? 0} icon={Trophy} tone="brand" />
                <StatCard label="Completion Rate"     value={`${completionRate}%`}              icon={CheckCircle2} tone="violet" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-[16px] text-fg1">Performance by Subject</h3>
                <span className="text-[11px] text-fg3">{filteredSubs.length} submissions</span>
              </div>
              {subsLoading ? (
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : subjectMap.length === 0 ? (
                <div className="text-center py-10 text-fg3 text-[13px]">No data for this period</div>
              ) : (
                <div className="space-y-4">
                  {subjectMap.slice(0, 6).map(s => (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-fg1">{s.subject}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-fg3">{s.attempts} attempts</span>
                          <span className="text-[11px] text-fg3">Pass: {s.passRate}%</span>
                          <span className="text-[13px] font-mono font-semibold text-fg1">{s.avg}%</span>
                        </div>
                      </div>
                      <ProgressBar value={s.avg} tone={s.avg >= 75 ? 'emerald' : s.avg >= 50 ? 'amber' : 'rose'} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Platform Summary</h3>
              {statsLoading ? (
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Total Students',   value: stats?.counts.students    ?? 0, icon: Users,       color: 'text-violet-300'  },
                    { label: 'Total Assessments',value: stats?.counts.assessments ?? 0, icon: FileText,    color: 'text-amber-300'   },
                    { label: 'Total Submissions',value: stats?.counts.submissions ?? 0, icon: BarChart3,   color: 'text-brand'       },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-surface1 border border-line">
                      <div className={`w-9 h-9 rounded-lg bg-surface2 border border-line grid place-items-center ${item.color}`}>
                        <item.icon size={15} />
                      </div>
                      <span className="text-[13px] text-fg1 flex-1">{item.label}</span>
                      <span className="font-mono font-semibold text-[15px] text-fg1">{item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Recent Submissions</h3>
            {subsLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : filteredSubs.length === 0 ? (
              <div className="text-center py-10 text-fg3 text-[13px]">No submissions in this period</div>
            ) : (
              <Table
                columns={[
                  { key: 'student', label: 'Student', render: s => <span className="font-medium text-fg1">{s.student?.name ?? '—'}</span> },
                  { key: 'assessment', label: 'Assessment', render: s => <span className="text-fg2 truncate max-w-[200px] block">{s.assessment.title}</span> },
                  { key: 'subject', label: 'Subject', render: s => <span className="text-fg3">{s.assessment.subject?.name ?? '—'}</span> },
                  { key: 'score', label: 'Score', render: s => <span className="font-mono">{s.score}/{s.totalMarks}</span> },
                  { key: 'percent', label: '%', render: s => <Badge tone={s.percent >= 50 ? 'success' : 'danger'} dot={false}>{s.percent}%</Badge> },
                  { key: 'date', label: 'Date', render: s => <span className="text-[11px] text-fg3">{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '—'}</span> },
                ]}
                rows={filteredSubs.slice(0, 15)}
              />
            )}
          </Card>
        </>
      )}

      {/* ── Assessments Tab ──────────────────────────────────────── */}
      {tab === 'assessments' && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="font-display font-semibold text-[15px] text-fg1">All Assessments</h3>
            <span className="text-[11px] text-fg3">{assessments?.meta?.total ?? 0} total</span>
          </div>
          {assLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table
              columns={[
                { key: 'title',     label: 'Title',    render: a => <span className="font-semibold text-fg1">{a.title}</span> },
                { key: 'subject',   label: 'Subject',  render: a => <span className="text-fg2">{a.subject?.name ?? '—'}</span> },
                { key: 'status',    label: 'Status',   render: a => <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>{a.status.toLowerCase()}</Badge> },
                { key: 'questions', label: 'Questions', render: a => <span className="font-mono">{a.questionCount}</span> },
                { key: 'attempts',  label: 'Attempts',  render: a => <span className="font-mono">{a.attempts}</span> },
                { key: 'createdBy', label: 'Created By', render: a => <span className="text-fg2">{a.createdBy.name}</span> },
                { key: 'createdAt', label: 'Created',   render: a => <span className="text-[11px] text-fg3">{new Date(a.createdAt).toLocaleDateString()}</span> },
              ]}
              rows={assessments?.items ?? []}
              empty={<div className="text-center py-12 text-fg3 text-[13px]">No assessments yet</div>}
            />
          )}
        </Card>
      )}

      {/* ── Students Tab ─────────────────────────────────────────── */}
      {tab === 'students' && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="font-display font-semibold text-[15px] text-fg1">Student Performance</h3>
            <span className="text-[11px] text-fg3">{students?.meta?.total ?? 0} students</span>
          </div>
          {studLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table
              columns={[
                { key: 'name',     label: 'Student',   render: s => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} hue={s.avatarHue} />
                    <div><div className="font-semibold text-fg1 text-[13px]">{s.name}</div><div className="text-[11px] text-fg3">{s.email}</div></div>
                  </div>
                )},
                { key: 'school',   label: 'School',    render: s => <span className="text-fg2">{s.schoolName ?? '—'}</span> },
                { key: 'attempted',label: 'Attempted',  render: s => <span className="font-mono">{s.attempted}</span> },
                { key: 'avgScore', label: 'Avg Score',  render: s => (
                  <div className="min-w-[120px]">
                    <div className="flex justify-between mb-1"><span className="font-mono text-[12px]">{s.avgScore}%</span></div>
                    <ProgressBar value={s.avgScore} tone={s.avgScore >= 75 ? 'emerald' : s.avgScore >= 50 ? 'amber' : 'rose'} />
                  </div>
                )},
                { key: 'rank',     label: 'Rank',      render: s => <span className="font-mono text-fg2">#{s.rank || '—'}</span> },
                { key: 'status',   label: 'Status',    render: s => <Badge tone={s.status === 'ACTIVE' ? 'success' : s.status === 'PENDING' ? 'warning' : 'neutral'}>{s.status.toLowerCase()}</Badge> },
              ]}
              rows={students?.items ?? []}
              empty={<div className="text-center py-12 text-fg3 text-[13px]">No students yet</div>}
            />
          )}
        </Card>
      )}

      {/* ── Practice/Olympiad Tab ────────────────────────────────── */}
      {tab === 'practice' && (
        <>
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={pStudentId}
                onChange={setPracticeFilter(setPStudentId)}
                options={[{ value: '', label: 'All students' }, ...((students?.items ?? []).map(s => ({ value: s.id, label: s.name })))]}
              />
              <Select
                value={pSubject}
                onChange={setPracticeFilter(setPSubject)}
                options={[{ value: '', label: 'All subjects' }, ...((realSubjects ?? []).map(s => ({ value: s.id, label: s.name })))]}
              />
              <Select
                value={pQuizType}
                onChange={setPracticeFilter(setPQuizType)}
                options={[
                  { value: '',         label: 'All types' },
                  { value: 'PRACTICE', label: 'Practice'  },
                  { value: 'OLYMPIAD', label: 'Olympiad'  },
                ]}
              />
              <Select
                value={pStatus}
                onChange={setPracticeFilter(setPStatus)}
                options={[
                  { value: '',            label: 'All statuses' },
                  { value: 'IN_PROGRESS', label: 'In progress'  },
                  { value: 'SUBMITTED',   label: 'Submitted'    },
                  { value: 'ABANDONED',   label: 'Abandoned'    },
                ]}
              />
              <input
                type="date"
                value={pDateFrom}
                onChange={e => { setPDateFrom(e.target.value); setPPage(1); }}
                className="h-9 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1"
                aria-label="From date"
              />
              <span className="text-fg4 text-[12px]">to</span>
              <input
                type="date"
                value={pDateTo}
                onChange={e => { setPDateTo(e.target.value); setPPage(1); }}
                className="h-9 px-3 rounded-xl border border-line bg-surface1 text-[13px] text-fg1"
                aria-label="To date"
              />
              <Select
                value={pSortBy}
                onChange={v => { setPSortBy(v as QuizAttemptSortBy); setPPage(1); }}
                options={[
                  { value: 'latest',     label: 'Latest first'   },
                  { value: 'score_desc', label: 'Highest score'  },
                  { value: 'score_asc',  label: 'Lowest score'   },
                  { value: 'time_desc',  label: 'Longest time'   },
                  { value: 'time_asc',   label: 'Shortest time'  },
                ]}
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h3 className="font-display font-semibold text-[15px] text-fg1">Practice / Olympiad Attempts</h3>
              <span className="text-[11px] text-fg3">{practiceAttempts?.meta?.total ?? 0} total</span>
            </div>
            {practiceError && (
              <div className="p-4 text-[13px] text-danger">Could not load attempts — {practiceError}</div>
            )}
            {practiceLoading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : (
              <>
                <Table
                  columns={[
                    { key: 'student', label: 'Student', render: a => (
                      <div>
                        <div className="font-semibold text-fg1 text-[13px]">{a.student.name}</div>
                        <div className="text-[11px] text-fg3">{a.student.email}</div>
                      </div>
                    )},
                    { key: 'quiz', label: 'Quiz', render: a => (
                      <div>
                        <div className="text-fg1 truncate max-w-[180px]">{a.quiz.title}</div>
                        <div className="text-[11px] text-fg3">{a.quiz.subject?.name ?? '—'}</div>
                      </div>
                    )},
                    { key: 'type', label: 'Type', render: a => <Badge tone={a.quiz.quizType === 'OLYMPIAD' ? 'brand' : 'neutral'} dot={false}>{a.quiz.quizType.toLowerCase()}</Badge> },
                    { key: 'attemptNumber', label: 'Attempt #', render: a => <span className="font-mono">{a.attemptNumber}</span> },
                    { key: 'status', label: 'Status', render: a => (
                      <Badge tone={a.status === 'SUBMITTED' ? 'success' : a.status === 'IN_PROGRESS' ? 'warning' : 'neutral'} dot={false}>
                        {a.status.replace('_', ' ').toLowerCase()}
                      </Badge>
                    )},
                    { key: 'score', label: 'Score', render: a => (
                      <span className="font-mono">{a.isSubmitted ? `${a.score} (${a.percentage}%)` : '—'}</span>
                    )},
                    { key: 'breakdown', label: 'Correct / Wrong / Skipped', render: a => (
                      <span className="font-mono text-[12px]">
                        <span className="text-emerald-500">{a.correctAnswers}</span>
                        {' / '}
                        <span className="text-rose-500">{a.wrongAnswers}</span>
                        {' / '}
                        <span className="text-fg3">{a.skipped}</span>
                      </span>
                    )},
                    { key: 'timeTaken', label: 'Time Taken', render: a => <span className="font-mono text-[12px]">{a.timeTakenSec ? `${Math.round(a.timeTakenSec / 60)}m` : '—'}</span> },
                    { key: 'startTime', label: 'Started', render: a => <span className="text-[11px] text-fg3">{new Date(a.startTime).toLocaleString()}</span> },
                    { key: 'endTime', label: 'Submitted', render: a => <span className="text-[11px] text-fg3">{a.endTime ? new Date(a.endTime).toLocaleString() : '—'}</span> },
                  ]}
                  rows={practiceAttempts?.items ?? []}
                  empty={<div className="text-center py-12 text-fg3 text-[13px]">No Practice/Olympiad attempts match these filters</div>}
                />
                <Pagination
                  page={practiceAttempts?.meta?.page ?? 1}
                  totalPages={practiceAttempts?.meta?.totalPages ?? 1}
                  onChange={setPPage}
                  disabled={practiceLoading}
                />
              </>
            )}
          </Card>
        </>
      )}

      {/* Teacher module is temporarily hidden — restore the 'teachers' Tab
          union member, the useTeachers hook call, and the block below to
          bring this tab back.
      {tab === 'teachers' && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 className="font-display font-semibold text-[15px] text-fg1">Teacher Activity</h3>
            <span className="text-[11px] text-fg3">{teachers?.meta?.total ?? 0} teachers</span>
          </div>
          {teachLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table
              columns={[
                { key: 'name',        label: 'Teacher',     render: t => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={t.name} hue={t.avatarHue} />
                    <div><div className="font-semibold text-fg1 text-[13px]">{t.name}</div><div className="text-[11px] text-fg3">{t.email}</div></div>
                  </div>
                )},
                { key: 'school',      label: 'School',      render: t => <span className="text-fg2">{t.schoolName ?? '—'}</span> },
                { key: 'assessments', label: 'Assessments',  render: t => <span className="font-mono">{t.assessments}</span> },
                { key: 'status',      label: 'Status',       render: t => <Badge tone={t.status === 'ACTIVE' ? 'success' : t.status === 'PENDING' ? 'warning' : 'neutral'}>{t.status.toLowerCase()}</Badge> },
                { key: 'joined',      label: 'Joined',       render: t => <span className="text-[11px] text-fg3">{new Date(t.joinedAt).toLocaleDateString()}</span> },
              ]}
              rows={teachers?.items ?? []}
              empty={<div className="text-center py-12 text-fg3 text-[13px]">No teachers yet</div>}
            />
          )}
        </Card>
      )}
      */}
    </>
  );
}
