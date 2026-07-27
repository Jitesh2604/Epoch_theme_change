import type { PracticeOverviewData } from '../hooks/useStudentAnalytics';
import {
  type LearningInsights, type DerivedAnalytics,
  MIN_ATTEMPTS_FOR_INSIGHTS, LOW_ACCURACY_THRESHOLD,
} from './learningInsightsEngine';
import { getQuestionTypeLabel } from './questionTypeLabel';
import { fmtSeconds } from './formatters';

/**
 * Feature 9: Personalized Study Plan & Daily Learning Tracker.
 *
 * Builds directly on Feature 8's output (`LearningInsights.derived` — the
 * same StrengthWeaknessInsights/SpeedTimeInsights/QuestionTypeInsights/
 * AccuracyInsights/TopicInsights Features 3-7 already computed). No new
 * fetch, no recomputation of anything those features derived — this file
 * only adds the "turn insight into an actionable plan" layer on top:
 * today's tasks, a 7-day subject rotation, streaks, and badges.
 *
 * Streaks are grounded in real practice-attempt dates (from Feature 1/6's
 * `accuracyTrend.history`, already fetched) unioned with the days the
 * student has locally marked their plan complete (see
 * useStudyPlanProgress.ts) — so a streak always reflects genuine engagement,
 * real or plan-completion, never a fabricated number.
 */

export const MIN_ATTEMPTS_FOR_STUDY_PLAN = MIN_ATTEMPTS_FOR_INSIGHTS;

// ── Date helpers ─────────────────────────────────────────────────────────
// All date-key arithmetic stays in local calendar time throughout (never
// mixes in `new Date(isoString)` UTC parsing for the key itself), so a
// student's "today" always matches their own clock.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local-calendar-day set of every real practice attempt, from Feature 1/6's
 *  already-fetched accuracyTrend.history — zero new query. */
export function practiceDatesFromOverview(overview: PracticeOverviewData): Set<string> {
  return new Set(overview.accuracyTrend.history.map(h => toDateKey(new Date(h.date))));
}

// ── Today's Study Tasks ────────────────────────────────────────────────────
// Same ordered-rule-list shape as Feature 8's RECOMMENDATION_RULES — each
// rule independently inspects the shared derived analytics and either
// abstains (null) or proposes a task with a priority used only for ranking.
// Adding a new task type later means appending one rule here.

export interface StudyTask {
  id: string;
  title: string;
  reason: string;
  estimatedMinutes: number;
  estimatedQuestions: number;
}

interface TaskRuleResult { title: string; reason: string; estimatedMinutes: number; estimatedQuestions: number; priority: number }
interface TaskRule { id: string; evaluate: (d: DerivedAnalytics) => TaskRuleResult | null }

const TASK_RULES: TaskRule[] = [
  {
    id: 'weak-subject',
    evaluate: d => {
      const weakest = d.subjectInsights?.weakest;
      if (!weakest || weakest.accuracyPercent >= LOW_ACCURACY_THRESHOLD) return null;
      return {
        title: `Practice ${weakest.subjectName} fundamentals`,
        reason: `Your accuracy in ${weakest.subjectName} is ${weakest.accuracyPercent}% across ${weakest.totalAttempts} attempts.`,
        estimatedMinutes: 15, estimatedQuestions: 10,
        priority: (LOW_ACCURACY_THRESHOLD - weakest.accuracyPercent) * 1.1,
      };
    },
  },
  {
    id: 'weak-topic',
    evaluate: d => {
      const weakest = d.topicInsights?.weakestTopics[0];
      if (!weakest || weakest.accuracyPercent >= 60) return null;
      return {
        title: `Review ${weakest.topicName}`,
        reason: `You're averaging ${weakest.accuracyPercent}% accuracy in ${weakest.topicName} across ${weakest.totalQuestionsAttempted} questions.`,
        estimatedMinutes: 20, estimatedQuestions: 8,
        priority: 60 - weakest.accuracyPercent,
      };
    },
  },
  {
    id: 'rushed-type-drill',
    evaluate: d => {
      const rushed = d.questionTypeInsights?.speedAccuracyByType.find(x => x.quadrant === 'needs-review');
      if (!rushed) return null;
      const label = getQuestionTypeLabel(rushed.type.questionType);
      return {
        title: `Slow down on ${label} questions`,
        reason: `You average ${fmtSeconds(rushed.type.averageTimePerQuestionSec)} per question but only ${rushed.type.accuracyPercent}% accuracy on ${label} questions.`,
        estimatedMinutes: 10, estimatedQuestions: 6,
        priority: (70 - rushed.type.accuracyPercent) * 0.8,
      };
    },
  },
  {
    id: 'skip-reduction',
    evaluate: d => {
      const pct = d.accuracyInsights.ratios.skippedPercent;
      if (pct <= 15) return null;
      return {
        title: 'Complete a quiz without skipping any question',
        reason: `${pct}% of your questions were skipped during recent practice.`,
        estimatedMinutes: 15, estimatedQuestions: 10,
        priority: pct,
      };
    },
  },
  {
    id: 'consistency-mixed',
    evaluate: d => {
      const c = d.accuracyInsights.consistency;
      if (!c || !['Inconsistent', 'Highly Inconsistent'].includes(c.label)) return null;
      return {
        title: 'Take a Mixed Subjects Practice quiz',
        reason: `Your accuracy varies by about ${c.stdDeviation} points across your recent attempts — mixed practice builds steadier performance.`,
        estimatedMinutes: 20, estimatedQuestions: 15,
        priority: c.stdDeviation,
      };
    },
  },
  {
    id: 'maintain-strength',
    evaluate: d => {
      const strongest = d.subjectInsights?.strongest;
      if (!strongest) return null;
      return {
        title: `Keep sharp in ${strongest.subjectName}`,
        reason: `You're averaging ${strongest.accuracyPercent}% accuracy in ${strongest.subjectName} — a short session keeps it strong.`,
        estimatedMinutes: 10, estimatedQuestions: 8,
        priority: 12,
      };
    },
  },
  {
    id: 'review-answers',
    evaluate: d => {
      if (d.overview.totalWrong > 0) {
        return {
          title: 'Review your recent wrong answers',
          reason: `You've answered ${d.overview.totalWrong} questions incorrectly so far — revisiting them cements the correct approach.`,
          estimatedMinutes: 10, estimatedQuestions: Math.min(10, d.overview.totalWrong),
          priority: 8,
        };
      }
      return {
        title: 'Do a quick review of your strongest topics',
        reason: `You haven't gotten a question wrong yet across ${d.overview.totalAttempts} attempts — reinforce that strong start.`,
        estimatedMinutes: 8, estimatedQuestions: 6,
        priority: 4,
      };
    },
  },
  {
    id: 'general-practice',
    evaluate: d => ({
      title: 'Complete one more Practice Olympiad quiz today',
      reason: `You're averaging ${d.overview.accuracyPercent}% accuracy across ${d.overview.totalAttempts} attempts — regular reps keep your progress moving.`,
      estimatedMinutes: 15, estimatedQuestions: 10,
      priority: 5,
    }),
  },
];

function buildTasks(d: DerivedAnalytics): StudyTask[] {
  const applicable = TASK_RULES
    .map(rule => ({ id: rule.id, result: rule.evaluate(d) }))
    .filter((x): x is { id: string; result: TaskRuleResult } => x.result !== null)
    .sort((a, b) => b.result.priority - a.result.priority)
    .slice(0, 5);

  return applicable.map(x => ({
    id: x.id, title: x.result.title, reason: x.result.reason,
    estimatedMinutes: x.result.estimatedMinutes, estimatedQuestions: x.result.estimatedQuestions,
  }));
}

// ── Today's Goals ─────────────────────────────────────────────────────────
// Short aspirational targets for the day — distinct from the checkable
// tasks above, but derived from the exact same analytics.

function buildTodaysGoals(d: DerivedAnalytics, tasks: StudyTask[]): string[] {
  const totalQuestions = tasks.reduce((s, t) => s + t.estimatedQuestions, 0);
  const goals: string[] = [
    `Solve at least ${totalQuestions} practice questions today.`,
    'Keep your streak alive by practicing today.',
  ];

  if (d.accuracyInsights.ratios.skippedPercent > 15) {
    goals.push('Attempt every question — avoid skipping.');
  }
  if (d.subjectInsights && d.subjectInsights.weakest.accuracyPercent < LOW_ACCURACY_THRESHOLD) {
    goals.push(`Push your ${d.subjectInsights.weakest.subjectName} accuracy a little higher today.`);
  }
  if (d.questionTypeInsights?.speedAccuracyByType.some(x => x.quadrant === 'needs-review')) {
    goals.push('Slow down and double-check answers before submitting.');
  }

  goals.push("Complete today's full study plan.");
  return goals.slice(0, 5);
}

// ── Weekly Study Plan ────────────────────────────────────────────────────
// A 7-day subject rotation: 6 focused days weighted toward weaker subjects
// (roughly 2 weak days for every 1 strong day), plus a lighter Mixed
// Subjects review day to close the week. Deterministic, not random, so the
// same analytics always produce the same week.

export interface WeeklyPlanDay {
  dayLabel: string;
  date: string;
  isToday: boolean;
  focus: string;
  reason: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildWeeklyPlan(d: DerivedAnalytics, today: Date): WeeklyPlanDay[] {
  const { subjects } = d;
  const days: WeeklyPlanDay[] = [];

  if (!subjects.length) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      days.push({
        dayLabel: WEEKDAY_LABELS[date.getDay()], date: toDateKey(date), isToday: i === 0,
        focus: 'Mixed Subjects Practice',
        reason: 'Build a broad practice history to unlock a personalized weekly plan.',
      });
    }
    return days;
  }

  const sortedWeak = [...subjects].sort((a, b) => a.accuracyPercent - b.accuracyPercent);
  const weakHalf = sortedWeak.slice(0, Math.max(1, Math.ceil(sortedWeak.length / 2)));
  const strongHalf = sortedWeak.slice(-Math.max(1, Math.floor(sortedWeak.length / 2)));

  for (let i = 0; i < 6; i++) {
    // 2 of every 3 days pull from the weaker half of the subject list, the
    // 3rd from the stronger half — weak subjects get more attention while
    // strengths still get a maintenance day.
    const useWeak = i % 3 !== 2 || sortedWeak.length === 1;
    const pool = useWeak ? weakHalf : strongHalf;
    const subject = pool[i % pool.length];
    const date = addDays(today, i);
    const isWeakPick = subject.accuracyPercent < LOW_ACCURACY_THRESHOLD;
    days.push({
      dayLabel: WEEKDAY_LABELS[date.getDay()], date: toDateKey(date), isToday: i === 0,
      focus: subject.subjectName,
      reason: isWeakPick
        ? `Lower accuracy (${subject.accuracyPercent}%) — needs focused practice.`
        : `Maintain your strong performance (${subject.accuracyPercent}% accuracy).`,
    });
  }

  const restDate = addDays(today, 6);
  days.push({
    dayLabel: WEEKDAY_LABELS[restDate.getDay()], date: toDateKey(restDate), isToday: false,
    focus: 'Mixed Subjects Practice',
    reason: 'Consolidate the week with a light mixed-subject review.',
  });

  return days;
}

// ── Study Streaks ───────────────────────────────────────────────────────
// engagedDates = real practice-attempt days ∪ days the student locally
// marked their plan complete (see useStudyPlanProgress.ts). A day counts
// once either way — no double-counting, no fabricated engagement.

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  practicedToday: boolean;
}

export function computeStreak(practiceDates: Set<string>, locallyEngagedDates: Set<string>, today: Date): StreakInfo {
  const engaged = new Set([...practiceDates, ...locallyEngagedDates]);
  const todayKey = toDateKey(today);
  const practicedToday = engaged.has(todayKey);

  let currentStreak = 0;
  let cursor = practicedToday ? today : addDays(today, -1);
  while (engaged.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const sortedKeys = [...engaged].sort();
  let bestStreak = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of sortedKeys) {
    const isConsecutive = prevKey !== null && toDateKey(addDays(parseDateKey(prevKey), 1)) === key;
    run = isConsecutive ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prevKey = key;
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak, practicedToday };
}

// ── Achievement Badges ────────────────────────────────────────────────────
// Every condition is a live read of real analytics/streak state — nothing
// is stored as "unlocked" separately, so a badge can never go stale or
// desync from the data it represents.

export interface Badge {
  id: string;
  label: string;
  description: string;
  unlocked: boolean;
}

function buildBadges(d: DerivedAnalytics, streak: StreakInfo): Badge[] {
  return [
    {
      id: 'first-practice', label: 'First Practice',
      description: 'Complete your first Practice Olympiad quiz.',
      unlocked: d.overview.totalAttempts >= 1,
    },
    {
      id: 'five-day-streak', label: '5-Day Streak',
      description: 'Practice 5 days in a row.',
      unlocked: streak.bestStreak >= 5,
    },
    {
      id: 'accuracy-master', label: 'Accuracy Master',
      description: 'Hit 90% accuracy in a single attempt.',
      unlocked: d.overview.accuracyTrend.bestAccuracyAchieved >= 90,
    },
    {
      id: 'consistent-learner', label: 'Consistent Learner',
      description: 'Keep your accuracy highly consistent across attempts.',
      unlocked: d.accuracyInsights.consistency?.label === 'Highly Consistent',
    },
    {
      id: 'speed-improver', label: 'Speed Improver',
      description: 'Cut your time-per-question in a subject you practice repeatedly.',
      unlocked: !!d.speedInsights?.speedImprovement,
    },
  ];
}

// ── Entry point ─────────────────────────────────────────────────────────

export interface StudyPlan {
  tasks: StudyTask[];
  estimatedMinutesTotal: number;
  estimatedQuestionsTotal: number;
  todaysGoals: string[];
  weeklyPlan: WeeklyPlanDay[];
  streak: StreakInfo;
  badges: Badge[];
}

export function buildStudyPlan(
  insights: LearningInsights,
  locallyEngagedDates: Set<string>,
  today: Date = new Date(),
): StudyPlan | null {
  const d = insights.derived;
  if (d.overview.totalAttempts < MIN_ATTEMPTS_FOR_STUDY_PLAN) return null;

  const tasks = buildTasks(d);
  const practiceDates = practiceDatesFromOverview(d.overview);
  const streak = computeStreak(practiceDates, locallyEngagedDates, today);

  return {
    tasks,
    estimatedMinutesTotal: tasks.reduce((s, t) => s + t.estimatedMinutes, 0),
    estimatedQuestionsTotal: tasks.reduce((s, t) => s + t.estimatedQuestions, 0),
    todaysGoals: buildTodaysGoals(d, tasks),
    weeklyPlan: buildWeeklyPlan(d, today),
    streak,
    badges: buildBadges(d, streak),
  };
}
