import { useNavigate } from 'react-router-dom';
import { KeyRound, FileText, Trophy, Flame, Award, Play, Zap, BookOpen, ArrowRight } from 'lucide-react';
import { PageHeader, StatCard, Card, Button, Badge, Avatar, ProgressBar, Skeleton } from '../../shared/ui';
import { useAssessments } from '../../../hooks/useAssessments';
import { useMySubmissions } from '../../../hooks/useSubmissions';
import { useGlobalLeaderboard } from '../../../hooks/useLeaderboard';
import { useMyStats } from '../../../hooks/useLeaderboard';
import { usePracticeSubjects } from '../../../hooks/usePracticeQuiz';
import { loadUser } from '../../../lib/authStore';

export function StudentDashboardPage() {
  const navigate = useNavigate();
  const user = loadUser();

  const { data: assessments, loading: aLoading } = useAssessments({ status: 'PUBLISHED', limit: 3 });
  const { data: submissions, loading: sLoading }  = useMySubmissions({ limit: 5, status: 'GRADED' });
  const { data: leaderboard, loading: lLoading }  = useGlobalLeaderboard({ limit: 5 });
  const { data: statsData, loading: stLoading }   = useMyStats();
  const { data: subjects,   loading: pLoading }   = usePracticeSubjects();

  const stats = statsData as any;
  const loading = aLoading || stLoading;
  const hasAssessments = (assessments?.items?.length ?? 0) > 0;
  const practiceSubjects = (subjects ?? []).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Student · Dashboard"
        title={`Welcome back, ${user?.name ?? 'Student'} 👋`}
        subtitle="Pick up where you left off, or jump into a live assessment."
        actions={
          <>
            <Button variant="outline" icon={KeyRound} onClick={() => navigate('/student/join')}>Join with code</Button>
            <Button icon={Play} onClick={() => navigate('/student/assessments')}>Continue learning</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)
        ) : (
          <>
            <StatCard label="Assessments taken" value={stats?.attempted    ?? 0}                    icon={FileText} tone="brand"   />
            <StatCard label="Average score"      value={`${Math.round(stats?.avgPercent ?? 0)}%`}  icon={Award}    tone="emerald" />
            <StatCard label="Current rank"        value={stats?.rank ? `#${stats.rank}` : '—'}     icon={Trophy}   tone="amber"   />
            <StatCard label="Total score"         value={stats?.totalScore ?? 0}                   icon={Flame}    tone="violet"  />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Available assessments</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Published assessments you can take now</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/student/assessments')}>View all →</Button>
          </div>
          {aLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : hasAssessments ? (
            <div className="space-y-3">
              {(assessments?.items ?? []).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-4 rounded-xl border border-line hover:border-brand/30 hover:bg-brand-soft/30 transition group">
                  <div className="w-12 h-12 rounded-xl bg-brand-soft text-brand grid place-items-center"><FileText size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-fg1 truncate group-hover:text-brand transition">{a.title}</div>
                    <div className="text-[11.5px] text-fg3 flex items-center gap-2 mt-0.5">
                      {a.subject?.name} · {a.duration} min · {a.questionCount} questions
                    </div>
                  </div>
                  <Button size="sm" icon={Play} onClick={() => navigate('/student/assessments')}>Start</Button>
                </div>
              ))}
            </div>
          ) : (
            /* Empty-state: no teacher assessments → nudge to Practice */
            <div className="flex flex-col items-center text-center py-8 px-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand grid place-items-center mb-3">
                <FileText size={24} />
              </div>
              <p className="text-[14px] font-semibold text-fg1 mb-1">No assessments assigned yet</p>
              <p className="text-[12.5px] text-fg3 max-w-xs mb-4">
                Your teacher hasn't assigned any assessments. In the meantime, sharpen your skills with a practice quiz!
              </p>
              <Button icon={Zap} onClick={() => navigate('/student/practice')}>
                Start a Practice Quiz
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2"><Trophy size={16} className="text-amber-300" />Leaderboard</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/student/leaderboard')}>Full →</Button>
          </div>
          {lLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-3">
              {(leaderboard ?? []).map((s, i) => (
                <div key={s.studentId} className={`flex items-center gap-3 p-2 rounded-lg ${s.studentId === user?.id ? 'bg-brand-soft border border-brand/20' : ''}`}>
                  <span className={`w-7 h-7 grid place-items-center rounded-md text-[11px] font-display font-semibold ${i === 0 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : i === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' : i === 2 ? 'bg-orange-400/20 text-orange-300 border border-orange-400/30' : 'bg-surface1 text-fg3 border border-line'}`}>#{s.rank}</span>
                  <Avatar name={s.studentName} hue={s.avatarHue} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-fg1 truncate">{s.studentName}</div>
                  </div>
                  <span className="font-mono text-[12.5px] text-fg1">{Math.round(s.avgPercent)}%</span>
                </div>
              ))}
              {!lLoading && !(leaderboard ?? []).length && (
                <div className="text-center py-6 text-fg3 text-[13px]">No entries yet</div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 mt-5">
        <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Recent results</h3>
        {sLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-2">
            {(submissions?.items ?? []).map(s => (
              <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl border border-line hover:border-line2 transition">
                <div className={`w-11 h-11 rounded-xl grid place-items-center ${s.percent >= 75 ? 'bg-emerald-500/15 text-emerald-300' : s.percent >= 50 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  <Award size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-fg1 truncate">{s.assessment.title}</div>
                  <div className="text-[11.5px] text-fg3 mt-0.5">{s.assessment.subject?.name} · {new Date(s.startedAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right w-32">
                  <div className="font-mono text-[14px] font-semibold text-fg1">{s.score}/{s.totalMarks} · {s.percent}%</div>
                  <div className="mt-1.5"><ProgressBar value={s.percent} tone={s.percent >= 75 ? 'emerald' : s.percent >= 50 ? 'amber' : 'rose'} /></div>
                </div>
              </div>
            ))}
            {!sLoading && !submissions?.items?.length && (
              <div className="text-center py-8 text-fg3 text-[13px]">
                No results yet.{' '}
                <button onClick={() => navigate('/student/practice')} className="text-brand">
                  Try a practice quiz →
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Practice Quiz section ────────────────────────────── */}
      <Card className="p-6 mt-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-300 grid place-items-center">
              <Zap size={16} />
            </div>
            <div>
              <h3 className="font-display font-semibold text-[16px] text-fg1">Practice Quizzes</h3>
              <p className="text-[12px] text-fg3 mt-0.5">Play independently — no teacher needed</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={ArrowRight} onClick={() => navigate('/student/practice')}>
            Browse all
          </Button>
        </div>

        {pLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : practiceSubjects.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {practiceSubjects.map(s => (
              <button
                key={s.id}
                onClick={() => navigate('/student/practice')}
                className="p-4 rounded-xl border border-line bg-surface1/50 hover:border-brand/30 hover:bg-brand-soft/20 transition text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center mb-2.5 group-hover:scale-105 transition">
                  <BookOpen size={14} />
                </div>
                <div className="text-[13px] font-semibold text-fg1 truncate group-hover:text-brand transition">
                  {s.name}
                </div>
                <div className="text-[11px] text-fg3 mt-1">{s.questionCount} questions</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-fg3 text-[13px]">
            No practice questions available yet. Ask your teacher to add questions to the question bank.
          </div>
        )}
      </Card>
    </>
  );
}
