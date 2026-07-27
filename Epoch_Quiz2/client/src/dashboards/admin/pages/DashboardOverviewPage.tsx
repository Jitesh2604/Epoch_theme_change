import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, ClipboardList, ArrowUpRight, Trophy, Users, Activity,
  BookOpen, Layers, Landmark, School, HelpCircle, AlertTriangle, UserPlus,
  FilePlus, Upload, BarChart3, Gauge, Clock, Hash, Target, Eye,
} from 'lucide-react';
import { Card, PageHeader, StatCard, Badge, Avatar, Button, Skeleton, EmptyState, Table } from '../../shared/ui';
import { useDashboardStats, useAdminOverview } from '../../../hooks/useDashboard';
import { useStudents } from '../../../hooks/useUsers';
import { useQuizAttempts } from '../../../hooks/useQuizAttempts';
import { useAuth } from '../../../lib/authStore';
import { buildSystemAlerts } from '../../../lib/adminDashboardInsights';
import { TimeSeriesChart, RankedBarList, AccuracyDistributionBars } from '../components/DashboardCharts';

/**
 * Feature A1: Admin Dashboard.
 *
 * This IS the pre-existing `/admin` index page (DashboardOverviewPage),
 * expanded in place rather than duplicated — it already owned
 * useDashboardStats() and the recent-assessments/recent-submissions cards;
 * everything below builds on top of that same data plus one new endpoint
 * (useAdminOverview) and two more existing endpoints reused as-is
 * (useStudents, useQuizAttempts) for Recent Registrations / Recent Practice
 * Activity — no new "list students"/"list attempts" logic anywhere here.
 */

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Percentage change between the first and second half of a daily series —
 *  the only "previous period" comparison cheaply available from the
 *  30-day charts already fetched, per the spec's own "if historical data
 *  exists" qualifier (no comparison is fabricated when there isn't enough
 *  history to support one). */
function periodChange(series: { count: number }[]): string | undefined {
  if (series.length < 14) return undefined;
  const half = Math.floor(series.length / 2);
  const prior = series.slice(0, half).reduce((s, d) => s + d.count, 0);
  const recent = series.slice(half).reduce((s, d) => s + d.count, 0);
  if (prior === 0) return recent > 0 ? '+100%' : undefined;
  const pct = Math.round(((recent - prior) / prior) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% vs prior period`;
}

function QuickActionButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-line hover:border-line2 hover:bg-surface1/50 transition text-center"
    >
      <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center"><Icon size={18} /></div>
      <span className="text-[12px] font-semibold text-fg1">{label}</span>
    </button>
  );
}

export function DashboardOverviewPage() {
  const navigate = useNavigate();
  const user = useAuth();

  const { data: stats, loading: statsLoading, error: statsError } = useDashboardStats();
  const { data: overview, loading: overviewLoading, error: overviewError } = useAdminOverview();
  const { data: recentStudents, loading: studentsLoading } = useStudents({ limit: 5 });
  const { data: recentActivity, loading: activityLoading } = useQuizAttempts({ limit: 5, sortBy: 'latest' });

  const alerts = useMemo(() => buildSystemAlerts(overview ?? null, stats ?? null), [overview, stats]);
  const studentGrowthChange = useMemo(() => (overview ? periodChange(overview.charts.studentGrowth) : undefined), [overview]);
  const practiceActivityChange = useMemo(() => (overview ? periodChange(overview.charts.practiceActivity) : undefined), [overview]);

  const loading = statsLoading || overviewLoading;

  return (
    <>
      <PageHeader
        eyebrow="Admin Dashboard"
        title={`Welcome back, ${user?.name ?? 'Admin'} 👋`}
        subtitle="A real-time overview of the entire Epoch Quiz platform."
        actions={<Button icon={ArrowUpRight} onClick={() => navigate('/admin/reports')}>Open Full Reports</Button>}
      />

      {(statsError || overviewError) && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Could not load some dashboard data — {statsError || overviewError}
        </div>
      )}

      {!!alerts.length && (
        <div className="mb-6 space-y-2">
          {alerts.map(a => (
            <div
              key={a.id}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-[13px] font-medium ${
                a.severity === 'critical'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/25 dark:text-rose-400'
                  : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-400'
              }`}
            >
              <AlertTriangle size={15} className="shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Dashboard Overview ─────────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">Dashboard Overview</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 9 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard
              label="Total Students" value={stats?.counts.students ?? 0} icon={GraduationCap} tone="violet"
              change={studentGrowthChange}
              trend={overview?.charts.studentGrowth.slice(-14).map(d => d.count)}
            />
            <StatCard label="Active Students Today" value={overview?.activeStudentsToday ?? 0} icon={Activity} tone="emerald" />
            <StatCard
              label="Practice Olympiads Completed" value={stats?.counts.practiceAttempts ?? 0} icon={Trophy} tone="brand"
              change={practiceActivityChange}
              trend={overview?.charts.practiceActivity.slice(-14).map(d => d.count)}
            />
            <StatCard label="Total Assessments" value={stats?.counts.assessments ?? 0} icon={ClipboardList} tone="amber" />
            <StatCard label="Total Questions" value={overview?.questionBank.total ?? 0} icon={HelpCircle} tone="brand" />
            <StatCard label="Total Subjects" value={overview?.contentCatalog.totalSubjects ?? 0} icon={BookOpen} tone="violet" />
            <StatCard label="Total Chapters Covered" value={overview?.questionBank.chaptersCovered ?? 0} icon={Layers} tone="emerald" />
            <StatCard label="Total Boards" value={overview?.contentCatalog.totalBoards ?? 0} icon={Landmark} tone="amber" />
            <StatCard label="Total Classes" value={overview?.contentCatalog.totalClasses ?? 0} icon={School} tone="brand" />
          </>
        )}
      </div>

      {/* ── Today's Activity ──────────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">Today's Activity</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-14" /></Card>)
        ) : (
          <>
            <Card className="p-4 text-center">
              <div className="font-display font-semibold text-[20px] text-fg1">{overview?.todaysActivity.studentsLoggedIn ?? 0}</div>
              <div className="text-[11px] text-fg3 mt-0.5">Students Logged In</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="font-display font-semibold text-[20px] text-fg1">{overview?.todaysActivity.practiceStarted ?? 0}</div>
              <div className="text-[11px] text-fg3 mt-0.5">Practice Started</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="font-display font-semibold text-[20px] text-fg1">{overview?.todaysActivity.practiceCompleted ?? 0}</div>
              <div className="text-[11px] text-fg3 mt-0.5">Practice Completed</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="font-display font-semibold text-[20px] text-fg1">{overview?.todaysActivity.assessmentsStarted ?? 0}</div>
              <div className="text-[11px] text-fg3 mt-0.5">Assessments Started</div>
            </Card>
            <Card className="p-4 text-center">
              <div className="font-display font-semibold text-[20px] text-fg1">{overview?.todaysActivity.assessmentsCompleted ?? 0}</div>
              <div className="text-[11px] text-fg3 mt-0.5">Assessments Completed</div>
            </Card>
          </>
        )}
      </div>

      {/* ── Recent Registrations + Recent Practice Activity ──────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Recent Student Registrations</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Latest students to join the platform</p>
            </div>
            <Button variant="ghost" size="sm" icon={Eye} onClick={() => navigate('/admin/students')}>View All Students</Button>
          </div>
          {studentsLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !recentStudents?.items.length ? (
            <EmptyState
              icon={Users}
              title="No students have registered yet."
              desc="Invite students to sign up to start seeing activity here."
              action={<Button icon={UserPlus} onClick={() => navigate('/admin/students')}>Add Student</Button>}
            />
          ) : (
            <div className="space-y-2.5">
              {recentStudents.items.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <Avatar name={s.name} hue={s.avatarHue} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-fg1 truncate">{s.name}</div>
                    <div className="text-[11px] text-fg3 truncate">
                      {s.className ?? 'No class'} · {s.educationBoard ?? 'No board'} · {fmtDateShort(s.joinedAt)}
                    </div>
                  </div>
                  <Badge tone={s.status === 'ACTIVE' ? 'success' : s.status === 'PENDING' ? 'warning' : 'neutral'}>
                    {s.status.toLowerCase()}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Recent Practice Activity</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Latest Practice Olympiad attempts</p>
            </div>
            <Button variant="ghost" size="sm" icon={Eye} onClick={() => navigate('/admin/reports')}>View All Activity</Button>
          </div>
          {activityLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !recentActivity?.items.length ? (
            <EmptyState
              icon={Trophy}
              title="No Practice Olympiads have been completed."
              desc="Attempts will show up here as soon as students start practising."
            />
          ) : (
            <div className="space-y-2.5">
              {recentActivity.items.map(a => (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
                    <Trophy size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-fg1 truncate">{a.student.name}</div>
                    <div className="text-[11px] text-fg3 truncate">
                      {a.quiz.subject?.name ?? 'Mixed Subjects'} · {fmtDateTime(a.endTime)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-semibold text-fg1">{Math.round(a.percentage)}%</div>
                    <div className="text-[10px] text-fg3">score {a.score}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── System Statistics ─────────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">System Statistics</h3>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-14" /></Card>)}
        </div>
      ) : !overview?.questionBank.total ? (
        <Card className="p-0 overflow-hidden mb-8">
          <EmptyState
            icon={HelpCircle}
            title="No questions have been added."
            desc="Upload questions to the Question Bank to power Practice Olympiad and Assessments."
            action={<Button icon={Upload} onClick={() => navigate('/admin/upload-questions')}>Add Questions</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{overview.questionBank.total}</div><div className="text-[11px] text-fg3 mt-0.5">Total Questions</div></Card>
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{overview.questionBank.active}</div><div className="text-[11px] text-fg3 mt-0.5">Active Questions</div></Card>
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{overview.questionBank.draft}</div><div className="text-[11px] text-fg3 mt-0.5">Draft Questions</div></Card>
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{overview.questionBank.subjectsCovered}</div><div className="text-[11px] text-fg3 mt-0.5">Subjects Covered</div></Card>
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{overview.questionBank.chaptersCovered}</div><div className="text-[11px] text-fg3 mt-0.5">Chapters Covered</div></Card>
          <Card className="p-4 text-center"><div className="font-display font-semibold text-[19px] text-fg1">{Object.keys(overview.questionBank.byType).length}</div><div className="text-[11px] text-fg3 mt-0.5">Question Types</div></Card>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">Analytics</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <Card className="p-6">
          <h4 className="font-display font-semibold text-[14px] text-fg1 mb-4">Student Growth (Last 30 Days)</h4>
          {loading ? <Skeleton className="h-36" /> : overview?.charts.studentGrowth.some(d => d.count > 0) ? (
            <TimeSeriesChart data={overview.charts.studentGrowth} colorVar="#8b5cf6" />
          ) : (
            <div className="text-center py-10 text-fg3 text-[13px]">No new registrations in the last 30 days</div>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="font-display font-semibold text-[14px] text-fg1 mb-4">Practice Activity by Day (Last 30 Days)</h4>
          {loading ? <Skeleton className="h-36" /> : overview?.charts.practiceActivity.some(d => d.count > 0) ? (
            <TimeSeriesChart data={overview.charts.practiceActivity} />
          ) : (
            <div className="text-center py-10 text-fg3 text-[13px]">No Practice Olympiad activity in the last 30 days</div>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="font-display font-semibold text-[14px] text-fg1 mb-4">Daily Active Students (Last 30 Days)</h4>
          {loading ? <Skeleton className="h-36" /> : overview?.charts.dailyActiveStudents.some(d => d.count > 0) ? (
            <TimeSeriesChart data={overview.charts.dailyActiveStudents} colorVar="#34d399" />
          ) : (
            <div className="text-center py-10 text-fg3 text-[13px]">No active students in the last 30 days</div>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="font-display font-semibold text-[14px] text-fg1 mb-4">Subject Popularity</h4>
          {loading ? <Skeleton className="h-36" /> : overview?.charts.subjectPopularity.length ? (
            <RankedBarList items={overview.charts.subjectPopularity.map(s => ({ label: s.subjectName, count: s.count }))} />
          ) : (
            <div className="text-center py-10 text-fg3 text-[13px]">No Practice Olympiad attempts yet</div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h4 className="font-display font-semibold text-[14px] text-fg1 mb-4">Accuracy Distribution</h4>
          {loading ? <Skeleton className="h-36" /> : overview?.charts.accuracyDistribution.length ? (
            <AccuracyDistributionBars bands={overview.charts.accuracyDistribution} />
          ) : (
            <div className="text-center py-10 text-fg3 text-[13px]">No completed Practice Olympiad attempts yet</div>
          )}
        </Card>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">Quick Actions</h3>
      <Card className="p-5 mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickActionButton icon={UserPlus} label="Add Student" onClick={() => navigate('/admin/students')} />
          <QuickActionButton icon={FilePlus} label="Create Assessment" onClick={() => navigate('/admin/create-assessment')} />
          <QuickActionButton icon={Upload} label="Add Questions" onClick={() => navigate('/admin/upload-questions')} />
          <QuickActionButton icon={HelpCircle} label="Question Bank" onClick={() => navigate('/admin/question-bank')} />
          <QuickActionButton icon={ClipboardList} label="Manage Assessments" onClick={() => navigate('/admin/assessments')} />
          <QuickActionButton icon={BarChart3} label="View Reports" onClick={() => navigate('/admin/reports')} />
        </div>
      </Card>

      {/* ── Performance Indicators ────────────────────────────────────── */}
      <h3 className="font-display font-semibold text-[15px] text-fg1 mb-3">Performance Indicators</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-16" /></Card>)
        ) : (
          <>
            <StatCard label="Avg. Student Accuracy" value={`${overview?.performanceIndicators.avgAccuracy ?? 0}%`} icon={Target} tone="emerald" />
            <StatCard label="Avg. Confidence Score" value={overview?.performanceIndicators.avgConfidenceScoreApprox ?? 0} icon={Gauge} tone="brand" />
            <StatCard label="Avg. Practice Time" value={fmtDuration(overview?.performanceIndicators.avgPracticeTimeSec ?? 0)} icon={Clock} tone="violet" />
            <StatCard label="Avg. Questions / Session" value={overview?.performanceIndicators.avgQuestionsPerSession ?? 0} icon={Hash} tone="amber" />
          </>
        )}
      </div>
    </>
  );
}
