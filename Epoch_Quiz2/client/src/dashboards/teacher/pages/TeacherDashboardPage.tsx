import { useNavigate } from 'react-router-dom';
import { FilePlus2, FileText, Users, Award, ArrowUpRight, Clock, ClipboardList } from 'lucide-react';
import { PageHeader, StatCard, Card, Button, Badge, Skeleton } from '../../shared/ui';
import { useAssessments } from '../../../hooks/useAssessments';
import { useMyStats } from '../../../hooks/useLeaderboard';
import { useSubmissions } from '../../../hooks/useSubmissions';
import { loadUser } from '../../../lib/authStore';

export function TeacherDashboardPage() {
  const navigate = useNavigate();
  const user = loadUser();

  const { data: assessments, loading: aLoading } = useAssessments({ limit: 5 });
  const { data: statsData, loading: sLoading } = useMyStats();
  const { data: submissions, loading: subLoading } = useSubmissions({ limit: 6 });

  const stats = statsData as any;
  const loading = aLoading || sLoading;

  return (
    <>
      <PageHeader
        eyebrow="Teacher · Dashboard"
        title={`Welcome back, ${user?.name ?? 'Teacher'} 👋`}
        subtitle="Here's your teaching activity and recent student performance."
        actions={
          <>
            <Button variant="outline" icon={ClipboardList} onClick={() => navigate('/teacher/assessments')}>
              My assessments
            </Button>
            <Button icon={FilePlus2} onClick={() => navigate('/teacher/create-assessment')}>
              Create assessment
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard label="Assessments created" value={stats?.assessmentsCreated ?? 0} icon={FileText} tone="brand"   />
            <StatCard label="Total submissions"    value={stats?.totalSubmissions    ?? 0} icon={Users}    tone="violet"  />
            <StatCard label="Avg score"             value={`${Math.round(stats?.avgPercent ?? 0)}%`} icon={Award} tone="emerald" />
            <StatCard label="Avg time (min)"        value={Math.round((stats?.avgTimeSec ?? 0) / 60)} icon={Clock} tone="amber" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-semibold text-[16px] text-fg1">My Assessments</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/teacher/assessments')}>View all →</Button>
          </div>
          {aLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : (
            <div className="space-y-2.5">
              {(assessments?.items ?? []).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-brand/30 hover:bg-brand-soft/30 transition">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                    <ClipboardList size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-fg1 truncate">{a.title}</div>
                    <div className="text-[11px] text-fg3">{a.questionCount} questions · {a.duration} min</div>
                  </div>
                  <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                    {a.status.toLowerCase()}
                  </Badge>
                </div>
              ))}
              {!aLoading && !assessments?.items?.length && (
                <div className="text-center py-8 text-fg3 text-[13px]">No assessments yet. <button onClick={() => navigate('/teacher/assessments/create')} className="text-brand">Create one →</button></div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-semibold text-[16px] text-fg1">Recent Submissions</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/teacher/results')}>View all →</Button>
          </div>
          {subLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="space-y-2">
              {(submissions?.items ?? []).map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface1/50 transition">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-fg1 truncate">{s.student?.name ?? 'Student'}</div>
                    <div className="text-[11px] text-fg3 truncate">{s.assessment.title}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[13px] text-fg1">{s.percent}%</div>
                    <Badge tone={s.percent >= 50 ? 'success' : 'danger'} dot={false}>{s.score}/{s.totalMarks}</Badge>
                  </div>
                </div>
              ))}
              {!subLoading && !submissions?.items?.length && (
                <div className="text-center py-8 text-fg3 text-[13px]">No submissions yet</div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
