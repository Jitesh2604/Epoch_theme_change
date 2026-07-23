import { GraduationCap, ClipboardList, TrendingUp, ArrowUpRight, Trophy } from 'lucide-react';
import { Card, PageHeader, StatCard, Badge, Avatar, Button, Skeleton } from '../../shared/ui';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../../../hooks/useDashboard';
import { useAuth } from '../../../lib/authStore';

export function DashboardOverviewPage() {
  const navigate = useNavigate();
  const { data: stats, loading, error } = useDashboardStats();
  const user = useAuth();

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user?.name ?? 'Admin'} 👋`}
        subtitle="Here's how your publication is performing today across all students."
        actions={
          <>
            <Button icon={ArrowUpRight} onClick={() => navigate('/admin/reports')}>Open analytics</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Could not load dashboard stats — {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>
          ))
        ) : (
          <>
            {/* Teacher module is temporarily hidden — restore the "Total
                Teachers" StatCard (and Users icon import) to bring it back. */}
            <StatCard label="Total Students"      value={stats?.counts.students   ?? 0} icon={GraduationCap} tone="violet"  />
            <StatCard label="Total Assessments"   value={stats?.counts.assessments ?? 0} icon={ClipboardList} tone="emerald" />
            <StatCard label="Practice/Olympiad Attempts" value={stats?.counts.practiceAttempts ?? 0} icon={Trophy} tone="brand" />
            <StatCard label="Completion Rate"     value={`${stats?.completionRate ?? 0}%`} icon={TrendingUp}  tone="amber"  />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Recent Assessments</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Latest activity across your publication</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/assessments')}>View all →</Button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(stats?.recentAssessments ?? []).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-line2 hover:bg-surface1/50 transition group">
                  <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                    <ClipboardList size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-fg1 truncate">{a.title}</div>
                    <div className="text-[11.5px] text-fg3 truncate">
                      {a.subject?.name ?? 'Mixed Subjects'} · {a.questionCount} questions
                    </div>
                  </div>
                  <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                    {a.status.toLowerCase()}
                  </Badge>
                  <div className="hidden md:block text-right">
                    <div className="text-[13px] font-semibold text-fg1">{a.attempts}</div>
                    <div className="text-[10px] text-fg3 uppercase tracking-wider">attempts</div>
                  </div>
                </div>
              ))}
              {!loading && !stats?.recentAssessments?.length && (
                <div className="text-center py-8 text-fg3 text-[13px]">No assessments yet</div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Recent Submissions</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Student attempts</p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-3">
              {(stats?.recentSubmissions ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Avatar name={s.student.name} hue={s.student.avatarHue} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-fg1 truncate">{s.student.name}</div>
                    <div className="text-[11px] text-fg3 truncate">{s.assessment.title}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-fg1">{s.percent}%</div>
                    <div className="text-[10px] text-fg3 uppercase tracking-wider">{s.score}/{s.totalMarks}</div>
                  </div>
                </div>
              ))}
              {!loading && !stats?.recentSubmissions?.length && (
                <div className="text-center py-8 text-fg3 text-[13px]">No submissions yet</div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
