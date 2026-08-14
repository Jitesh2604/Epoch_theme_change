import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Hash, CheckCircle2, XCircle, Target,
  Timer,
  Layers, BarChart3, BookOpen,
  Sparkles, Gauge,
  History, Lightbulb, Brain, Compass,
  ThumbsUp,
  ClipboardList, Eye,
  TrendingUp, TrendingDown, Minus, GitCommitHorizontal,
} from 'lucide-react';
import { PageHeader, Card, Button, StatCard, Skeleton, EmptyState } from '../../shared/ui';
import { HorizontalBarChart, StackedBarChart, LineChart } from '../../shared/charts';
import {
  usePracticeOverview, useSubjectBreakdown, useSubjectQuestionTypeBreakdown, useQuestionTypeBreakdown, useTopicBreakdown,
  useDifficultyBreakdown,
  type SubjectStat, type SubjectQuestionTypeStat, type PracticeOverview, type QuestionTypeStat, type TopicStat, type DifficultyStat,
} from '../../../hooks/useStudentAnalytics';
import { getStrengthStatus } from '../../../lib/performanceBand';
import { fmtDurationHMS, fmtSeconds, fmtDate } from '../../../lib/formatters';
import { getQuestionTypeLabel } from '../../../lib/questionTypeLabel';
import {
  buildLearningInsights,
  type Recommendation, type StudyPriority,
  type LearningInsights,
} from '../../../lib/learningInsightsEngine';
import { deriveTopicInsights } from '../../../lib/topicInsights';
import { useOlympiadAttempts, type OlympiadAttemptSummary } from '../../../hooks/usePracticeQuiz';
import { buildReviewLearningSummary } from '../../../lib/practiceReviewInsights';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
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

// Question-type accuracy for one subject, nested inside that subject's own
// Subject-wise Performance card (Feature 2b) — reuses getStrengthStatus, the
// exact same Strong/Average/Needs Improvement 3-tier badge the subject card
// above already uses, so the two stay visually consistent. Only types the
// student has actually answered in this subject are ever passed in — never
// zero-filled/invented rows.
function SubjectQuestionTypeRow({ stat }: { stat: SubjectQuestionTypeStat }) {
  const status = getStrengthStatus(stat.accuracyPercent);
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-[12.5px] font-medium text-fg1 truncate flex-1 min-w-0">{getQuestionTypeLabel(stat.questionType)}</span>
      <span className="text-[11px] text-fg3 tabular-nums shrink-0">{stat.totalCorrect}/{stat.totalQuestionsAttempted}</span>
      <span className="text-[12.5px] font-semibold text-fg1 tabular-nums shrink-0 w-10 text-right">{stat.accuracyPercent}%</span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold shrink-0 ${status.pillClass}`}>
        <span>{status.emoji}</span>{status.label}
      </span>
    </div>
  );
}

function SubjectPerformanceCard({ subject, questionTypes }: { subject: SubjectStat; questionTypes: SubjectQuestionTypeStat[] }) {
  const status = getStrengthStatus(subject.accuracyPercent);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
            <BookOpen size={17} />
          </div>
          <h3 className="font-display font-semibold text-[16px] text-fg1 truncate">{subject.subjectName}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${status.pillClass}`}>
          <span>{status.emoji}</span>{status.label}
        </span>
      </div>

      {/* Accuracy meter */}
      <div className="flex items-center gap-2 mt-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className={`h-full rounded-full ${status.barColorClass}`} style={{ width: `${Math.min(100, Math.max(0, subject.accuracyPercent))}%` }} />
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

      {!!questionTypes.length && (
        <div className="mt-4 pt-3 border-t border-line">
          <h4 className="text-[11px] font-semibold text-fg3 uppercase tracking-wide mb-1">Question Type Breakdown</h4>
          <div className="divide-y divide-line">
            {questionTypes.map(t => <SubjectQuestionTypeRow key={t.questionType} stat={t} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

interface SubjectsSectionProps {
  subjects: SubjectStat[] | null;
  questionTypes: SubjectQuestionTypeStat[] | null;
  loading: boolean;
  error: string | null;
}

function SubjectWisePerformance({ subjects, questionTypes, loading, error }: SubjectsSectionProps) {
  // Group the (already subject-tagged) question-type rows by subjectId once,
  // so each card below does a cheap Map lookup instead of re-filtering the
  // full array per subject.
  const questionTypesBySubject = useMemo(() => {
    const map = new Map<string, SubjectQuestionTypeStat[]>();
    for (const t of questionTypes ?? []) {
      const list = map.get(t.subjectId);
      if (list) list.push(t);
      else map.set(t.subjectId, [t]);
    }
    return map;
  }, [questionTypes]);

  return (
    <>
      <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Subject-wise Performance</h3>

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
      ) : !subjects?.length ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={Layers}
            title="No subject-wise data yet"
            desc="Start practicing to unlock your subject-wise analytics."
          />
        </Card>
      ) : (
        <>
          {/* Visual comparison — easiest way to see subjects side-by-side
              before drilling into each card's detail below. Same
              accuracyPercent + strength-band colors the cards themselves
              use, just laid out as bars instead of separate tiles. */}
          {subjects.length > 1 && (
            <Card className="p-5 mb-4">
              <HorizontalBarChart
                rows={subjects
                  .slice()
                  .sort((a, b) => b.accuracyPercent - a.accuracyPercent)
                  .map(s => ({
                    key: s.subjectId,
                    label: s.subjectName,
                    value: s.accuracyPercent,
                    max: 100,
                    valueLabel: `${s.accuracyPercent}%`,
                    colorClass: getStrengthStatus(s.accuracyPercent).barColorClass,
                  }))}
              />
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map(s => (
              <SubjectPerformanceCard key={s.subjectId} subject={s} questionTypes={questionTypesBySubject.get(s.subjectId) ?? []} />
            ))}
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
        </>
      )}
    </>
  );
}

// ── Practice Review & Mistake Analysis (Feature 12) ──────────────────────
// Attempt History reuses the exact same attempt-history endpoint the
// Results page already calls (useOlympiadAttempts), filtered to submitted,
// non-Olympiad (Practice + Mixed) attempts — the same rule ResultsPage.tsx
// already applies, so no new endpoint. Learning Summary reuses Features
// 2/5/7's already-fetched SubjectStat[]/QuestionTypeStat[]/TopicStat[] — no
// new query either. The Review Screen itself (per-question mistake
// analysis, retry, bookmarks, filters/search, print) is its own page — see
// PracticeReviewPage.tsx — reached via each card's "Review Attempt" button.

function AttemptHistoryCard({ attempt, onReview }: { attempt: OlympiadAttemptSummary; onReview: () => void }) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display font-semibold text-[14.5px] text-fg1 truncate">
            {attempt.subject?.name ?? 'Mixed Subjects Practice'}
          </h4>
          <p className="text-[11.5px] text-fg3 mt-0.5">{fmtDate(attempt.startTime)}</p>
        </div>
        {attempt.difficulty && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-brand-soft text-brand border-[rgba(53,64,36,0.18)] shrink-0">
            {attempt.difficulty[0]}{attempt.difficulty.slice(1).toLowerCase()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-3 border-t border-line">
        <SubjectMetric label="Score"       value={attempt.score} />
        <SubjectMetric label="Accuracy"    value={`${Math.round(attempt.percentage)}%`} />
        <SubjectMetric label="Time Taken"  value={fmtDurationHMS(attempt.timeTakenSec)} />
        <SubjectMetric label="Questions"   value={attempt.questionCount} />
      </div>

      <Button variant="soft" size="sm" icon={Eye} className="w-full mt-auto" onClick={onReview}>
        Review Attempt
      </Button>
    </Card>
  );
}

interface PracticeReviewSectionProps {
  subjects: SubjectStat[] | null;
  questionTypes: QuestionTypeStat[] | null;
  topics: TopicStat[] | null;
  // Lifted to AnalyticsPage so it's fetched once, not once per section —
  // see AnalyticsPage's own useOlympiadAttempts() call below.
  allAttempts: OlympiadAttemptSummary[] | null;
  loading: boolean;
  error: string | null;
}

// Attempt History defaults to just the most recent few (attempts already
// arrive sorted newest-first — see getOlympiadAttempts' orderBy) so this
// section stays compact; "View All" reveals the rest in place.
const ATTEMPT_HISTORY_PREVIEW_COUNT = 3;

function PracticeReviewAndMistakeAnalysis({ subjects, questionTypes, topics, allAttempts, loading, error }: PracticeReviewSectionProps) {
  const navigate = useNavigate();
  const [showAllAttempts, setShowAllAttempts] = useState(false);

  const attempts = useMemo(() => (
    (allAttempts ?? []).filter(a => a.status === 'SUBMITTED' && a.quizType !== 'OLYMPIAD')
  ), [allAttempts]);

  const visibleAttempts = showAllAttempts ? attempts : attempts.slice(0, ATTEMPT_HISTORY_PREVIEW_COUNT);

  const learningSummary = useMemo(() => (
    subjects && questionTypes && topics ? buildReviewLearningSummary(subjects, questionTypes, topics) : []
  ), [subjects, questionTypes, topics]);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <ClipboardList size={18} className="text-brand" /> Practice Review &amp; Mistake Analysis
        </h3>
        <p className="text-[12px] text-fg3 mt-1">
          Review any past Practice Olympiad attempt question-by-question and see exactly where marks were lost.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-40" /></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={XCircle} title="Couldn't load your attempt history" desc={error} />
        </Card>
      ) : !attempts.length ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={ClipboardList}
            title="No completed attempts yet"
            desc="Complete a Practice Olympiad quiz to unlock attempt review and mistake analysis."
          />
        </Card>
      ) : (
        <>
          <h4 className="font-display font-semibold text-[14.5px] text-fg1 mb-3">Attempt History</h4>
          <div className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleAttempts.map(a => (
                <AttemptHistoryCard key={a.attemptId} attempt={a} onReview={() => navigate(`/review/${a.attemptId}`)} />
              ))}
            </div>

            {attempts.length > ATTEMPT_HISTORY_PREVIEW_COUNT && (
              <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => setShowAllAttempts(v => !v)}>
                  {showAllAttempts ? 'Show Less' : `View All (${attempts.length})`}
                </Button>
              </div>
            )}
          </div>

          {!!learningSummary.length && (
            <Card className="p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <Sparkles size={17} />
                </div>
                <h4 className="font-display font-semibold text-[14.5px] text-fg1">Learning Summary</h4>
              </div>
              <ul className="space-y-1.5">
                {learningSummary.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-fg2 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ── Improvement Trend ──────────────────────────────────────────────────────
// Pure derivation over PracticeOverviewData.accuracyTrend.history — already
// computed server-side (per-attempt accuracy, chronological) for Feature 6;
// this just charts it instead of only feeding the AI Insights text. The
// improving/declining/consistent read reuses the same firstAttemptAccuracy/
// latestAttemptAccuracy the backend already computed, not a new calculation.

const TREND_STABLE_BAND = 5; // percentage points — matches the tolerance already implied by this feature's existing "recent windows" framing

function ImprovementTrendSection({ overview, loading, error }: { overview: PracticeOverview | null; loading: boolean; error: string | null }) {
  const history = overview?.hasData ? overview.accuracyTrend.history : [];

  const trend = useMemo(() => {
    if (!overview?.hasData || history.length < 2) return null;
    const delta = round1(overview.accuracyTrend.latestAttemptAccuracy - overview.accuracyTrend.firstAttemptAccuracy);
    if (delta > TREND_STABLE_BAND) return { label: 'Improving', delta, icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' };
    if (delta < -TREND_STABLE_BAND) return { label: 'Declining', delta, icon: TrendingDown, cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' };
    return { label: 'Consistent', delta, icon: Minus, cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25' };
  }, [overview, history.length]);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <TrendingUp size={18} className="text-brand" /> Improvement Trend
        </h3>
        <p className="text-[12px] text-fg3 mt-1">Your accuracy across attempts, in order — see whether you're moving up or down.</p>
      </div>

      {loading ? (
        <Card className="p-5"><Skeleton className="h-40" /></Card>
      ) : error ? (
        <Card className="p-0 overflow-hidden"><EmptyState icon={XCircle} title="Couldn't load your improvement trend" desc={error} /></Card>
      ) : history.length < 2 ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={GitCommitHorizontal}
            title="Not enough attempts yet"
            desc="Complete a few more Practice Olympiad attempts to see your improvement trend."
          />
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] text-fg3">Attempt-by-attempt accuracy</div>
              <div className="font-display font-semibold text-[22px] text-fg1 tabular-nums">{history[history.length - 1].accuracy}%</div>
            </div>
            {trend && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-semibold shrink-0 ${trend.cls}`}>
                <trend.icon size={13} /> {trend.label} {trend.delta > 0 ? '+' : ''}{trend.delta}%
              </span>
            )}
          </div>
          <LineChart points={history.map(h => ({ label: fmtDate(h.date), value: h.accuracy }))} />
        </Card>
      )}
    </>
  );
}

// ── Difficulty-wise Performance (Answer Distribution + Difficulty
// Distribution) ────────────────────────────────────────────────────────────
// Both charts come from the one getDifficultyBreakdown fetch — Distribution
// reads totalQuestionsAttempted (share of questions per tier), Answer
// Breakdown reads correct/wrong/skipped (how you did within each tier).
// Grouped into one card, not two, so the page doesn't gain two more
// near-identical large sections for what's fundamentally one dataset.

const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const DIFFICULTY_COLOR: Record<string, string> = { EASY: 'bg-emerald-400', MEDIUM: 'bg-amber-400', HARD: 'bg-rose-400' };

function DifficultyPerformanceSection({ difficulties, loading, error }: { difficulties: DifficultyStat[] | null; loading: boolean; error: string | null }) {
  const totalQuestions = (difficulties ?? []).reduce((s, d) => s + d.totalQuestionsAttempted, 0);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <Layers size={18} className="text-brand" /> Difficulty-wise Performance
        </h3>
        <p className="text-[12px] text-fg3 mt-1">How your questions split across Easy/Medium/Hard, and how you did on each.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5"><Skeleton className="h-32" /></Card>
          <Card className="p-5"><Skeleton className="h-32" /></Card>
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden"><EmptyState icon={XCircle} title="Couldn't load your difficulty breakdown" desc={error} /></Card>
      ) : !difficulties?.length ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={Layers} title="No difficulty data yet" desc="Start practicing to see your performance broken down by question difficulty." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h4 className="text-[12.5px] font-semibold text-fg2 mb-3">Question Distribution</h4>
            <HorizontalBarChart
              rows={difficulties.map(d => ({
                key: d.difficulty,
                label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty,
                value: d.totalQuestionsAttempted,
                max: Math.max(...difficulties.map(x => x.totalQuestionsAttempted), 1),
                valueLabel: `${d.totalQuestionsAttempted} (${totalQuestions > 0 ? Math.round((d.totalQuestionsAttempted / totalQuestions) * 100) : 0}%)`,
                colorClass: DIFFICULTY_COLOR[d.difficulty] ?? 'bg-brand',
              }))}
            />
          </Card>

          <Card className="p-5">
            <h4 className="text-[12.5px] font-semibold text-fg2 mb-3">Answer Breakdown</h4>
            <StackedBarChart
              rows={difficulties.map(d => ({
                key: d.difficulty,
                label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty,
                total: d.totalQuestionsAttempted,
                trailingLabel: `${d.accuracyPercent}% accuracy`,
                segments: [
                  { name: 'Correct', value: d.totalCorrect, colorClass: 'bg-emerald-400' },
                  { name: 'Wrong', value: d.totalWrong, colorClass: 'bg-rose-400' },
                  { name: 'Skipped', value: d.totalSkipped, colorClass: 'bg-slate-300 dark:bg-slate-600' },
                ],
              }))}
              legend={[
                { name: 'Correct', value: 0, colorClass: 'bg-emerald-400' },
                { name: 'Wrong', value: 0, colorClass: 'bg-rose-400' },
                { name: 'Skipped', value: 0, colorClass: 'bg-slate-300 dark:bg-slate-600' },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

// ── Strong & Weak Topics ────────────────────────────────────────────────────
// deriveTopicInsights (topicInsights.ts) already computes strongestTopics/
// weakestTopics from TopicStat[] — top-5, ranked, topics with only 1
// attempted question excluded to avoid a lucky/unlucky single answer
// looking like a real strength or weakness. Already written for Feature 8's
// AI Insights text; this is its first direct visual use.

function TopicRankList({ topics, tone, emptyLabel }: { topics: TopicStat[]; tone: string; emptyLabel: string }) {
  if (!topics.length) {
    return <p className="text-[12.5px] text-fg3 py-6 text-center">{emptyLabel}</p>;
  }
  return (
    <HorizontalBarChart
      rows={topics.map(t => ({
        key: t.topicId,
        label: t.topicName,
        sublabel: t.subjectName,
        value: t.accuracyPercent,
        max: 100,
        valueLabel: `${t.accuracyPercent}%`,
        colorClass: tone,
      }))}
    />
  );
}

function TopicPerformanceSection({ topics, loading, error }: { topics: TopicStat[] | null; loading: boolean; error: string | null }) {
  const insights = useMemo(() => (topics ? deriveTopicInsights(topics) : null), [topics]);

  return (
    <>
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[16px] text-fg1 flex items-center gap-2">
          <Compass size={18} className="text-brand" /> Topic Performance
        </h3>
        <p className="text-[12px] text-fg3 mt-1">Your strongest and weakest topics, based on actual practice accuracy (topics with only one question answered are excluded).</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5"><Skeleton className="h-48" /></Card>
          <Card className="p-5"><Skeleton className="h-48" /></Card>
        </div>
      ) : error ? (
        <Card className="p-0 overflow-hidden"><EmptyState icon={XCircle} title="Couldn't load your topic performance" desc={error} /></Card>
      ) : !insights || (!insights.strongestTopics.length && !insights.weakestTopics.length) ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState icon={Compass} title="No topic data yet" desc="Practice at least 2 questions in a topic to see your strong and weak areas here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h4 className="text-[12.5px] font-semibold text-fg2 mb-3 flex items-center gap-1.5"><TrendingUp size={14} className="text-emerald-500" /> Strong Topics</h4>
            <TopicRankList topics={insights.strongestTopics} tone="bg-emerald-400" emptyLabel="No strong topics identified yet." />
          </Card>
          <Card className="p-5">
            <h4 className="text-[12.5px] font-semibold text-fg2 mb-3 flex items-center gap-1.5"><TrendingDown size={14} className="text-rose-500" /> Weak Topics</h4>
            <TopicRankList topics={insights.weakestTopics} tone="bg-rose-400" emptyLabel="No weak topics identified yet." />
          </Card>
        </div>
      )}
    </>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function AnalyticsPage() {
  const { data, loading, error } = usePracticeOverview();
  // Lifted up from SubjectWisePerformance so AI Learning Insights can reuse
  // the exact same fetched array instead of issuing a second request for
  // data it already has.
  const { data: subjects, loading: subjectsLoading, error: subjectsError } = useSubjectBreakdown();
  // Feeds the per-subject Question Type Breakdown embedded in each
  // Subject-wise Performance card below — a different grouping (subject ×
  // type together) from the cross-subject `questionTypes` fetched next, so
  // it needs its own request.
  const { data: subjectQuestionTypes } = useSubjectQuestionTypeBreakdown();
  // Feature 5's own fetch — a genuinely different grouping/dataset from
  // `subjects` above, still used by AI Learning Insights / Practice Review's
  // learning summary below, not reusable from it.
  const { data: questionTypes, loading: questionTypesLoading, error: questionTypesError } = useQuestionTypeBreakdown();
  // Feature 7's own fetch — a genuinely different grouping/dataset from
  // `subjects`/`questionTypes` above, not reusable from either.
  const { data: topics, loading: topicsLoading, error: topicsError } = useTopicBreakdown();
  // Lifted here (rather than fetched separately inside PracticeReviewAndMistakeAnalysis)
  // so it's fetched once per page load, not twice.
  const { data: allAttempts, loading: attemptsLoading, error: attemptsError } = useOlympiadAttempts();
  // Powers Difficulty-wise Performance's two charts (Distribution + Answer
  // Breakdown) from a single fetch — see useStudentAnalytics.ts.
  const { data: difficulties, loading: difficultiesLoading, error: difficultiesError } = useDifficultyBreakdown();

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Analytics"
        title="Practice Analytics"
        subtitle="Your overall Practice Olympiad performance."
      />

      <div className="mb-8">
        <PracticeReviewAndMistakeAnalysis
          subjects={subjects} questionTypes={questionTypes} topics={topics}
          allAttempts={allAttempts} loading={attemptsLoading} error={attemptsError}
        />
      </div>

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
          />
        </Card>
      ) : (
        <>
          <h3 className="font-display font-semibold text-[16px] text-fg1 mb-4">Overall Performance</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Practice Attempts"     value={data.totalAttempts}                          icon={Zap}          tone="brand"   />
            <StatCard label="Total Questions Attempted"   value={data.totalQuestionsAttempted}                icon={Hash}         tone="brand"   />
            <StatCard label="Total Correct Answers"       value={data.totalCorrect}                           icon={CheckCircle2} tone="emerald" />
            <StatCard label="Total Wrong Answers"          value={data.totalWrong}                             icon={XCircle}      tone="amber"   />
            <StatCard label="Overall Accuracy"            value={`${data.accuracyPercent}%`}                  icon={Target}       tone="emerald" />
            <StatCard label="Average Time per Question"  value={fmtSeconds(data.averageTimePerQuestionSec)}  icon={Timer}        tone="violet"  />
          </div>
        </>
      )}

      <div className="mb-8">
        <ImprovementTrendSection overview={data} loading={loading} error={error} />
      </div>

      <div className="mb-8">
        <SubjectWisePerformance
          subjects={subjects}
          questionTypes={subjectQuestionTypes}
          loading={subjectsLoading}
          error={subjectsError}
        />
      </div>

      <div className="mb-8">
        <DifficultyPerformanceSection difficulties={difficulties} loading={difficultiesLoading} error={difficultiesError} />
      </div>

      <div className="mb-8">
        <TopicPerformanceSection topics={topics} loading={topicsLoading} error={topicsError} />
      </div>

      <AILearningInsights
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
