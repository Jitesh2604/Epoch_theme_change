import { useState } from 'react';
import { Award, Trophy, Medal, FileText, TrendingUp, Zap, Clock, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { PageHeader, Card, StatCard, ProgressBar, Badge, Skeleton } from '../../shared/ui';
import { useMySubmissions } from '../../../hooks/useSubmissions';
import { useMyStats } from '../../../hooks/useLeaderboard';
import { useOlympiadAttempts } from '../../../hooks/usePracticeQuiz';

type Tab = 'practice' | 'assessment';

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function ResultsPage() {
  const [tab, setTab] = useState<Tab>('assessment');

  const { data: submissions, loading: sLoading } = useMySubmissions({ limit: 30 });
  const { data: statsData, loading: stLoading }  = useMyStats();
  const { data: attempts, loading: aLoading, error: aError } = useOlympiadAttempts();

  const stats = statsData as any;
  const loading = sLoading || stLoading;

  const completedAttempts = attempts?.filter(a => a.status === 'SUBMITTED') ?? [];
  const bestScore = completedAttempts.reduce((best, a) => Math.max(best, a.score), 0);
  const averagePercent = completedAttempts.length
    ? Math.round(completedAttempts.reduce((sum, a) => sum + a.percentage, 0) / completedAttempts.length)
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'assessment', label: 'Assessment Results' },
    { key: 'practice',   label: 'Practice Olympiad Results' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Student · Results"
        title="My Results"
        subtitle="Your assessment and practice olympiad history."
      />

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

      {tab === 'assessment' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
            ) : (
              <>
                <StatCard label="Assessments taken" value={stats?.attempted    ?? 0}                   icon={FileText} tone="brand"   />
                <StatCard label="Average score"      value={`${Math.round(stats?.avgPercent ?? 0)}%`} icon={Award} tone="emerald" />
                <StatCard label="Total score"        value={stats?.totalScore ?? 0}                   icon={Medal} tone="amber"   />
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
                  <div className="text-center py-12 text-fg3 text-[13px]">No assessment results yet</div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'practice' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            {aLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
            ) : (
              <>
                <StatCard label="Quizzes played" value={attempts?.length ?? 0}      icon={Zap} tone="brand"   />
                <StatCard label="Completed"       value={completedAttempts.length}  icon={CheckCircle2} tone="emerald" />
                <StatCard label="Best score"      value={bestScore}                 icon={Award}  tone="amber"   />
                <StatCard label="Avg %"           value={`${averagePercent}%`}      icon={TrendingUp}  tone="violet"  />
              </>
            )}
          </div>

          <Card className="p-6">
            <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Practice Olympiad history</h3>
            {aLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : aError ? (
              <div className="text-center py-12 text-danger text-[13px]">{aError}</div>
            ) : (
              <div className="space-y-3">
                {(attempts ?? []).map(a => (
                  <div key={a.attemptId} className="flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line2 transition">
                    <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-brand-soft text-brand">
                      <Trophy size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-fg1 truncate">
                        Attempt #{a.attemptNumber} · {a.quizTitle}
                      </div>
                      <div className="text-[11.5px] text-fg3 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{new Date(a.startTime).toLocaleDateString()}</span>
                        <span>{a.questionCount} questions</span>
                        <span className="flex items-center gap-1"><Clock size={11} />{fmtDuration(a.timeTakenSec)}</span>
                        <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-400" />{a.correctAnswers}</span>
                        <span className="flex items-center gap-1"><XCircle size={11} className="text-rose-400" />{a.wrongAnswers}</span>
                        <span className="flex items-center gap-1"><MinusCircle size={11} />{a.skipped}</span>
                      </div>
                    </div>
                    <div className="text-right w-28 shrink-0">
                      <div className="font-mono text-[14px] font-semibold text-fg1">{a.score} · {Math.round(a.percentage)}%</div>
                      <div className="mt-1.5"><ProgressBar value={a.percentage} tone={a.percentage >= 75 ? 'emerald' : a.percentage >= 50 ? 'amber' : 'rose'} /></div>
                    </div>
                    <div className="shrink-0">
                      <Badge tone={a.status === 'SUBMITTED' ? 'success' : 'warning'}>{a.status === 'SUBMITTED' ? 'completed' : 'in progress'}</Badge>
                    </div>
                  </div>
                ))}
                {!(attempts ?? []).length && (
                  <div className="text-center py-12 text-fg3 text-[13px]">No practice olympiad results yet</div>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
