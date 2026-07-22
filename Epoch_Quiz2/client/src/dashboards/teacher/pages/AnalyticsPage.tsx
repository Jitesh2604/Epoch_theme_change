import { TrendingUp, FileText, BarChart3, Clock } from 'lucide-react';
import { PageHeader, Card, StatCard, Badge, ProgressBar, Skeleton } from '../../shared/ui';
import { useSubmissions } from '../../../hooks/useSubmissions';
import { useMyStats } from '../../../hooks/useLeaderboard';

export function AnalyticsPage() {
  const { data: submissions, loading: sLoading } = useSubmissions({ limit: 50 });
  const { data: statsData, loading: stLoading }  = useMyStats();
  const stats = statsData as any;
  const loading = sLoading || stLoading;

  const subjectMap: Record<string, { attempts: number; totalPct: number }> = {};
  for (const s of submissions?.items ?? []) {
    const subj = s.assessment.subject?.name ?? 'Other';
    if (!subjectMap[subj]) subjectMap[subj] = { attempts: 0, totalPct: 0 };
    subjectMap[subj].attempts++;
    subjectMap[subj].totalPct += s.percent ?? 0;
  }
  const subjects = Object.entries(subjectMap)
    .map(([name, v]) => ({ name, attempts: v.attempts, avg: Math.round(v.totalPct / v.attempts) }))
    .sort((a, b) => b.attempts - a.attempts);

  return (
    <>
      <PageHeader
        eyebrow="Teacher · Analytics"
        title="Analytics"
        subtitle="Performance insights across your assessments and students."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard label="Assessments created" value={stats?.assessmentsCreated  ?? 0}                   icon={FileText}   tone="brand"   />
            <StatCard label="Total submissions"    value={stats?.totalSubmissions    ?? 0}                   icon={BarChart3}    tone="violet"  />
            <StatCard label="Avg score"             value={`${Math.round(stats?.avgPercent ?? 0)}%`}        icon={TrendingUp} tone="emerald" />
            <StatCard label="Avg time (min)"        value={Math.round((stats?.avgTimeSec ?? 0) / 60)}       icon={Clock}    tone="amber"   />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="p-6">
          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Performance by subject</h3>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-8 text-fg3 text-[13px]">No data yet</div>
          ) : (
            <div className="space-y-4">
              {subjects.map(s => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-medium text-fg1">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-fg3">{s.attempts} submissions</span>
                      <span className="font-mono text-[13px] font-semibold text-fg1">{s.avg}%</span>
                    </div>
                  </div>
                  <ProgressBar value={s.avg} tone={s.avg >= 75 ? 'emerald' : s.avg >= 50 ? 'amber' : 'rose'} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Recent submissions</h3>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="space-y-2">
              {(submissions?.items ?? []).slice(0, 8).map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface1/50 transition">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-fg1 truncate">{s.student?.name ?? 'Student'}</div>
                    <div className="text-[11px] text-fg3 truncate">{s.assessment.title}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[13px] text-fg1">{s.percent ?? 0}%</div>
                    <Badge tone={(s.percent ?? 0) >= 50 ? 'success' : 'danger'} dot={false}>{s.status.toLowerCase()}</Badge>
                  </div>
                </div>
              ))}
              {!loading && !submissions?.items?.length && (
                <div className="text-center py-8 text-fg3 text-[13px]">No submissions yet</div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
