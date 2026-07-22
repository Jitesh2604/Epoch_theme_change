import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Trophy, Medal, FileText, TrendingUp, Zap, Clock, CheckCircle2, XCircle, MinusCircle, ChevronRight } from 'lucide-react';
import { PageHeader, Card, Button, StatCard, ProgressBar, Badge, Skeleton } from '../../shared/ui';
import { StandaloneHeader } from '../../shared/StandaloneHeader';
import { useMySubmissions } from '../../../hooks/useSubmissions';
import { useMyStats } from '../../../hooks/useLeaderboard';
import { useOlympiadAttempts, type OlympiadAttemptSummary } from '../../../hooks/usePracticeQuiz';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <StandaloneHeader subtitle="Results" />
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

type Tab = 'assessment' | 'practice' | 'olympiad';

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ── Practice / Attempt Olympiad history — shared by both tabs, since both
//    draw from the same attempts list, split by quizType. ─────────────────
function OlympiadAttemptsSection({
  attempts, loading, error, heading, emptyText,
}: {
  attempts: OlympiadAttemptSummary[];
  loading: boolean;
  error: string;
  heading: string;
  emptyText: string;
}) {
  const completed = attempts.filter(a => a.status === 'SUBMITTED');
  const bestScore = completed.reduce((best, a) => Math.max(best, a.score), 0);
  const averagePercent = completed.length
    ? Math.round(completed.reduce((sum, a) => sum + a.percentage, 0) / completed.length)
    : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard label="Quizzes played" value={attempts.length}      icon={Zap} tone="brand"   />
            <StatCard label="Completed"       value={completed.length}    icon={CheckCircle2} tone="emerald" />
            <StatCard label="Best score"      value={bestScore}           icon={Award}  tone="amber"   />
            <StatCard label="Avg %"           value={`${averagePercent}%`} icon={TrendingUp}  tone="violet"  />
          </>
        )}
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">{heading}</h3>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : error ? (
          <div className="text-center py-12 text-danger text-[13px]">{error}</div>
        ) : (
          <div className="space-y-3">
            {attempts.map(a => {
              const reviewable = a.status === 'SUBMITTED';
              return (
                <div
                  key={a.attemptId}
                  className="flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line2 transition"
                >
                  <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 bg-brand-soft text-brand">
                    <Trophy size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-fg1 truncate">
                      {a.quizTitle} · Attempt #{a.attemptNumber}
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
                  <div className="shrink-0 flex items-center gap-2">
                    <Badge tone={a.status === 'SUBMITTED' ? 'success' : 'warning'}>{a.status === 'SUBMITTED' ? 'completed' : 'in progress'}</Badge>
                    {reviewable && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={ChevronRight}
                        onClick={() => { window.location.href = `/#/play/result/${a.attemptId}`; }}
                      >
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {!attempts.length && (
              <div className="text-center py-12 text-fg3 text-[13px]">{emptyText}</div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

export function ResultsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('assessment');

  const { data: submissions, loading: sLoading } = useMySubmissions({ limit: 30 });
  const { data: statsData, loading: stLoading }  = useMyStats();
  const { data: attempts, loading: aLoading, error: aError } = useOlympiadAttempts();

  const stats = statsData as any;
  const loading = sLoading || stLoading;

  // Practice Olympiad Results vs Attempt Olympiad Results — same underlying
  // attempts list, split by quizType (see usePracticeQuiz.ts). The Olympiad
  // tab only appears when there's at least one real Olympiad-mode attempt.
  const olympiadAttempts = (attempts ?? []).filter(a => a.quizType === 'OLYMPIAD');
  const practiceAttempts = (attempts ?? []).filter(a => a.quizType !== 'OLYMPIAD');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'assessment', label: 'Assessment Results' },
    { key: 'practice',   label: 'Practice Olympiad Results' },
    ...(olympiadAttempts.length > 0 ? [{ key: 'olympiad' as Tab, label: 'Attempt Olympiad Results' }] : []),
  ];

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Results"
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
                {(submissions?.items ?? []).map(s => {
                  const visible = s.resultsVisible ?? (s.percent !== null);
                  const pct = s.percent ?? 0;
                  return (
                  <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line2 transition">
                    <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${!visible ? 'bg-surface1 text-fg3' : pct >= 75 ? 'bg-emerald-500/15 text-emerald-300' : pct >= 50 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
                      <Award size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-fg1 truncate">{s.assessment.title}</div>
                      <div className="text-[11.5px] text-fg3 mt-0.5">
                        {s.assessment.subject?.name ?? 'No subject'} · {new Date(s.startedAt).toLocaleDateString()}
                        {s.timeTakenSec ? ` · ${Math.round(s.timeTakenSec / 60)} min` : ''}
                      </div>
                    </div>
                    {visible ? (
                      <div className="text-right w-36 shrink-0">
                        <div className="font-mono text-[14px] font-semibold text-fg1">{s.score}/{s.totalMarks} · {pct}%</div>
                        <div className="mt-1.5"><ProgressBar value={pct} tone={pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'} /></div>
                      </div>
                    ) : (
                      <div className="text-right w-36 shrink-0 text-[12px] text-fg3">Result Pending</div>
                    )}
                    <div className="shrink-0 flex items-center gap-2">
                      <Badge tone={!visible ? 'neutral' : pct >= 50 ? 'success' : 'danger'}>{!visible ? 'pending' : s.status.toLowerCase()}</Badge>
                      {visible && (
                        <Button
                          size="sm"
                          variant="soft"
                          icon={ChevronRight}
                          onClick={() => navigate(`/assessment/result/${s.id}`)}
                        >
                          View Details
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {!sLoading && !submissions?.items?.length && (
                  <div className="text-center py-12 text-fg3 text-[13px]">No assessment results yet</div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'practice' && (
        <OlympiadAttemptsSection
          attempts={practiceAttempts}
          loading={aLoading}
          error={aError ?? ''}
          heading="Practice Olympiad history"
          emptyText="No practice olympiad results yet"
        />
      )}

      {tab === 'olympiad' && (
        <OlympiadAttemptsSection
          attempts={olympiadAttempts}
          loading={aLoading}
          error={aError ?? ''}
          heading="Attempt Olympiad history"
          emptyText="No attempt olympiad results yet"
        />
      )}
    </StandalonePage>
  );
}
