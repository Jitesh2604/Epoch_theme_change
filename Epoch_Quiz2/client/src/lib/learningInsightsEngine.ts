import type {
  PracticeOverviewData, SubjectStat, QuestionTypeStat, TopicStat,
} from '../hooks/useStudentAnalytics';
import { deriveInsights, type StrengthWeaknessInsights } from './strengthWeaknessInsights';
import { deriveSpeedInsights, type SpeedTimeInsights } from './speedInsights';
import { deriveQuestionTypeInsights, type QuestionTypeInsights } from './questionTypeInsights';
import { deriveAccuracyInsights, type AccuracyInsights } from './accuracyInsights';
import { deriveTopicInsights, type TopicInsights } from './topicInsights';
import { getQuestionTypeLabel } from './questionTypeLabel';
import { getSpeedBand } from './speedBand';
import { fmtSeconds, fmtDuration } from './formatters';
import { computeConfidence, type ConfidenceResult } from './confidenceScore';

/**
 * Feature 8: AI Learning Insights & Personalized Study Recommendations.
 *
 * Rule-based only — every output below is a deterministic function of
 * Features 1/2/5/6/7's already-computed analytics (fetched once by
 * AnalyticsPage.tsx and reused here via the derive* helpers those features
 * already ship). No LLM, no external AI service, nothing non-deterministic.
 * Practice Olympiad data only — the inputs are PracticeOverviewData /
 * SubjectStat[] / QuestionTypeStat[] / TopicStat[], which never touch
 * Submission (Assessment), leaderboard, or admin data (see
 * analytics.service.ts).
 *
 * Each concern (recommendations, priorities, habits, ...) is its own small
 * builder function over a shared `Ctx`, so new rules can be added to a
 * single rule list without touching the others — see RECOMMENDATION_RULES.
 */

export const MIN_ATTEMPTS_FOR_INSIGHTS = 3;

/**
 * The five derive* results this whole feature is built from — exported so
 * Feature 9 (Personalized Study Plan) can consume the exact same derived
 * objects via `LearningInsights.derived` instead of recomputing them. Only
 * AnalyticsPage.tsx calls buildLearningInsights(); everything downstream
 * reuses its output.
 */
export interface DerivedAnalytics {
  overview: PracticeOverviewData;
  subjects: SubjectStat[];
  questionTypes: QuestionTypeStat[];
  topics: TopicStat[];
  subjectInsights: StrengthWeaknessInsights | null;
  speedInsights: SpeedTimeInsights | null;
  questionTypeInsights: QuestionTypeInsights | null;
  accuracyInsights: AccuracyInsights;
  topicInsights: TopicInsights | null;
}

type Ctx = DerivedAnalytics;

export interface Recommendation {
  id: string;
  rank: number;
  title: string;
  reason: string;
}

export interface StudyPriority {
  rank: number;
  name: string;
  subjectName: string;
  reason: string;
}

export interface RiskAlert {
  id: string;
  severity: 'high' | 'medium';
  title: string;
  message: string;
}

export interface WeeklyGoal {
  id: string;
  title: string;
  description: string;
}

export interface PositiveReinforcement {
  title: string;
  detail: string;
}

export interface LearningInsights {
  summaryLines: string[];
  recommendations: Recommendation[];
  studyPriorities: StudyPriority[];
  learningHabits: string[];
  positive: PositiveReinforcement;
  riskAlerts: RiskAlert[];
  weeklyGoals: WeeklyGoal[];
  confidence: ConfidenceResult;
  /** The raw derived analytics behind every field above — see DerivedAnalytics. */
  derived: DerivedAnalytics;
}

// ── Today's Study Priorities ──────────────────────────────────────────────
// Topic-level (Feature 7) when chapter data exists; falls back to
// subject-level (Feature 2/3) when it doesn't, rather than inventing topic
// data or issuing a new query. Same scoring rule applied to whichever
// granularity is available.

// Exported — Feature 11's practiceRecommendationEngine.ts reuses the same
// "declining" bar rather than defining its own, so the two features never
// disagree on what counts as a decline.
export const DECLINE_THRESHOLD = -5; // accuracy points, latest vs first
// Exported — Feature 9's studyPlanEngine.ts reuses the same "weak" bar
// rather than defining its own, so the two features never disagree on what
// counts as a weak subject.
export const LOW_ACCURACY_THRESHOLD = 70;

function priorityReason(accuracyPercent: number, declining: boolean, highVolume: boolean): string | null {
  if (declining) return 'Recently declining performance.';
  if (accuracyPercent < LOW_ACCURACY_THRESHOLD && highVolume) return 'Low accuracy with high attempt count.';
  if (accuracyPercent < LOW_ACCURACY_THRESHOLD) return 'Low accuracy — needs more practice.';
  return null;
}

function priorityScore(accuracyPercent: number, declining: boolean, highVolume: boolean): number {
  let score = 0;
  if (accuracyPercent < LOW_ACCURACY_THRESHOLD) score += LOW_ACCURACY_THRESHOLD - accuracyPercent;
  if (declining) score += 15;
  if (accuracyPercent < LOW_ACCURACY_THRESHOLD && highVolume) score += 10;
  return score;
}

function buildStudyPriorities(ctx: Ctx): StudyPriority[] {
  const eligibleTopics = ctx.topics.filter(t => t.totalQuestionsAttempted >= 2);
  if (eligibleTopics.length) {
    const avgAttempted = eligibleTopics.reduce((s, t) => s + t.totalQuestionsAttempted, 0) / eligibleTopics.length;
    const scored = eligibleTopics
      .map(t => {
        const declining = (t.latestAttemptAccuracy - t.firstAttemptAccuracy) < DECLINE_THRESHOLD;
        const highVolume = t.totalQuestionsAttempted >= avgAttempted;
        return { topic: t, score: priorityScore(t.accuracyPercent, declining, highVolume), reason: priorityReason(t.accuracyPercent, declining, highVolume) };
      })
      .filter((x): x is { topic: TopicStat; score: number; reason: string } => x.reason !== null && x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 5).map((x, i) => ({
      rank: i + 1, name: x.topic.topicName, subjectName: x.topic.subjectName, reason: x.reason,
    }));
  }

  // No chapter-level history yet — same rule, one level up.
  const eligibleSubjects = ctx.subjects.filter(s => s.totalAttempts >= 2);
  if (!eligibleSubjects.length) return [];
  const avgAttempted = eligibleSubjects.reduce((s, x) => s + x.totalQuestionsAttempted, 0) / eligibleSubjects.length;
  const scored = eligibleSubjects
    .map(s => {
      const declining = (s.latestAttemptAccuracy - s.firstAttemptAccuracy) < DECLINE_THRESHOLD;
      const highVolume = s.totalQuestionsAttempted >= avgAttempted;
      return { subject: s, score: priorityScore(s.accuracyPercent, declining, highVolume), reason: priorityReason(s.accuracyPercent, declining, highVolume) };
    })
    .filter((x): x is { subject: SubjectStat; score: number; reason: string } => x.reason !== null && x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((x, i) => ({
    rank: i + 1, name: x.subject.subjectName, subjectName: x.subject.subjectName, reason: x.reason,
  }));
}

// ── Personalized Recommendations ──────────────────────────────────────────
// A small ordered rule list — each rule independently inspects the shared
// Ctx and either abstains (null) or returns a title + evidence-backed
// reason + a severity used only for ranking. Adding a new recommendation
// later means appending one entry here, nothing else changes.

interface RuleResult { title: string; reason: string; severity: number }
interface RecommendationRule { id: string; evaluate: (ctx: Ctx) => RuleResult | null }

const RECOMMENDATION_RULES: RecommendationRule[] = [
  {
    id: 'reduce-skipped',
    evaluate: ctx => {
      const pct = ctx.accuracyInsights.ratios.skippedPercent;
      if (pct <= 15) return null;
      return {
        title: 'Reduce skipped questions.',
        reason: `${pct}% of your questions were skipped during recent practice.`,
        severity: pct,
      };
    },
  },
  {
    id: 'practice-weak-subject',
    evaluate: ctx => {
      const weakest = ctx.subjectInsights?.weakest;
      if (!weakest || weakest.accuracyPercent >= LOW_ACCURACY_THRESHOLD) return null;
      return {
        title: `Practice ${weakest.subjectName} more frequently.`,
        reason: `Your accuracy in ${weakest.subjectName} is ${weakest.accuracyPercent}% across ${weakest.totalAttempts} attempts.`,
        severity: (LOW_ACCURACY_THRESHOLD - weakest.accuracyPercent) * 1.1,
      };
    },
  },
  {
    id: 'review-weak-topic',
    evaluate: ctx => {
      const weakest = ctx.topicInsights?.weakestTopics[0];
      if (!weakest || weakest.accuracyPercent >= 60) return null;
      return {
        title: `Spend more time reviewing ${weakest.topicName}.`,
        reason: `You're averaging ${weakest.accuracyPercent}% accuracy in ${weakest.topicName} across ${weakest.totalQuestionsAttempted} questions.`,
        severity: 60 - weakest.accuracyPercent,
      };
    },
  },
  {
    id: 'slow-down-rushed-type',
    evaluate: ctx => {
      const rushed = ctx.questionTypeInsights?.speedAccuracyByType.find(x => x.quadrant === 'needs-review');
      if (!rushed) return null;
      const label = getQuestionTypeLabel(rushed.type.questionType);
      return {
        title: `Slow down slightly on ${label} questions.`,
        reason: `You average ${fmtSeconds(rushed.type.averageTimePerQuestionSec)} per question but only ${rushed.type.accuracyPercent}% accuracy on ${label} questions.`,
        severity: (70 - rushed.type.accuracyPercent) * 0.8,
      };
    },
  },
  {
    id: 'maintain-strong-subject',
    evaluate: ctx => {
      const strongest = ctx.subjectInsights?.strongest;
      if (!strongest || strongest.accuracyPercent < 85) return null;
      return {
        title: `Continue practicing ${strongest.subjectName} to maintain your high accuracy.`,
        reason: `You're averaging ${strongest.accuracyPercent}% accuracy in ${strongest.subjectName}.`,
        severity: 20,
      };
    },
  },
  {
    id: 'balance-least-practiced',
    evaluate: ctx => {
      const { subjects, subjectInsights } = ctx;
      if (!subjectInsights || subjects.length < 2) return null;
      const least = subjectInsights.leastPracticed;
      // Already covered by practice-weak-subject when it's the same subject
      // — avoid two rules telling the student to practice the same thing.
      if (least.subjectId === subjectInsights.weakest.subjectId) return null;
      const avg = subjects.reduce((s, x) => s + x.totalAttempts, 0) / subjects.length;
      if (least.totalAttempts >= avg * 0.6) return null;
      return {
        title: `Practice ${least.subjectName} more often to build balanced preparation.`,
        reason: `You've practiced ${least.subjectName} only ${least.totalAttempts} time(s), versus an average of ${Math.round(avg)} across your other subjects.`,
        severity: ((avg - least.totalAttempts) / Math.max(1, avg)) * 60,
      };
    },
  },
  {
    id: 'improve-consistency',
    evaluate: ctx => {
      const c = ctx.accuracyInsights.consistency;
      if (!c || !['Inconsistent', 'Highly Inconsistent'].includes(c.label)) return null;
      return {
        title: 'Work on keeping your accuracy consistent between sessions.',
        reason: c.explanation,
        severity: c.stdDeviation,
      };
    },
  },
];

function buildRecommendations(ctx: Ctx): Recommendation[] {
  const applicable = RECOMMENDATION_RULES
    .map(rule => ({ id: rule.id, result: rule.evaluate(ctx) }))
    .filter((x): x is { id: string; result: RuleResult } => x.result !== null)
    .sort((a, b) => b.result.severity - a.result.severity)
    .slice(0, 5);

  return applicable.map((x, i) => ({ id: x.id, rank: i + 1, title: x.result.title, reason: x.result.reason }));
}

// ── Learning Habits ────────────────────────────────────────────────────────
// Only ever asserts a habit the data actually backs — no line is emitted
// "by default." One example from the spec ("You perform better in Mixed
// Subjects Practice than in single-subject practice") is deliberately
// omitted: Features 1-7 never computed a mixed-vs-single accuracy split, and
// adding one would mean a new query, which this feature is asked to avoid.

function buildLearningHabits(ctx: Ctx): string[] {
  const { overview, accuracyInsights, speedInsights, questionTypeInsights } = ctx;
  const habits: string[] = [];

  if (overview.totalAttempts >= 5) {
    const spanDays = (new Date(overview.lastPracticeDate).getTime() - new Date(overview.firstPracticeDate).getTime()) / 86_400_000;
    const avgGapDays = spanDays / Math.max(1, overview.totalAttempts - 1);
    if (avgGapDays <= 3) habits.push('You practice consistently.');
  }

  if (accuracyInsights.ratios.skippedPercent > 20) {
    habits.push('You tend to skip many questions.');
  }

  const rushedType = questionTypeInsights?.speedAccuracyByType.find(x => x.quadrant === 'needs-review');
  if (rushedType) {
    habits.push(`You rush through ${getQuestionTypeLabel(rushedType.type.questionType)} questions.`);
  }

  const slowSubject = speedInsights?.efficiencyBySubject.find(
    e => ['Slow', 'Very Slow'].includes(getSpeedBand(e.subject.averageTimePerQuestionSec).label),
  );
  if (slowSubject) {
    habits.push(`You spend too much time on ${slowSubject.subject.subjectName}.`);
  }

  if (accuracyInsights.insightLines.includes('Your accuracy has steadily improved over recent attempts.')) {
    habits.push('You are improving steadily.');
  }

  if (accuracyInsights.consistency && ['Inconsistent', 'Highly Inconsistent'].includes(accuracyInsights.consistency.label)) {
    habits.push('Your performance is inconsistent.');
  }

  return habits;
}

// ── Positive Reinforcement ─────────────────────────────────────────────────
// Always returns something — first genuine highlight found, in priority
// order; an honest, encouraging fallback when nothing stands out yet.

function buildPositiveReinforcement(ctx: Ctx): PositiveReinforcement {
  const { subjectInsights, accuracyInsights, speedInsights, questionTypeInsights } = ctx;

  if (subjectInsights?.biggestImprovement) {
    const { subject, improvementPercent } = subjectInsights.biggestImprovement;
    return {
      title: `Great improvement in ${subject.subjectName}!`,
      detail: `You've gone from ${subject.firstAttemptAccuracy}% to ${subject.latestAttemptAccuracy}% accuracy — up ${improvementPercent} points.`,
    };
  }

  if (accuracyInsights.consistency?.label === 'Highly Consistent') {
    return {
      title: 'Excellent consistency over recent quizzes!',
      detail: `Your accuracy varies by only about ${accuracyInsights.consistency.stdDeviation} points between attempts.`,
    };
  }

  if (subjectInsights && subjectInsights.strongest.accuracyPercent >= 85) {
    return {
      title: `Your ${subjectInsights.strongest.subjectName} accuracy is among your strongest!`,
      detail: `You're averaging ${subjectInsights.strongest.accuracyPercent}% accuracy in ${subjectInsights.strongest.subjectName}.`,
    };
  }

  if (speedInsights?.speedImprovement) {
    return {
      title: `You're getting faster in ${speedInsights.speedImprovement.subject.subjectName}!`,
      detail: `You've cut your time per question by ${fmtSeconds(speedInsights.speedImprovement.improvementSec)}.`,
    };
  }

  if (questionTypeInsights && questionTypeInsights.bestType.accuracyPercent >= 85) {
    const label = getQuestionTypeLabel(questionTypeInsights.bestType.questionType);
    return {
      title: `Your ${label} accuracy is among your strongest!`,
      detail: `You're solving ${label} questions at ${questionTypeInsights.bestType.accuracyPercent}% accuracy.`,
    };
  }

  return {
    title: 'Keep up the momentum!',
    detail: 'Completing more practice sessions will unlock deeper insights into your progress.',
  };
}

// ── Risk Alerts ─────────────────────────────────────────────────────────────
// Every threshold below is deliberately stricter than the equivalent
// Recommendation-rule threshold — an alert is a louder signal than a
// recommendation, reserved for genuinely concerning patterns, not routine
// coaching.

function buildRiskAlerts(ctx: Ctx): RiskAlert[] {
  const { overview, accuracyInsights, subjects } = ctx;
  const alerts: RiskAlert[] = [];

  if (overview.accuracyPercent < 40) {
    alerts.push({
      id: 'low-accuracy',
      severity: 'high',
      title: 'Extremely low accuracy',
      message: `Your overall accuracy is ${overview.accuracyPercent}%. Revisit fundamentals before attempting more practice quizzes.`,
    });
  }

  if (accuracyInsights.ratios.skippedPercent > 30) {
    alerts.push({
      id: 'high-skip-rate',
      severity: 'high',
      title: 'High skipped-question rate',
      message: `You're skipping ${accuracyInsights.ratios.skippedPercent}% of questions — this is significantly lowering your potential score.`,
    });
  }

  if (accuracyInsights.trendDirection === 'declined' && Math.abs(accuracyInsights.trendDeltaPercent) > 10) {
    alerts.push({
      id: 'declining-performance',
      severity: 'medium',
      title: 'Declining performance',
      message: `Your accuracy has dropped ${Math.abs(accuracyInsights.trendDeltaPercent)} points compared to your first attempts.`,
    });
  }

  const daysSincePractice = (Date.now() - new Date(overview.lastPracticeDate).getTime()) / 86_400_000;
  if (daysSincePractice > 14) {
    alerts.push({
      id: 'practice-gap',
      severity: 'medium',
      title: 'Long gap since last practice',
      message: `It's been ${Math.floor(daysSincePractice)} days since your last practice session — consistent practice helps retention.`,
    });
  }

  if (subjects.length >= 2) {
    const totalQ = subjects.reduce((s, x) => s + x.totalQuestionsAttempted, 0);
    const dominant = subjects.reduce((a, b) => (b.totalQuestionsAttempted > a.totalQuestionsAttempted ? b : a));
    const share = totalQ > 0 ? (dominant.totalQuestionsAttempted / totalQ) * 100 : 0;
    if (share > 70) {
      alerts.push({
        id: 'subject-imbalance',
        severity: 'medium',
        title: 'One subject dominates your practice',
        message: `${dominant.subjectName} accounts for ${Math.round(share)}% of your practice — try to diversify across more subjects.`,
      });
    }
  }

  return alerts;
}

// ── Weekly Goals ─────────────────────────────────────────────────────────────
// Personalized around the student's own recent pace/accuracy rather than
// fixed numbers, so each goal is a realistic stretch, not an arbitrary target.

function buildWeeklyGoals(ctx: Ctx): WeeklyGoal[] {
  const { overview, accuracyInsights, subjectInsights, subjects } = ctx;
  const goals: WeeklyGoal[] = [];

  const spanDays = Math.max(1, (new Date(overview.lastPracticeDate).getTime() - new Date(overview.firstPracticeDate).getTime()) / 86_400_000);
  const spanWeeks = Math.max(1, spanDays / 7);
  const attemptsPerWeek = overview.totalAttempts / spanWeeks;
  const goalCount = Math.min(7, Math.max(3, Math.round(attemptsPerWeek) + 1));
  goals.push({
    id: 'weekly-attempts',
    title: `Complete ${goalCount} Practice Olympiad quizzes this week.`,
    description: `You're currently averaging about ${Math.max(1, Math.round(attemptsPerWeek))} quiz(zes) a week.`,
  });

  if (accuracyInsights.ratios.skippedPercent > 10) {
    const target = Math.max(0, Math.round(accuracyInsights.ratios.skippedPercent * 0.8));
    goals.push({
      id: 'reduce-skips',
      title: 'Reduce skipped questions by 20%.',
      description: `You currently skip ${accuracyInsights.ratios.skippedPercent}% of questions — aim for about ${target}% this week.`,
    });
  }

  if (subjectInsights && subjectInsights.weakest.accuracyPercent < LOW_ACCURACY_THRESHOLD) {
    goals.push({
      id: 'subject-accuracy-target',
      title: `Increase ${subjectInsights.weakest.subjectName} accuracy above 70%.`,
      description: `You're currently at ${subjectInsights.weakest.accuracyPercent}% in ${subjectInsights.weakest.subjectName}.`,
    });
  }

  if (subjects.length <= 2) {
    goals.push({
      id: 'diversify-subjects',
      title: 'Practice one additional subject this week.',
      description: 'Broadening your subject coverage builds more balanced preparation.',
    });
  }

  return goals.slice(0, 4);
}

// ── Overall Learning Summary ─────────────────────────────────────────────────
// 3 unconditional sentences (always true of any student with data) plus up
// to 3 conditional ones, capped at 6 — matching the "3-6 sentences" ask
// regardless of how much or little stands out in a given student's data.

function buildSummary(ctx: Ctx, studyPriorities: StudyPriority[]): string[] {
  const { overview, subjectInsights, speedInsights, accuracyInsights } = ctx;
  const lines: string[] = [];

  const subjectWord = overview.totalSubjectsPracticed === 1 ? 'subject' : 'subjects';
  lines.push(`You have completed ${overview.totalAttempts} Practice Olympiad ${overview.totalAttempts === 1 ? 'quiz' : 'quizzes'} across ${overview.totalSubjectsPracticed} ${subjectWord}.`);
  lines.push(`You've spent a total of ${fmtDuration(overview.totalPracticeTimeSec)} practicing so far.`);
  lines.push(`You've attempted ${overview.totalQuestionsAttempted} questions overall, maintaining ${overview.accuracyPercent}% accuracy.`);

  if (subjectInsights) {
    const weakEnough = subjectInsights.weakest.subjectId !== subjectInsights.strongest.subjectId && subjectInsights.weakest.accuracyPercent < LOW_ACCURACY_THRESHOLD;
    lines.push(weakEnough
      ? `Your strongest area is ${subjectInsights.strongest.subjectName}, while ${subjectInsights.weakest.subjectName} still needs attention.`
      : `Your strongest area is ${subjectInsights.strongest.subjectName}, where you're performing at ${subjectInsights.strongest.accuracyPercent}% accuracy.`);
  }

  if (speedInsights?.speedImprovement) {
    lines.push(`Your speed has improved considerably in ${speedInsights.speedImprovement.subject.subjectName}.`);
  } else {
    const band = getSpeedBand(overview.averageTimePerQuestionSec);
    if (band.label === 'Slow' || band.label === 'Very Slow') {
      lines.push(`Your pace is a little slow right now, averaging ${fmtSeconds(overview.averageTimePerQuestionSec)} per question.`);
    }
  }

  if (accuracyInsights.ratios.skippedPercent > 15) {
    lines.push(`Skipped questions continue to affect your overall score — ${accuracyInsights.ratios.skippedPercent}% of your questions go unanswered.`);
  }

  if (studyPriorities.length) {
    const names = studyPriorities.slice(0, 2).map(p => p.name);
    lines.push(`Focusing on ${names.join(' and ')} over the next few practice sessions should improve your overall accuracy.`);
  } else if (accuracyInsights.trendDirection === 'improved') {
    lines.push(`Your accuracy has climbed ${accuracyInsights.trendDeltaPercent} points since your first attempt — keep it up.`);
  }

  return lines.slice(0, 6);
}

export function buildLearningInsights(
  overview: PracticeOverviewData,
  subjects: SubjectStat[],
  questionTypes: QuestionTypeStat[],
  topics: TopicStat[],
): LearningInsights | null {
  if (overview.totalAttempts < MIN_ATTEMPTS_FOR_INSIGHTS) return null;

  const ctx: Ctx = {
    overview, subjects, questionTypes, topics,
    subjectInsights: deriveInsights(subjects),
    speedInsights: deriveSpeedInsights(overview, subjects),
    questionTypeInsights: deriveQuestionTypeInsights(questionTypes),
    accuracyInsights: deriveAccuracyInsights(overview),
    topicInsights: deriveTopicInsights(topics),
  };

  const studyPriorities = buildStudyPriorities(ctx);

  return {
    summaryLines: buildSummary(ctx, studyPriorities),
    recommendations: buildRecommendations(ctx),
    studyPriorities,
    learningHabits: buildLearningHabits(ctx),
    positive: buildPositiveReinforcement(ctx),
    riskAlerts: buildRiskAlerts(ctx),
    weeklyGoals: buildWeeklyGoals(ctx),
    confidence: computeConfidence(overview, subjects, questionTypes),
    derived: ctx,
  };
}
