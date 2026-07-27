import { useMemo, useState, type ReactNode } from 'react';
import {
  Zap, Hash, CheckCircle2, XCircle, MinusCircle, Target, Award, Trophy,
  TrendingDown, TrendingUp, Clock, Timer, CalendarPlus, CalendarCheck,
  Layers, Shuffle, BarChart3, PlayCircle, BookOpen, AlertTriangle, Flame,
  Inbox, ShieldAlert, Sparkles, Gauge, Rabbit, Turtle, TimerReset, Hourglass,
  ListChecks, Activity, History, Lightbulb, Waves, Brain, Compass, ListTodo,
  ThumbsUp, AlertOctagon, Rocket, CheckSquare, Square, CalendarDays, Medal, Lock,
  GraduationCap, FileBadge, Minus, Stamp,
} from 'lucide-react';
import { PageHeader, Card, Button, StatCard, Skeleton, EmptyState, Select } from '../../shared/ui';
import { StandaloneHeader } from '../../shared/StandaloneHeader';
import {
  usePracticeOverview, useSubjectBreakdown, useQuestionTypeBreakdown, useTopicBreakdown,
  type SubjectStat, type PracticeOverview, type QuestionTypeStat, type TopicStat,
} from '../../../hooks/useStudentAnalytics';
import { sortSubjects, SUBJECT_SORT_OPTIONS, type SubjectSortKey } from '../../../lib/subjectSort';
import { getPerformanceBand } from '../../../lib/performanceBand';
import { deriveInsights } from '../../../lib/strengthWeaknessInsights';
import { getSpeedBand } from '../../../lib/speedBand';
import { deriveSpeedInsights } from '../../../lib/speedInsights';
import { fmtDuration, fmtDurationHMS, fmtSeconds, fmtDate } from '../../../lib/formatters';
import { getQuestionTypeLabel } from '../../../lib/questionTypeLabel';
import { sortQuestionTypes, QUESTION_TYPE_SORT_OPTIONS, type QuestionTypeSortKey } from '../../../lib/questionTypeSort';
import { deriveQuestionTypeInsights } from '../../../lib/questionTypeInsights';
import { deriveAccuracyInsights } from '../../../lib/accuracyInsights';
import { deriveTopicInsights } from '../../../lib/topicInsights';
import {
  buildLearningInsights,
  type Recommendation, type StudyPriority, type RiskAlert, type WeeklyGoal,
  type LearningInsights,
} from '../../../lib/learningInsightsEngine';
import {
  buildStudyPlan,
  type StudyTask, type WeeklyPlanDay, type Badge as StudyBadge,
} from '../../../lib/studyPlanEngine';
import { useStudyPlanProgress } from '../../../hooks/useStudyPlanProgress';
import {
  buildReportCard,
  type SubjectReportCardEntry, type SubjectHighlight, type PeriodSummary, type PerformanceTrend,
} from '../../../lib/reportCardEngine';
import type { ConfidenceBreakdownEntry } from '../../../lib/confidenceScore';
import { useAuth } from '../../../lib/authStore';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <StandaloneHeader subtitle="Analytics" />
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

// ── Subject-wise Performance card (Feature 2) ────────────────────────────
// Denser than Feature 1's big StatCard tiles — 11 numbers per subject would
// be unreadable at that size across several subjects, so this lays them out
// as a compact label/value grid inside one Card per subject instead. Same
// Card component, same typography scale, same icon-forward language as
// Feature 1 for visual consistency.

function SubjectMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[15px] font-display font-semibold text-fg1 tabular-nums">{value}</div>
      <div className="text-[11px] text-fg3">{label}</div>
    </div>
  );
}

function SubjectPerformanceCard({ subject }: { subject: SubjectStat }) {
  const band = getPerformanceBand(subject.accuracyPercent);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
            <BookOpen size={17} />
          </div>
          <h3 className="font-display font-semibold text-[16px] text-fg1 truncate">{subject.subjectName}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${band.pillClass}`}>
          <span>{band.emoji}</span>{band.label}
        </span>
      </div>

      {/* Accuracy meter */}
      <div className="flex items-center gap-2 mt-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className={`h-full rounded-full ${band.barColorClass}`} style={{ width: `${Math.min(100, Math.max(0, subject.accuracyPercent))}%` }} />
        </div>
        <span className="text-[12.5px] font-semibold text-fg1 tabular-nums w-11 text-right">{subject.accuracyPercent}%</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3 border-t border-line">
        <SubjectMetric label="Practice Attempts"    value={subject.totalAttempts} />
        <SubjectMetric label="Questions Attempted"  value={subject.totalQuestionsAttempted} />
        <SubjectMetric label="Correct Answers"      value={subject.totalCorrect} />
        <SubjectMetric label="Wrong Answers"        value={subject.totalWrong} />
        <SubjectMetric label="Skipped Questions"    value={subject.totalSkipped} />
        <SubjectMetric label="Average Score"        value={subject.averageScore} />
        <SubjectMetric label="Best Score"           value={subject.bestScore} />
        <SubjectMetric label="Average Percentage"   value={`${subject.averagePercentage}%`} />
        <SubjectMetric label="Avg Time / Question"  value={fmtSeconds(subject.averageTimePerQuestionSec)} />
        <SubjectMetric label="Last Practice"        value={fmtDate(subject.lastPracticeDate)} />
      </div>
    </Card>
  );
}

interface SubjectsSectionProps {
  subjects: SubjectStat[] | null;
  loading: boolean;
  error: string | null;
}

function SubjectWisePerformance({ subjects, loading, error }: SubjectsSectionProps) {
  const [sortKey, setSortKey] = useState<SubjectSortKey>('highestAccuracy');

  // Sorting is a pure client-side re-sort of already-fetched data — no
  // re-fetch, no page reload, just a re-render.
  const sorted = useMemo(() => sortSubjects(subjects ?? [], sortKey), [subjects, sortKey]);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1">Subject-wise Performance</h3>
        {!loading && !error && !!subjects?.length && (
          <Select
            value={sortKey}
            onChange={v => setSortKey(v as SubjectSortKey)}
            options={SUBJECT_SORT_OPTIONS}
          />
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-56" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load subject-wise analytics" desc={error} />
        </Card>
      ) : !sorted.length ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Layers}
            title="No subject-wise data yet"
            desc="Start practicing to unlock your subject-wise analytics."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(s => <SubjectPerformanceCard key={s.subjectId} subject={s} />)}
        </div>
      )}
    </>
  );
}

// ── Strength & Weakness Analysis (Feature 3) ─────────────────────────────
// Pure derivation over the same SubjectStat[] Feature 2 fetched — no hook
// call here, no second request. See strengthWeaknessInsights.ts.

function InsightCard({
  icon: Icon, tone, title, children,
}: { icon: any; tone: 'emerald' | 'amber' | 'rose' | 'brand'; title: string; children: React.ReactNode }) {
  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    rose:    'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
    brand:   'bg-brand-soft text-brand',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${toneClasses[tone]}`}>
          <Icon size={17} />
        </div>
        <h4 className="font-display font-semibold text-[14.5px] text-fg1">{title}</h4>
      </div>
      {children}
    </Card>
  );
}

function StrengthWeaknessAnalysis({ subjects, loading, error }: SubjectsSectionProps) {
  const insights = useMemo(() => deriveInsights(subjects ?? []), [subjects]);

  return (
    <>
      <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Strength &amp; Weakness Analysis</h3>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-32" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load insights" desc={error} />
        </Card>
      ) : !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Sparkles}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock personalized insights."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <InsightCard icon={Trophy} tone="emerald" title="Strongest Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.strongest.subjectName}</p>
              <p className="text-[12.5px] text-fg3 mb-2">
                {insights.strongest.accuracyPercent}% accuracy · avg score {insights.strongest.averageScore}
              </p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold mb-2 ${getPerformanceBand(insights.strongest.accuracyPercent).pillClass}`}>
                <span>{getPerformanceBand(insights.strongest.accuracyPercent).emoji}</span>
                {getPerformanceBand(insights.strongest.accuracyPercent).label}
              </span>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                You're performing exceptionally well in {insights.strongest.subjectName}. Keep up the great work!
              </p>
            </InsightCard>

            <InsightCard icon={AlertTriangle} tone="amber" title="Weakest Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.weakest.subjectName}</p>
              <p className="text-[12.5px] text-fg3 mb-2">
                {insights.weakest.accuracyPercent}% accuracy · avg score {insights.weakest.averageScore}
              </p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold mb-2 ${getPerformanceBand(insights.weakest.accuracyPercent).pillClass}`}>
                <span>{getPerformanceBand(insights.weakest.accuracyPercent).emoji}</span>
                {getPerformanceBand(insights.weakest.accuracyPercent).label}
              </span>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                {insights.weakest.subjectName} needs more practice. Focus on improving accuracy in this subject.
              </p>
            </InsightCard>

            <InsightCard icon={Flame} tone="brand" title="Most Practiced Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.mostPracticed.subjectName}</p>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                {insights.mostPracticed.totalAttempts} attempts · {insights.mostPracticed.totalQuestionsAttempted} questions solved
              </p>
            </InsightCard>

            <InsightCard icon={Inbox} tone="brand" title="Least Practiced Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.leastPracticed.subjectName}</p>
              <p className="text-[12.5px] text-fg3 mb-2">{insights.leastPracticed.totalAttempts} attempts</p>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                Practice this subject more to build balanced preparation.
              </p>
            </InsightCard>

            <InsightCard icon={TrendingUp} tone="emerald" title="Biggest Improvement">
              {insights.biggestImprovement ? (
                <>
                  <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.biggestImprovement.subject.subjectName}</p>
                  <p className="text-[12.5px] text-fg3 mb-1">
                    {insights.biggestImprovement.subject.firstAttemptAccuracy}% → {insights.biggestImprovement.subject.latestAttemptAccuracy}%
                  </p>
                  <p className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                    +{insights.biggestImprovement.improvementPercent}% improvement
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-fg2 leading-relaxed">
                  {insights.improvementUnavailableReason === 'no-improvement'
                    ? 'No significant improvement detected yet — keep practicing!'
                    : 'More attempts are needed to measure improvement.'}
                </p>
              )}
            </InsightCard>

            <InsightCard icon={ShieldAlert} tone="rose" title="Needs Immediate Attention">
              {insights.needsAttention ? (
                <>
                  <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.needsAttention.subjectName}</p>
                  <p className="text-[12.5px] text-fg3 mb-2">
                    {insights.needsAttention.accuracyPercent}% accuracy · {insights.needsAttention.totalAttempts} attempts
                  </p>
                  <p className="text-[12.5px] text-fg2 leading-relaxed">
                    You've practiced this subject several times, but your accuracy is still low. Spend extra time reviewing the fundamentals.
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-fg2 leading-relaxed">
                  Nothing needs urgent attention right now — nice, balanced progress!
                </p>
              )}
            </InsightCard>
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Sparkles size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">Performance Summary</h4>
            </div>
            <ul className="space-y-1.5">
              {insights.summaryLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

// ── Speed & Time Analytics (Feature 4) ───────────────────────────────────
// Pure derivation over PracticeOverviewData (Feature 1) + SubjectStat[]
// (Feature 2) — no hook call here, no third request. See speedInsights.ts.

interface SpeedTimeAnalyticsProps {
  overview: PracticeOverview | null;
  subjects: SubjectStat[] | null;
  loading: boolean;
  error: string | null;
}

function SubjectTimeBar({ subject, maxSec }: { subject: SubjectStat; maxSec: number }) {
  const band = getSpeedBand(subject.averageTimePerQuestionSec);
  const widthPct = maxSec > 0 ? Math.max(4, Math.min(100, (subject.averageTimePerQuestionSec / maxSec) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-[13px] font-semibold text-fg1 w-28 shrink-0 truncate">{subject.subjectName}</span>
      <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
        <div className={`h-full rounded-full ${band.barColorClass}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="text-[12.5px] font-semibold text-fg1 tabular-nums w-16 text-right shrink-0">
        {fmtSeconds(subject.averageTimePerQuestionSec)}
      </span>
    </div>
  );
}

const EFFICIENCY_PILL_CLASS: Record<string, string> = {
  excellent:          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25',
  'careful-learner':  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25',
  'needs-review':     'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25',
  'needs-improvement':'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25',
};

function SpeedTimeAnalytics({ overview, subjects, loading, error }: SpeedTimeAnalyticsProps) {
  const insights = useMemo(() => (
    overview?.hasData && subjects ? deriveSpeedInsights(overview, subjects) : null
  ), [overview, subjects]);

  return (
    <>
      <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Speed &amp; Time Analytics</h3>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-24" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load speed analytics" desc={error} />
        </Card>
      ) : !overview?.hasData || !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Gauge}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock your Speed & Time Analytics."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatCard
              label="Average Time per Question"
              value={`${fmtSeconds(insights.overallAverageTimePerQuestionSec)}/question`}
              icon={Timer} tone="violet"
            />
            <StatCard label="Total Practice Time" value={fmtDurationHMS(insights.totalPracticeTimeSec)} icon={Clock} tone="violet" />
            <StatCard label="Average Quiz Duration" value={fmtDurationHMS(insights.averageQuizDurationSec)} icon={TimerReset} tone="brand" />

            <InsightCard icon={Rabbit} tone="emerald" title="Fastest Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.fastestSubject.subjectName}</p>
              <p className="text-[12.5px] text-fg3">{fmtSeconds(insights.fastestSubject.averageTimePerQuestionSec)}/question</p>
            </InsightCard>

            <InsightCard icon={Turtle} tone="amber" title="Slowest Subject">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{insights.slowestSubject.subjectName}</p>
              <p className="text-[12.5px] text-fg3">{fmtSeconds(insights.slowestSubject.averageTimePerQuestionSec)}/question</p>
            </InsightCard>

            {overview.longestSession && (
              <InsightCard icon={Hourglass} tone="brand" title="Longest Practice Session">
                <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{overview.longestSession.subjectLabel}</p>
                <p className="text-[12.5px] text-fg3">{fmtDate(overview.longestSession.date)} · {fmtDurationHMS(overview.longestSession.durationSec)}</p>
              </InsightCard>
            )}
          </div>

          {overview.shortestSession && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <InsightCard icon={Zap} tone="brand" title="Shortest Practice Session">
                <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{overview.shortestSession.subjectLabel}</p>
                <p className="text-[12.5px] text-fg3">{fmtDate(overview.shortestSession.date)} · {fmtDurationHMS(overview.shortestSession.durationSec)}</p>
              </InsightCard>
            </div>
          )}

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Subject Time Comparison</h4>
          <Card className="p-5 mb-4">
            {insights.subjectComparison.map(s => (
              <SubjectTimeBar key={s.subjectId} subject={s} maxSec={insights.slowestSubject.averageTimePerQuestionSec} />
            ))}
          </Card>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Speed Efficiency</h4>
          <Card className="p-5 mb-4">
            <div className="space-y-3">
              {insights.efficiencyBySubject.map(({ subject, efficiency }) => (
                <div key={subject.subjectId} className="flex items-center justify-between gap-3 flex-wrap py-1">
                  <span className="text-[13.5px] font-semibold text-fg1">{subject.subjectName}</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${EFFICIENCY_PILL_CLASS[efficiency.quadrant]}`}>
                      {efficiency.label}
                    </span>
                    <span className="text-[12px] text-fg3">{efficiency.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Gauge size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">Speed Insights</h4>
            </div>
            <ul className="space-y-1.5">
              {insights.speedInsightLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

// ── Question Type Analytics (Feature 5) ──────────────────────────────────
// Genuinely different dataset from Features 2/3's subjects (grouped by
// Question.type, not subjectExternalId), so this fetches independently —
// same "each section is its own fetch" architecture as every prior feature.

function QuestionTypeCard({ type }: { type: QuestionTypeStat }) {
  const band = getPerformanceBand(type.accuracyPercent);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-display font-semibold text-[16px] text-fg1 truncate">{getQuestionTypeLabel(type.questionType)}</h3>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${band.pillClass}`}>
          <span>{band.emoji}</span>{band.label}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className={`h-full rounded-full ${band.barColorClass}`} style={{ width: `${Math.min(100, Math.max(0, type.accuracyPercent))}%` }} />
        </div>
        <span className="text-[12.5px] font-semibold text-fg1 tabular-nums w-11 text-right">{type.accuracyPercent}%</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3 border-t border-line">
        <SubjectMetric label="Questions Attempted" value={type.totalQuestionsAttempted} />
        <SubjectMetric label="Correct Answers"     value={type.totalCorrect} />
        <SubjectMetric label="Wrong Answers"       value={type.totalWrong} />
        <SubjectMetric label="Skipped Questions"   value={type.totalSkipped} />
        <SubjectMetric label="Average Score"       value={type.averageScore} />
        <SubjectMetric label="Best Accuracy"       value={`${type.bestAccuracy}%`} />
        <SubjectMetric label="Avg Time / Question" value={fmtSeconds(type.averageTimePerQuestionSec)} />
        <SubjectMetric label="Last Attempt"        value={fmtDate(type.lastAttemptDate)} />
      </div>
    </Card>
  );
}

interface QuestionTypeAnalyticsProps {
  types: QuestionTypeStat[] | null;
  loading: boolean;
  error: string | null;
}

function QuestionTypeAnalytics({ types, loading, error }: QuestionTypeAnalyticsProps) {
  const [sortKey, setSortKey] = useState<QuestionTypeSortKey>('highestAccuracy');
  const sorted = useMemo(() => sortQuestionTypes(types ?? [], sortKey), [types, sortKey]);
  const insights = useMemo(() => deriveQuestionTypeInsights(types ?? []), [types]);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1">Question Type Analytics</h3>
        {!loading && !error && !!types?.length && (
          <Select
            value={sortKey}
            onChange={v => setSortKey(v as QuestionTypeSortKey)}
            options={QUESTION_TYPE_SORT_OPTIONS}
          />
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-56" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load question type analytics" desc={error} />
        </Card>
      ) : !sorted.length || !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={ListChecks}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock Question Type Analytics."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {sorted.map(t => <QuestionTypeCard key={t.questionType} type={t} />)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <InsightCard icon={Trophy} tone="emerald" title="Best Question Type">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{getQuestionTypeLabel(insights.bestType.questionType)}</p>
              <p className="text-[12.5px] text-fg3 mb-2">
                {insights.bestType.accuracyPercent}% accuracy · {fmtSeconds(insights.bestType.averageTimePerQuestionSec)}/question
              </p>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                You perform exceptionally well on {getQuestionTypeLabel(insights.bestType.questionType)} questions.
              </p>
            </InsightCard>

            <InsightCard icon={AlertTriangle} tone="rose" title="Needs More Practice">
              <p className="font-display font-semibold text-[17px] text-fg1 mb-1">{getQuestionTypeLabel(insights.weakestType.questionType)}</p>
              <p className="text-[12.5px] text-fg3 mb-2">
                {insights.weakestType.accuracyPercent}% accuracy · {fmtSeconds(insights.weakestType.averageTimePerQuestionSec)}/question
              </p>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                Spend more time practicing {getQuestionTypeLabel(insights.weakestType.questionType)} questions.
              </p>
            </InsightCard>
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Speed vs Accuracy</h4>
          <Card className="p-5 mb-4">
            <div className="space-y-3">
              {insights.speedAccuracyByType.map(({ type, quadrant, label }) => (
                <div key={type.questionType} className="flex items-center justify-between gap-3 flex-wrap py-1">
                  <span className="text-[13.5px] font-semibold text-fg1">{getQuestionTypeLabel(type.questionType)}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${EFFICIENCY_PILL_CLASS[quadrant]}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Sparkles size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">Dynamic Insights</h4>
            </div>
            <ul className="space-y-1.5">
              {insights.insightLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

// ── Accuracy Analytics (Feature 6) ───────────────────────────────────────
// Reuses the exact same PracticeOverviewData Features 1 and 4 already
// fetch — no hook call in this component at all, the purest reuse of any
// feature this session.

interface AccuracyAnalyticsProps {
  overview: PracticeOverview | null;
  loading: boolean;
  error: string | null;
}

function AccuracyBar({ label, count, percentage, colorClass }: { label: string; count: number; percentage: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-[13px] font-semibold text-fg1 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(2, percentage)}%` }} />
      </div>
      <span className="text-[12.5px] font-semibold text-fg1 tabular-nums w-24 text-right shrink-0">{count} · {percentage}%</span>
    </div>
  );
}

function AccuracyAnalytics({ overview, loading, error }: AccuracyAnalyticsProps) {
  const insights = useMemo(() => (
    overview?.hasData ? deriveAccuracyInsights(overview) : null
  ), [overview]);

  return (
    <>
      <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Accuracy Analytics</h3>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-24" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load accuracy analytics" desc={error} />
        </Card>
      ) : !overview?.hasData || !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Activity}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock Accuracy Analytics."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard label="Overall Accuracy" value={`${overview.accuracyPercent}%`} icon={Target} tone="emerald" />
            <StatCard label={`Correct · ${insights.ratios.correctPercent}%`} value={overview.totalCorrect} icon={CheckCircle2} tone="emerald" />
            <StatCard label={`Wrong · ${insights.ratios.wrongPercent}%`}   value={overview.totalWrong}   icon={XCircle}      tone="amber"   />
            <StatCard label={`Skipped · ${insights.ratios.skippedPercent}%`} value={overview.totalSkipped} icon={MinusCircle} tone="violet"  />
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Accuracy Trend</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-2">
              <StatCard label="First Attempt"  value={`${overview.accuracyTrend.firstAttemptAccuracy}%`}  icon={History}      tone="brand"   />
              <StatCard label="Latest Attempt" value={`${overview.accuracyTrend.latestAttemptAccuracy}%`} icon={TrendingUp}   tone="brand"   />
              <StatCard label="Best Accuracy"  value={`${overview.accuracyTrend.bestAccuracyAchieved}%`}  icon={Trophy}       tone="emerald" />
              <StatCard label="Lowest Accuracy" value={`${overview.accuracyTrend.lowestAccuracyAchieved}%`} icon={TrendingDown} tone="amber"  />
            </div>
            <InsightCard
              icon={insights.trendDirection === 'declined' ? TrendingDown : TrendingUp}
              tone={insights.trendDirection === 'improved' ? 'emerald' : insights.trendDirection === 'declined' ? 'rose' : 'brand'}
              title="Overall Trend"
            >
              {insights.trendDirection === 'consistent' ? (
                <p className="text-[13.5px] text-fg2 leading-relaxed">Your accuracy has remained consistent.</p>
              ) : (
                <p className="font-display font-semibold text-[20px] text-fg1">
                  {insights.trendDeltaPercent > 0 ? '+' : ''}{insights.trendDeltaPercent}%
                </p>
              )}
              <p className="text-[12px] text-fg3 mt-1">Average across all attempts: {overview.accuracyTrend.averageAccuracyAcrossAttempts}%</p>
            </InsightCard>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <InsightCard icon={Waves} tone="brand" title="Accuracy Consistency">
              {insights.consistency ? (
                <>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold mb-2 ${insights.consistency.pillClass}`}>
                    <span>{insights.consistency.emoji}</span>{insights.consistency.label}
                  </span>
                  <p className="text-[12.5px] text-fg2 leading-relaxed">{insights.consistency.explanation}</p>
                </>
              ) : (
                <p className="text-[12.5px] text-fg2 leading-relaxed">Complete a few more attempts to unlock a consistency rating.</p>
              )}
            </InsightCard>

            <InsightCard icon={History} tone="brand" title="Recent Accuracy">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <SubjectMetric label="Last 5 · Average" value={`${overview.accuracyTrend.recentAccuracy.last5.averageAccuracy}%`} />
                <SubjectMetric label="Last 5 · Best"    value={`${overview.accuracyTrend.recentAccuracy.last5.bestAccuracy}%`} />
                {overview.accuracyTrend.recentAccuracy.last10 && (
                  <>
                    <SubjectMetric label="Last 10 · Average" value={`${overview.accuracyTrend.recentAccuracy.last10.averageAccuracy}%`} />
                    <SubjectMetric label="Last 10 · Best"    value={`${overview.accuracyTrend.recentAccuracy.last10.bestAccuracy}%`} />
                  </>
                )}
              </div>
            </InsightCard>
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Accuracy Distribution</h4>
          <Card className="p-5 mb-4">
            {overview.accuracyTrend.distribution.map(d => (
              <AccuracyBar
                key={d.band}
                label={d.band}
                count={d.count}
                percentage={d.percentage}
                colorClass={d.band === '90-100%' ? 'bg-emerald-400' : d.band === '80-89%' ? 'bg-sky-400' : d.band === '70-79%' ? 'bg-amber-400' : d.band === '60-69%' ? 'bg-orange-400' : 'bg-rose-400'}
              />
            ))}
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <Sparkles size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Dynamic Insights</h4>
              </div>
              {insights.insightLines.length ? (
                <ul className="space-y-1.5">
                  {insights.insightLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-fg3">Keep practicing to unlock more personalized insights.</p>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <Lightbulb size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Recommendations</h4>
              </div>
              <ul className="space-y-1.5">
                {insights.recommendationLines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

// ── Topic-wise Analytics (Feature 7) ─────────────────────────────────────
// Chapter is used as the Topic unit — the schema/Content API have no
// separate "Topic" level (see analytics.service.ts's getTopicBreakdown for
// the full explanation). Own hook call: a genuinely different grouping from
// subjects/question-types, same "each section is its own fetch" pattern as
// Feature 5.

function TopicPerformanceCard({ topic }: { topic: TopicStat }) {
  const band = getPerformanceBand(topic.accuracyPercent);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
            <BookOpen size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[16px] text-fg1 truncate">{topic.topicName}</h3>
            <p className="text-[11.5px] text-fg3 truncate">{topic.subjectName}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${band.pillClass}`}>
          <span>{band.emoji}</span>{band.label}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className={`h-full rounded-full ${band.barColorClass}`} style={{ width: `${Math.min(100, Math.max(0, topic.accuracyPercent))}%` }} />
        </div>
        <span className="text-[12.5px] font-semibold text-fg1 tabular-nums w-11 text-right">{topic.accuracyPercent}%</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3 border-t border-line">
        <SubjectMetric label="Questions Attempted" value={topic.totalQuestionsAttempted} />
        <SubjectMetric label="Correct Answers"     value={topic.totalCorrect} />
        <SubjectMetric label="Wrong Answers"       value={topic.totalWrong} />
        <SubjectMetric label="Skipped Questions"   value={topic.totalSkipped} />
        <SubjectMetric label="Avg Time / Question" value={fmtSeconds(topic.averageTimePerQuestionSec)} />
        <SubjectMetric label="Last Practiced"       value={fmtDate(topic.lastPracticedDate)} />
      </div>
    </Card>
  );
}

function TopicRankRow({ rank, title, subtitle, value, valueLabel }: {
  rank: number; title: string; subtitle: string; value: string; valueLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-6 h-6 rounded-full bg-surface2 text-fg2 text-[11px] font-bold grid place-items-center shrink-0">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-fg1 truncate">{title}</p>
        <p className="text-[11px] text-fg3 truncate">{subtitle}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-semibold text-fg1 tabular-nums">{value}</p>
        <p className="text-[11px] text-fg3">{valueLabel}</p>
      </div>
    </div>
  );
}

function TopicRankCard({
  icon: Icon, tone, title, rows, emptyText,
}: {
  icon: any; tone: 'emerald' | 'amber' | 'rose' | 'brand'; title: string;
  rows: { key: string; rank: number; title: string; subtitle: string; value: string; valueLabel: string }[];
  emptyText: string;
}) {
  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    rose:    'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
    brand:   'bg-brand-soft text-brand',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${toneClasses[tone]}`}>
          <Icon size={17} />
        </div>
        <h4 className="font-display font-semibold text-[14.5px] text-fg1">{title}</h4>
      </div>
      {rows.length ? (
        <div className="divide-y divide-line">
          {rows.map(r => <TopicRankRow key={r.key} rank={r.rank} title={r.title} subtitle={r.subtitle} value={r.value} valueLabel={r.valueLabel} />)}
        </div>
      ) : (
        <p className="text-[12.5px] text-fg3">{emptyText}</p>
      )}
    </Card>
  );
}

interface TopicWiseAnalyticsProps {
  topics: TopicStat[] | null;
  loading: boolean;
  error: string | null;
}

function TopicWiseAnalytics({ topics, loading, error }: TopicWiseAnalyticsProps) {
  const insights = useMemo(() => deriveTopicInsights(topics ?? []), [topics]);

  return (
    <>
      <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Topic-wise Analytics</h3>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-56" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load topic analytics" desc={error} />
        </Card>
      ) : !topics?.length || !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Layers}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock Topic-wise Analytics."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {topics.map(t => <TopicPerformanceCard key={t.topicId} topic={t} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TopicRankCard
              icon={Trophy} tone="emerald" title="Top 5 Strongest Topics"
              emptyText="Not enough data yet — a topic needs at least 2 attempted questions to be ranked."
              rows={insights.strongestTopics.map((t, i) => ({
                key: t.topicId, rank: i + 1, title: t.topicName, subtitle: t.subjectName,
                value: `${t.accuracyPercent}%`, valueLabel: `${t.totalQuestionsAttempted} questions`,
              }))}
            />
            <TopicRankCard
              icon={AlertTriangle} tone="amber" title="Top 5 Weakest Topics"
              emptyText="Not enough data yet — a topic needs at least 2 attempted questions to be ranked."
              rows={insights.weakestTopics.map((t, i) => ({
                key: t.topicId, rank: i + 1, title: t.topicName, subtitle: t.subjectName,
                value: `${t.accuracyPercent}%`, valueLabel: `${t.totalQuestionsAttempted} questions`,
              }))}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TopicRankCard
              icon={Flame} tone="brand" title="Frequently Practiced Topics"
              emptyText="No topics practiced yet."
              rows={insights.mostPracticedTopics.map((t, i) => ({
                key: t.topicId, rank: i + 1, title: t.topicName, subtitle: t.subjectName,
                value: `${t.totalQuestionsAttempted}`, valueLabel: 'questions attempted',
              }))}
            />
            <TopicRankCard
              icon={Inbox} tone="brand" title="Neglected Topics"
              emptyText="No topics practiced yet."
              rows={insights.neglectedTopics.map((t, i) => ({
                key: t.topicId, rank: i + 1, title: t.topicName, subtitle: t.subjectName,
                value: `${t.totalQuestionsAttempted}`, valueLabel: 'questions attempted',
              }))}
            />
          </div>

          <div className="mb-4">
            <TopicRankCard
              icon={TrendingUp} tone="emerald" title="Topic Improvement"
              emptyText="More practice is needed before improvement can be measured."
              rows={insights.mostImprovedTopics.map((pick, i) => ({
                key: pick.topic.topicId, rank: i + 1, title: pick.topic.topicName,
                subtitle: `${pick.topic.firstAttemptAccuracy}% → ${pick.topic.latestAttemptAccuracy}%`,
                value: `+${pick.improvementPercent}%`, valueLabel: 'improvement',
              }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <Sparkles size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Personalized Insights</h4>
              </div>
              {insights.insightLines.length ? (
                <ul className="space-y-1.5">
                  {insights.insightLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-fg3">Keep practicing to unlock more personalized insights.</p>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <Lightbulb size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Learning Recommendations</h4>
              </div>
              {insights.recommendationLines.length ? (
                <ul className="space-y-1.5">
                  {insights.recommendationLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-fg3">Keep practicing to unlock personalized recommendations.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

// ── AI Learning Insights (Feature 8) ─────────────────────────────────────
// Pure rule-based derivation over PracticeOverviewData + SubjectStat[] +
// QuestionTypeStat[] + TopicStat[] — the exact same four datasets Features
// 1/2/5/7 already fetched above, reused as-is. No fetch of its own, no LLM
// or external AI call anywhere in this section — see
// learningInsightsEngine.ts / confidenceScore.ts for the full rule set and
// the documented confidence-score weighting.

interface AILearningInsightsProps {
  overview: PracticeOverview | null;
  subjects: SubjectStat[] | null;
  questionTypes: QuestionTypeStat[] | null;
  topics: TopicStat[] | null;
  loading: boolean;
  error: string | null;
}

function ConfidenceMeter({ confidence }: { confidence: LearningInsights['confidence'] }) {
  return (
    <Card className="p-5 h-full">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
          <Gauge size={17} />
        </div>
        <div>
          <h4 className="font-display font-semibold text-[14.5px] text-fg1">Confidence Meter</h4>
          <p className="text-[11.5px] text-fg3">Overall readiness, blended from your analytics</p>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-2">
        <span className="font-display font-semibold text-[36px] text-fg1 tabular-nums leading-none">{confidence.score}</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-brand-soft text-brand border-[rgba(53,64,36,0.18)] mb-1.5">
          <span>{confidence.bandEmoji}</span>{confidence.band}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface2 overflow-hidden mb-4">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, confidence.score))}%` }} />
      </div>

      <div className="space-y-2.5 pt-3 border-t border-line">
        {confidence.breakdown.map(b => (
          <div key={b.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-fg1">
                {b.label} <span className="text-fg3 font-normal">· {Math.round(b.weight * 100)}% weight</span>
              </p>
              <p className="text-[11px] text-fg3 truncate">{b.note}</p>
            </div>
            <span className="text-[13px] font-semibold text-fg1 tabular-nums shrink-0">{b.score}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-brand-soft text-brand text-[11px] font-bold grid place-items-center shrink-0 mt-0.5">{rec.rank}</span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-fg1">{rec.title}</p>
          <p className="text-[12px] text-fg3 mt-1"><span className="font-semibold text-fg2">Reason:</span> {rec.reason}</p>
        </div>
      </div>
    </Card>
  );
}

function StudyPriorityRow({ priority }: { priority: StudyPriority }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-6 h-6 rounded-full bg-surface2 text-fg2 text-[11px] font-bold grid place-items-center shrink-0">{priority.rank}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-fg1 truncate">{priority.name}</p>
        <p className="text-[11px] text-fg3 truncate">{priority.subjectName}</p>
      </div>
      <p className="text-[11.5px] text-fg3 text-right shrink-0 max-w-[45%]">{priority.reason}</p>
    </div>
  );
}

const RISK_CARD_TONE: Record<RiskAlert['severity'], string> = {
  high: 'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/25',
  medium: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25',
};
const RISK_ICON_TONE: Record<RiskAlert['severity'], string> = {
  high: 'text-rose-600 dark:text-rose-400',
  medium: 'text-amber-600 dark:text-amber-400',
};

function RiskAlertCard({ alert }: { alert: RiskAlert }) {
  return (
    <div className={`rounded-xl border p-4 ${RISK_CARD_TONE[alert.severity]}`}>
      <div className="flex items-start gap-2.5">
        <AlertOctagon size={16} className={`mt-0.5 shrink-0 ${RISK_ICON_TONE[alert.severity]}`} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg1">{alert.title}</p>
          <p className="text-[12px] text-fg2 mt-0.5 leading-relaxed">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: WeeklyGoal }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
          <ListTodo size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg1">{goal.title}</p>
          <p className="text-[11.5px] text-fg3 mt-0.5">{goal.description}</p>
        </div>
      </div>
    </Card>
  );
}

function AILearningInsights({ overview, subjects, questionTypes, topics, loading, error }: AILearningInsightsProps) {
  const insights = useMemo(() => (
    overview?.hasData && subjects && questionTypes && topics
      ? buildLearningInsights(overview, subjects, questionTypes, topics)
      : null
  ), [overview, subjects, questionTypes, topics]);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <Brain size={18} className="text-brand" /> AI Learning Insights
        </h3>
        <p className="text-[12px] text-fg3 mt-1">
          Rule-based recommendations generated entirely from your own Practice Olympiad data — no external AI service involved.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-40" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load AI Learning Insights" desc={error} />
        </Card>
      ) : !insights ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Brain}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock personalized learning insights."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Sparkles size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">Overall Learning Summary</h4>
            </div>
            <p className="text-[13.5px] text-fg2 leading-relaxed">{insights.summaryLines.join(' ')}</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-1">
              <ConfidenceMeter confidence={insights.confidence} />
            </div>
            <div className="lg:col-span-2">
              <Card className="p-5 h-full">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 grid place-items-center shrink-0">
                    <ThumbsUp size={17} />
                  </div>
                  <h4 className="font-display font-semibold text-[14.5px] text-fg1">Positive Reinforcement</h4>
                </div>
                <p className="font-display font-semibold text-[16px] text-fg1 mb-1">{insights.positive.title}</p>
                <p className="text-[13px] text-fg2 leading-relaxed">{insights.positive.detail}</p>

                {!!insights.learningHabits.length && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <h5 className="text-[11px] font-semibold text-fg3 uppercase tracking-wide mb-2">Learning Habits</h5>
                    <ul className="space-y-1.5">
                      {insights.learningHabits.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {!!insights.riskAlerts.length && (
            <div className="mb-4">
              <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Risk Alerts</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {insights.riskAlerts.map(a => <RiskAlertCard key={a.id} alert={a} />)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
                <Lightbulb size={15} className="text-brand" /> Personalized Recommendations
              </h4>
              {insights.recommendations.length ? (
                <div className="space-y-3">
                  {insights.recommendations.map(r => <RecommendationCard key={r.id} rec={r} />)}
                </div>
              ) : (
                <Card className="p-5"><p className="text-[12.5px] text-fg3">Nothing urgent right now — keep up the balanced practice!</p></Card>
              )}
            </div>

            <div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
                <Compass size={15} className="text-brand" /> Today's Study Priorities
              </h4>
              <Card className="p-5">
                {insights.studyPriorities.length ? (
                  <div className="divide-y divide-line">
                    {insights.studyPriorities.map(p => <StudyPriorityRow key={`${p.rank}-${p.name}`} priority={p} />)}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-fg3">No urgent priorities right now — your practice is well balanced.</p>
                )}
              </Card>
            </div>
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
            <ListTodo size={15} className="text-brand" /> Weekly Goals
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.weeklyGoals.map(g => <GoalCard key={g.id} goal={g} />)}
          </div>
        </>
      )}
    </>
  );
}

// ── Personalized Study Plan (Feature 9) ───────────────────────────────────
// Builds directly on Feature 8's LearningInsights (`buildLearningInsights`
// above) — no new fetch, no recomputed analytics. Today's task-completion
// state lives in localStorage via useStudyPlanProgress; streaks and badges
// are always derived live from real analytics + that local engagement
// record, never persisted as a flag that could go stale. See
// studyPlanEngine.ts for the full rule set.

interface PersonalizedStudyPlanProps {
  overview: PracticeOverview | null;
  subjects: SubjectStat[] | null;
  questionTypes: QuestionTypeStat[] | null;
  topics: TopicStat[] | null;
  loading: boolean;
  error: string | null;
}

function TaskRow({ task, completed, onToggle }: { task: StudyTask; completed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-xl border p-4 transition ${completed ? 'bg-brand-soft border-[rgba(53,64,36,0.18)]' : 'bg-surface1 border-line hover:border-line2'}`}
    >
      <div className="flex items-start gap-3">
        {completed
          ? <CheckSquare size={19} className="text-brand mt-0.5 shrink-0" />
          : <Square size={19} className="text-fg4 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-[13.5px] font-semibold ${completed ? 'text-fg2 line-through' : 'text-fg1'}`}>{task.title}</p>
          <p className="text-[12px] text-fg3 mt-1"><span className="font-semibold text-fg2">Reason:</span> {task.reason}</p>
          <p className="text-[11px] text-fg4 mt-1.5">~{task.estimatedMinutes} min · ~{task.estimatedQuestions} questions</p>
        </div>
      </div>
    </button>
  );
}

function ProgressStat({ label, value, target, suffix = '' }: { label: string; value: number; target: number; suffix?: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-fg3">{label}</span>
        <span className="text-[12.5px] font-semibold text-fg1 tabular-nums">{value}{suffix} / {target}{suffix}</span>
      </div>
      <div className="h-2 rounded-full bg-surface2 overflow-hidden">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WeeklyPlanDayCard({ day }: { day: WeeklyPlanDay }) {
  return (
    <div className={`rounded-xl border p-3.5 ${day.isToday ? 'bg-brand-soft border-[rgba(53,64,36,0.22)]' : 'bg-surface1 border-line'}`}>
      <span className={`text-[11px] font-bold uppercase tracking-wide ${day.isToday ? 'text-brand' : 'text-fg3'}`}>
        {day.dayLabel}{day.isToday ? ' · Today' : ''}
      </span>
      <p className="text-[13px] font-semibold text-fg1 truncate mt-1.5">{day.focus}</p>
      <p className="text-[11px] text-fg3 mt-1 leading-relaxed">{day.reason}</p>
    </div>
  );
}

function BadgeChip({ badge }: { badge: StudyBadge }) {
  return (
    <div className={`rounded-xl border p-3.5 flex items-center gap-3 ${badge.unlocked ? 'bg-brand-soft border-[rgba(53,64,36,0.18)]' : 'bg-surface2 border-line opacity-60'}`}>
      <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${badge.unlocked ? 'bg-brand text-brand-ink' : 'bg-surface1 text-fg4'}`}>
        {badge.unlocked ? <Medal size={16} /> : <Lock size={14} />}
      </div>
      <div className="min-w-0">
        <p className={`text-[12.5px] font-semibold ${badge.unlocked ? 'text-fg1' : 'text-fg3'}`}>{badge.label}</p>
        <p className="text-[10.5px] text-fg4 leading-snug mt-0.5">{badge.description}</p>
      </div>
    </div>
  );
}

function PersonalizedStudyPlan({ overview, subjects, questionTypes, topics, loading, error }: PersonalizedStudyPlanProps) {
  const insights = useMemo(() => (
    overview?.hasData && subjects && questionTypes && topics
      ? buildLearningInsights(overview, subjects, questionTypes, topics)
      : null
  ), [overview, subjects, questionTypes, topics]);

  const { completedTaskIds, toggleTask, completeAll, locallyEngagedDates } = useStudyPlanProgress();

  const plan = useMemo(() => (
    insights ? buildStudyPlan(insights, locallyEngagedDates) : null
  ), [insights, locallyEngagedDates]);

  const totalTasks = plan?.tasks.length ?? 0;
  const completedTasks = plan ? plan.tasks.filter(t => completedTaskIds.has(t.id)) : [];
  const tasksCompleted = completedTasks.length;
  const questionsSolved = completedTasks.reduce((s, t) => s + t.estimatedQuestions, 0);
  const minutesStudied = completedTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const allComplete = totalTasks > 0 && tasksCompleted === totalTasks;

  const overallProgressPercent = plan && totalTasks > 0
    ? Math.round((
        (tasksCompleted / totalTasks)
        + (plan.estimatedQuestionsTotal > 0 ? questionsSolved / plan.estimatedQuestionsTotal : 0)
        + (plan.estimatedMinutesTotal > 0 ? minutesStudied / plan.estimatedMinutesTotal : 0)
      ) / 3 * 100)
    : 0;

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <Rocket size={18} className="text-brand" /> Personalized Study Plan
        </h3>
        <p className="text-[12px] text-fg3 mt-1">
          Your daily and weekly plan, generated from your own analytics and AI Learning Insights above.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-40" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load your study plan" desc={error} />
        </Card>
      ) : !plan ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Rocket}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to unlock your personalized study plan."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2">
              <Card className="p-5 h-full">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                      <ListChecks size={17} />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-[14.5px] text-fg1">Today's Plan</h4>
                      <p className="text-[11.5px] text-fg3">Estimated study time: ~{plan.estimatedMinutesTotal} min</p>
                    </div>
                  </div>
                  <Button
                    size="sm" icon={CheckCircle2}
                    disabled={allComplete}
                    onClick={() => completeAll(plan.tasks.map(t => t.id))}
                  >
                    {allComplete ? 'Plan Complete' : "Complete Today's Plan"}
                  </Button>
                </div>
                <div className="space-y-3">
                  {plan.tasks.map(t => (
                    <TaskRow key={t.id} task={t} completed={completedTaskIds.has(t.id)} onToggle={() => toggleTask(t.id)} />
                  ))}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="p-5 h-full">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                    <Activity size={17} />
                  </div>
                  <h4 className="font-display font-semibold text-[14.5px] text-fg1">Daily Progress</h4>
                </div>
                <div className="space-y-4">
                  <ProgressStat label="Tasks Completed" value={tasksCompleted} target={totalTasks} />
                  <ProgressStat label="Questions Solved" value={questionsSolved} target={plan.estimatedQuestionsTotal} />
                  <ProgressStat label="Time Studied" value={minutesStudied} target={plan.estimatedMinutesTotal} suffix="m" />
                  <div className="pt-3 border-t border-line">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12.5px] font-semibold text-fg1">Overall Progress</span>
                      <span className="text-[13px] font-semibold text-brand tabular-nums">{overallProgressPercent}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${overallProgressPercent}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 grid place-items-center shrink-0">
                  <Flame size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Study Streaks</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-display font-semibold text-[28px] text-fg1 tabular-nums leading-none">{plan.streak.currentStreak}</p>
                  <p className="text-[11px] text-fg3 mt-1">Current Streak</p>
                </div>
                <div>
                  <p className="font-display font-semibold text-[28px] text-fg1 tabular-nums leading-none">{plan.streak.bestStreak}</p>
                  <p className="text-[11px] text-fg3 mt-1">Best Streak</p>
                </div>
              </div>
              {!plan.streak.practicedToday && (
                <p className="text-[11.5px] text-fg3 mt-3 pt-3 border-t border-line">
                  Practice or complete today's plan to keep your streak alive.
                </p>
              )}
            </Card>

            <div className="lg:col-span-2">
              <Card className="p-5 h-full">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                    <Lightbulb size={17} />
                  </div>
                  <h4 className="font-display font-semibold text-[14.5px] text-fg1">Today's Goals</h4>
                </div>
                <ul className="space-y-1.5">
                  {plan.todaysGoals.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                      {g}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
            <CalendarDays size={15} className="text-brand" /> Weekly Study Plan
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
            {plan.weeklyPlan.map(day => <WeeklyPlanDayCard key={day.date} day={day} />)}
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
            <Medal size={15} className="text-brand" /> Achievement Badges
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plan.badges.map(b => <BadgeChip key={b.id} badge={b} />)}
          </div>
        </>
      )}
    </>
  );
}

// ── Personalized Report Card (Feature 10) ─────────────────────────────────
// Builds on Feature 8's LearningInsights and Feature 9's StudyPlan — no new
// fetch, no recomputed analytics, no second AI engine. The AI Performance
// Summary below is literally insights.summaryLines (Feature 8's own text),
// and every number is read from ReportCardData, a single plain object
// (see reportCardEngine.ts) kept UI-free specifically so a future PDF
// export can consume it unchanged.

interface PersonalizedReportCardProps {
  overview: PracticeOverview | null;
  subjects: SubjectStat[] | null;
  questionTypes: QuestionTypeStat[] | null;
  topics: TopicStat[] | null;
  loading: boolean;
  error: string | null;
}

function TrendBadge({ trend }: { trend: PerformanceTrend }) {
  const config = {
    Improving: { icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' },
    Stable: { icon: Minus, cls: 'bg-surface2 text-fg3 border-line' },
    Declining: { icon: TrendingDown, cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' },
  }[trend];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${config.cls}`}>
      <Icon size={11} />{trend}
    </span>
  );
}

function SubjectReportCardTile({ entry }: { entry: SubjectReportCardEntry }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-display font-semibold text-[14.5px] text-fg1 truncate">{entry.subjectName}</h4>
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border text-[13px] font-bold shrink-0 ${entry.grade.pillClass}`}>
          {entry.grade.letter}
        </span>
      </div>
      <div className="mb-3"><TrendBadge trend={entry.trend} /></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-line">
        <SubjectMetric label="Accuracy" value={`${entry.accuracyPercent}%`} />
        <SubjectMetric label="Confidence" value={`${entry.confidence}/100`} />
        <SubjectMetric label="Questions" value={entry.questionsAttempted} />
        <SubjectMetric label="Avg Time" value={fmtSeconds(entry.averageTimePerQuestionSec)} />
      </div>
    </Card>
  );
}

function SubjectHighlightCard({ h, tone }: { h: SubjectHighlight; tone: 'emerald' | 'amber' }) {
  const toneCls = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h5 className="font-display font-semibold text-[14px] text-fg1 truncate">{h.subjectName}</h5>
        <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full shrink-0 ${toneCls}`}>{h.accuracyPercent}%</span>
      </div>
      <p className="text-[11.5px] text-fg3 mb-1.5">Confidence: {h.confidence}/100</p>
      <p className="text-[12.5px] text-fg2 leading-relaxed">{h.reason}</p>
    </Card>
  );
}

function PeriodSummaryCard({ title, icon: Icon, summary, extra }: { title: string; icon: any; summary: PeriodSummary; extra?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
          <Icon size={17} />
        </div>
        <h4 className="font-display font-semibold text-[14.5px] text-fg1">{title}</h4>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <SubjectMetric label="Practice Sessions" value={summary.practiceSessions} />
        <SubjectMetric label="Accuracy" value={`${summary.accuracyPercent}%`} />
        <SubjectMetric label="Confidence Change" value={`${summary.confidenceChange > 0 ? '+' : ''}${summary.confidenceChange}%`} />
        <SubjectMetric label="Questions Solved" value={summary.questionsSolved} />
        {extra}
      </div>
    </Card>
  );
}

function PerformanceBreakdownBars({ breakdown }: { breakdown: ConfidenceBreakdownEntry[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
          <Gauge size={17} />
        </div>
        <h4 className="font-display font-semibold text-[14.5px] text-fg1">Performance Breakdown</h4>
      </div>
      <div className="space-y-3">
        {breakdown.map(b => (
          <div key={b.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12.5px] font-semibold text-fg1">{b.label}</span>
              <span className="text-[12px] text-fg3 tabular-nums">{b.score}/100</span>
            </div>
            <div className="h-2 rounded-full bg-surface2 overflow-hidden">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, b.score))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeacherRemarkCard({ remark }: { remark: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
          <Stamp size={17} />
        </div>
        <div>
          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-1.5">Teacher's Remark</h4>
          <p className="text-[14px] text-fg2 italic leading-relaxed">&ldquo;{remark}&rdquo;</p>
        </div>
      </div>
    </Card>
  );
}

function PersonalizedReportCard({ overview, subjects, questionTypes, topics, loading, error }: PersonalizedReportCardProps) {
  const user = useAuth();

  const insights = useMemo(() => (
    overview?.hasData && subjects && questionTypes && topics
      ? buildLearningInsights(overview, subjects, questionTypes, topics)
      : null
  ), [overview, subjects, questionTypes, topics]);

  const { locallyEngagedDates } = useStudyPlanProgress();
  const plan = useMemo(() => (insights ? buildStudyPlan(insights, locallyEngagedDates) : null), [insights, locallyEngagedDates]);

  const report = useMemo(() => (
    overview?.hasData && insights && subjects ? buildReportCard(overview, subjects, insights, plan) : null
  ), [overview, insights, subjects, plan]);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <GraduationCap size={18} className="text-brand" /> Personalized Report Card
        </h3>
        <p className="text-[12px] text-fg3 mt-1">
          An official-style summary of your Practice Olympiad performance, built from your analytics and AI insights above.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-40" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load your report card" desc={error} />
        </Card>
      ) : !report ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={GraduationCap}
            title="Not enough data yet"
            desc="Complete more Practice Olympiad quizzes to generate your personalized report card."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Certificate-style header band — visually distinct from every analytics Card above it */}
          <Card className="p-6 mb-6 border-2 border-[rgba(53,64,36,0.18)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.11em] uppercase text-fg3 mb-1">Practice Olympiad · Report Card</p>
                <h2 className="font-display font-semibold text-[22px] text-fg1">{user?.name ?? 'Student'}</h2>
                <p className="text-[12px] text-fg3 mt-1">Generated {fmtDate(report.generatedAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-16 h-16 rounded-2xl border-2 grid place-items-center font-display font-bold text-[26px] shrink-0 ${report.studentSummary.overallGrade.pillClass}`}>
                  {report.studentSummary.overallGrade.letter}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-fg1">{report.studentSummary.overallGrade.label}</p>
                  <p className="text-[11px] text-fg3">Overall Grade</p>
                </div>
              </div>
            </div>
          </Card>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Student Performance Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <StatCard label="Overall Accuracy" value={`${report.studentSummary.overallAccuracy}%`} icon={Target} tone="emerald" />
            <StatCard label="Confidence Score" value={report.studentSummary.confidenceScore} change={report.studentSummary.confidenceBand} icon={Gauge} tone="brand" />
            <StatCard label="Practice Olympiads" value={report.studentSummary.totalPracticeOlympiads} icon={Zap} tone="brand" />
            <StatCard label="Questions Attempted" value={report.studentSummary.totalQuestionsAttempted} icon={Hash} tone="brand" />
            <StatCard label="Correct Answers" value={report.studentSummary.totalCorrect} icon={CheckCircle2} tone="emerald" />
            <StatCard label="Wrong Answers" value={report.studentSummary.totalWrong} icon={XCircle} tone="amber" />
            <StatCard label="Skipped Questions" value={report.studentSummary.totalSkipped} icon={MinusCircle} tone="violet" />
            <StatCard label="Avg Time / Question" value={fmtSeconds(report.studentSummary.averageTimePerQuestionSec)} icon={Timer} tone="violet" />
            <StatCard label="Overall Rank" value={report.studentSummary.overallRank} icon={Trophy} tone="brand" />
          </div>

          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
            <FileBadge size={15} className="text-brand" /> Subject Report Card
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {report.subjectReportCards.map(s => <SubjectReportCardTile key={s.subjectId} entry={s} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
                <Trophy size={15} className="text-emerald-600 dark:text-emerald-400" /> Strongest Subjects
              </h4>
              {report.strongestSubjects.length ? (
                <div className="space-y-3">
                  {report.strongestSubjects.map(h => <SubjectHighlightCard key={h.subjectName} h={h} tone="emerald" />)}
                </div>
              ) : (
                <Card className="p-5"><p className="text-[12.5px] text-fg3">Keep practicing to build a standout subject.</p></Card>
              )}
            </div>
            <div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" /> Subjects Needing Improvement
              </h4>
              {report.subjectsNeedingImprovement.length ? (
                <div className="space-y-3">
                  {report.subjectsNeedingImprovement.map(h => <SubjectHighlightCard key={h.subjectName} h={h} tone="amber" />)}
                </div>
              ) : (
                <Card className="p-5"><p className="text-[12.5px] text-fg3">No subject is currently below target — nice, balanced progress!</p></Card>
              )}
            </div>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Award size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">Performance Highlights</h4>
            </div>
            {report.performanceHighlights.length ? (
              <ul className="space-y-1.5">
                {report.performanceHighlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-fg3">Keep practicing to unlock performance highlights.</p>
            )}
          </Card>

          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Sparkles size={17} />
              </div>
              <h4 className="font-display font-semibold text-[14.5px] text-fg1">AI Performance Summary</h4>
            </div>
            <p className="text-[13.5px] text-fg2 leading-relaxed">{report.aiSummary}</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <PeriodSummaryCard title="Weekly Summary" icon={CalendarDays} summary={report.weeklySummary} />
            <PeriodSummaryCard
              title="Monthly Summary" icon={CalendarCheck} summary={report.monthlySummary}
              extra={<SubjectMetric label="Total Study Time" value={fmtDuration(report.monthlySummary.totalStudyTimeSec)} />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PerformanceBreakdownBars breakdown={report.performanceBreakdown} />
            <TeacherRemarkCard remark={report.teacherRemark} />
          </div>
        </>
      )}
    </>
  );
}

export function AnalyticsPage() {
  const { data, loading, error } = usePracticeOverview();
  // Lifted up from SubjectWisePerformance so Feature 3 (Strength & Weakness
  // Analysis) can reuse the exact same fetched array instead of issuing a
  // second request for data it already has.
  const { data: subjects, loading: subjectsLoading, error: subjectsError } = useSubjectBreakdown();
  // Feature 5's own fetch — a genuinely different grouping/dataset from
  // `subjects` above, not reusable from it.
  const { data: questionTypes, loading: questionTypesLoading, error: questionTypesError } = useQuestionTypeBreakdown();
  // Feature 7's own fetch — a genuinely different grouping/dataset from
  // `subjects`/`questionTypes` above, not reusable from either.
  const { data: topics, loading: topicsLoading, error: topicsError } = useTopicBreakdown();

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Analytics"
        title="Practice Analytics"
        subtitle="Your overall Practice Olympiad performance."
      />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={XCircle}
            title="Couldn't load your analytics"
            desc={error}
          />
        </Card>
      ) : !data?.hasData ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={BarChart3}
            title="No practice history yet"
            desc="Start a Practice Olympiad session to begin building your performance analytics — your stats will show up here as soon as you submit your first attempt."
            action={
              <Button icon={PlayCircle} onClick={() => { window.location.href = '/#/play'; }}>
                Start Practicing
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Overall Performance</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Practice Attempts"     value={data.totalAttempts}                          icon={Zap}          tone="brand"   />
            <StatCard label="Total Questions Attempted"   value={data.totalQuestionsAttempted}                icon={Hash}         tone="brand"   />
            <StatCard label="Total Correct Answers"       value={data.totalCorrect}                           icon={CheckCircle2} tone="emerald" />
            <StatCard label="Total Wrong Answers"          value={data.totalWrong}                             icon={XCircle}      tone="amber"   />
            <StatCard label="Total Skipped Questions"     value={data.totalSkipped}                           icon={MinusCircle}  tone="violet"  />
            <StatCard label="Overall Accuracy"            value={`${data.accuracyPercent}%`}                  icon={Target}       tone="emerald" />
            <StatCard label="Average Score"               value={data.averageScore}                           icon={Award}        tone="brand"   />
            <StatCard label="Best Score"                  value={data.bestScore}                              icon={Trophy}       tone="emerald" />
            <StatCard label="Lowest Score"                value={data.lowestScore}                            icon={TrendingDown} tone="amber"   />
            <StatCard label="Average Percentage"          value={`${data.averagePercentage}%`}                icon={TrendingUp}   tone="brand"   />
            <StatCard label="Total Practice Time"         value={fmtDuration(data.totalPracticeTimeSec)}      icon={Clock}        tone="violet"  />
            <StatCard label="Average Time per Question"  value={fmtSeconds(data.averageTimePerQuestionSec)}  icon={Timer}        tone="violet"  />
          </div>

          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Additional Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="First Practice Date"                     value={fmtDate(data.firstPracticeDate)}      icon={CalendarPlus}  tone="brand"  />
            <StatCard label="Last Practice Date"                      value={fmtDate(data.lastPracticeDate)}       icon={CalendarCheck} tone="brand"  />
            <StatCard label="Total Subjects Practiced"                value={data.totalSubjectsPracticed}          icon={Layers}        tone="emerald"/>
            <StatCard label="Total Mixed Subjects Practice Attempts"  value={data.totalMixedPracticeAttempts}      icon={Shuffle}       tone="violet" />
          </div>
        </>
      )}

      <div className="mb-8">
        <SubjectWisePerformance subjects={subjects} loading={subjectsLoading} error={subjectsError} />
      </div>

      <div className="mb-8">
        <StrengthWeaknessAnalysis subjects={subjects} loading={subjectsLoading} error={subjectsError} />
      </div>

      <div className="mb-8">
        <SpeedTimeAnalytics
          overview={data}
          subjects={subjects}
          loading={loading || subjectsLoading}
          error={error || subjectsError}
        />
      </div>

      <div className="mb-8">
        <QuestionTypeAnalytics types={questionTypes} loading={questionTypesLoading} error={questionTypesError} />
      </div>

      <div className="mb-8">
        <AccuracyAnalytics overview={data} loading={loading} error={error} />
      </div>

      <div className="mb-8">
        <TopicWiseAnalytics topics={topics} loading={topicsLoading} error={topicsError} />
      </div>

      <div className="mb-8">
        <AILearningInsights
          overview={data}
          subjects={subjects}
          questionTypes={questionTypes}
          topics={topics}
          loading={loading || subjectsLoading || questionTypesLoading || topicsLoading}
          error={error || subjectsError || questionTypesError || topicsError}
        />
      </div>

      <div className="mb-8">
        <PersonalizedStudyPlan
          overview={data}
          subjects={subjects}
          questionTypes={questionTypes}
          topics={topics}
          loading={loading || subjectsLoading || questionTypesLoading || topicsLoading}
          error={error || subjectsError || questionTypesError || topicsError}
        />
      </div>

      <PersonalizedReportCard
        overview={data}
        subjects={subjects}
        questionTypes={questionTypes}
        topics={topics}
        loading={loading || subjectsLoading || questionTypesLoading || topicsLoading}
        error={error || subjectsError || questionTypesError || topicsError}
      />
    </StandalonePage>
  );
}
