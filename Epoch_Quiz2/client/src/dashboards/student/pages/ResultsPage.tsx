import { Award } from 'lucide-react';
import { PageHeader, Card, StatCard, ProgressBar, Badge, Skeleton } from '../../shared/ui';
import { useMySubmissions } from '../../../hooks/useSubmissions';
import { useMyStats } from '../../../hooks/useLeaderboard';

export function ResultsPage() {
  const { data: submissions, loading: sLoading } = useMySubmissions({ limit: 30 });
  const { data: statsData, loading: stLoading }  = useMyStats();

  const stats = statsData as any;
  const loading = sLoading || stLoading;

  return (
    <>
      <PageHeader
        eyebrow="Student · Results"
        title="My Results"
        subtitle="Your assessment history and performance."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard label="Assessments taken" value={stats?.attempted    ?? 0}                   icon={Award} tone="brand"   />
            <StatCard label="Average score"      value={`${Math.round(stats?.avgPercent ?? 0)}%`} icon={Award} tone="emerald" />
            <StatCard label="Total score"        value={stats?.totalScore ?? 0}                   icon={Award} tone="amber"   />
          </>
        )}
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Assessment history</h3>
        {sLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-3">
            {(submissions?.items ?? []).map(s => (
              <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line2 transition">
                <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${s.percent >= 75 ? 'bg-emerald-500/15 text-emerald-300' : s.percent >= 50 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  <Award size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-fg1 truncate">{s.assessment.title}</div>
                  <div className="text-[11.5px] text-fg3 mt-0.5">
                    {s.assessment.subject?.name ?? 'No subject'} · {new Date(s.startedAt).toLocaleDateString()}
                    {s.timeTakenSec ? ` · ${Math.round(s.timeTakenSec / 60)} min` : ''}
                  </div>
                </div>
                <div className="text-right w-36 shrink-0">
                  <div className="font-mono text-[14px] font-semibold text-fg1">{s.score}/{s.totalMarks} · {s.percent}%</div>
                  <div className="mt-1.5"><ProgressBar value={s.percent} tone={s.percent >= 75 ? 'emerald' : s.percent >= 50 ? 'amber' : 'rose'} /></div>
                </div>
                <div className="shrink-0">
                  <Badge tone={s.percent >= 50 ? 'success' : 'danger'}>{s.status.toLowerCase()}</Badge>
                </div>
              </div>
            ))}
            {!sLoading && !submissions?.items?.length && (
              <div className="text-center py-12 text-fg3 text-[13px]">No results yet</div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
