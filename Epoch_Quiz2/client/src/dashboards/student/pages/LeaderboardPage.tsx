import { Trophy, Crown, Medal } from 'lucide-react';
import { PageHeader, Card, Avatar, Badge, ProgressBar, Skeleton } from '../../shared/ui';
import { StandaloneHeader } from '../../shared/StandaloneHeader';
import { useGlobalLeaderboard } from '../../../hooks/useLeaderboard';
import { loadUser } from '../../../lib/authStore';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <StandaloneHeader subtitle="Leaderboard" />
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

export function LeaderboardPage() {
  const { data: entries, loading, error } = useGlobalLeaderboard({ limit: 20 });
  const user = loadUser();

  const topThree = entries?.slice(0, 3) ?? [];
  const rest = entries?.slice(3) ?? [];

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Leaderboard"
        title="Leaderboard"
        subtitle="Top performers across all assessments on the platform."
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Could not load the leaderboard — {error}
        </div>
      )}

      {loading ? (
        <Card className="p-6">
          <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        </Card>
      ) : (
        <>
          {topThree.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {topThree.map((e, i) => {
                const isMe = e.studentId === user?.id;
                const podiumColors = [
                  'from-amber-500/20 to-amber-500/5 border-amber-500/30',
                  'from-slate-400/20 to-slate-400/5 border-slate-400/30',
                  'from-orange-500/20 to-orange-500/5 border-orange-500/30',
                ];
                const icons = [Crown, Trophy, Medal];
                const Icon = icons[i];
                const iconColors = ['text-amber-300', 'text-slate-300', 'text-orange-300'];

                return (
                  <Card key={e.studentId} className={`p-6 text-center bg-gradient-to-b ${podiumColors[i]} ${isMe ? 'ring-2 ring-brand' : ''}`}>
                    <Icon size={24} className={`${iconColors[i]} mx-auto mb-3`} />
                    <Avatar name={e.studentName} hue={e.avatarHue} size={56} />
                    <div className="mt-3 font-display font-semibold text-[15px] text-fg1">{e.studentName}</div>
                    {isMe && <Badge tone="brand" className="mt-1">You</Badge>}
                    <div className="mt-3 font-mono font-semibold text-[20px] text-fg1">{Math.round(e.avgPercent)}%</div>
                    <div className="text-[11px] text-fg3">avg score</div>
                    {e.attempted !== undefined && (
                      <div className="text-[11px] text-fg3 mt-1">{e.attempted} attempts</div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="overflow-hidden">
            {rest.map(e => {
              const isMe = e.studentId === user?.id;
              return (
                <div key={e.studentId} className={`flex items-center gap-4 px-5 py-4 border-b border-line/60 last:border-0 hover:bg-surface1/50 transition ${isMe ? 'bg-brand-soft/30' : ''}`}>
                  <span className="w-8 text-center font-mono text-[13px] text-fg3">#{e.rank}</span>
                  <Avatar name={e.studentName} hue={e.avatarHue} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-fg1 truncate">{e.studentName}{isMe && <span className="ml-2 text-[11px] text-brand">(You)</span>}</div>
                    {e.attempted !== undefined && <div className="text-[11px] text-fg3">{e.attempted} attempts</div>}
                  </div>
                  <div className="min-w-[120px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[13px] text-fg1">{Math.round(e.avgPercent)}%</span>
                    </div>
                    <ProgressBar value={e.avgPercent} tone={e.avgPercent >= 75 ? 'emerald' : e.avgPercent >= 50 ? 'amber' : 'rose'} />
                  </div>
                </div>
              );
            })}
            {!loading && !entries?.length && (
              <div className="text-center py-12 text-fg3 text-[13px]">No entries yet</div>
            )}
          </Card>
        </>
      )}
    </StandalonePage>
  );
}
