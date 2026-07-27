import type { PracticeOverviewData } from '../hooks/useStudentAnalytics';
import type { OlympiadAttemptSummary } from '../hooks/usePracticeQuiz';
import type { LearningInsights } from './learningInsightsEngine';
import { toDateKey, practiceDatesFromOverview, type StreakInfo } from './studyPlanEngine';

/**
 * Feature 15: Practice Streaks & Consistency Dashboard.
 *
 * Pure derivation over data Features 1, 8, 9, 12 already fetch/compute —
 * PracticeOverviewData (Feature 1), LearningInsights (Feature 8),
 * StreakInfo (Feature 9's computeStreak, reused as-is — this file never
 * recomputes current/best streak, only reads them), and
 * OlympiadAttemptSummary[] (Feature 12's attempt history, already lifted to
 * AnalyticsPage.tsx). No new backend query anywhere in this file.
 *
 * The only genuinely new pure-client computations are calendar/weekly-
 * activity bucketing, practice-frequency averages, the Consistency Score,
 * and the rule-based Consistency Insights — everything else (streak
 * numbers, AI advice) is a direct read of what Features 8/9 already built.
 */

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Streak date-range helpers (calendar highlighting only) ───────────────
// Companion to Feature 9's computeStreak — that function already owns the
// current/best streak *counts*; these two helpers derive which calendar
// DATES those counts correspond to, using the identical "consecutive local
// calendar day" rule, purely so the calendar can highlight the right cells.
// They never recompute the counts themselves.

interface DateRange { startKey: string; endKey: string }

function currentStreakRange(streak: StreakInfo, today: Date): DateRange | null {
  if (streak.currentStreak === 0) return null;
  const anchor = streak.practicedToday ? today : addDays(today, -1);
  const start = addDays(anchor, -(streak.currentStreak - 1));
  return { startKey: toDateKey(start), endKey: toDateKey(anchor) };
}

function longestStreakRange(practiceDates: Set<string>): DateRange | null {
  const sorted = [...practiceDates].sort();
  if (!sorted.length) return null;

  let bestLen = 1, bestStart = sorted[0], bestEnd = sorted[0];
  let runLen = 1, runStart = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [py, pm, pd] = sorted[i - 1].split('-').map(Number);
    const prevPlusOne = toDateKey(addDays(new Date(py, pm - 1, pd), 1));
    const isConsecutive = prevPlusOne === sorted[i];
    runLen = isConsecutive ? runLen + 1 : 1;
    if (!isConsecutive) runStart = sorted[i];
    if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; bestEnd = sorted[i]; }
  }
  return { startKey: bestStart, endKey: bestEnd };
}

function inRange(key: string, range: DateRange | null): boolean {
  return !!range && key >= range.startKey && key <= range.endKey;
}

// ── Practice Calendar ─────────────────────────────────────────────────────

export interface CalendarDay {
  dateKey: string;
  dayOfMonth: number;
  sessionsCount: number;
  isToday: boolean;
  isFuture: boolean;
  isInCurrentStreak: boolean;
  isInLongestStreak: boolean;
}

export interface PracticeCalendar {
  monthLabel: string;
  leadingBlanks: number;
  days: CalendarDay[];
}

/** Always the current calendar month — generated entirely from
 *  overview.accuracyTrend.history (Feature 1/6, already fetched), grouped
 *  by local calendar day. No new query. */
export function buildPracticeCalendar(
  overview: PracticeOverviewData,
  streak: StreakInfo,
  today: Date = new Date(),
): PracticeCalendar {
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const todayStart = startOfDay(today);
  const todayKey = toDateKey(today);

  const sessionCounts = new Map<string, number>();
  for (const h of overview.accuracyTrend.history) {
    const key = toDateKey(new Date(h.date));
    sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
  }

  const practiceDates = practiceDatesFromOverview(overview);
  const currentRange = currentStreakRange(streak, today);
  const longestRange = longestStreakRange(practiceDates);

  const days: CalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = toDateKey(date);
    days.push({
      dateKey: key,
      dayOfMonth: d,
      sessionsCount: sessionCounts.get(key) ?? 0,
      isToday: key === todayKey,
      isFuture: startOfDay(date).getTime() > todayStart.getTime(),
      isInCurrentStreak: inRange(key, currentRange),
      isInLongestStreak: inRange(key, longestRange),
    });
  }

  return {
    monthLabel: today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    leadingBlanks,
    days,
  };
}

// ── Monthly Consistency ───────────────────────────────────────────────────
// Documented thresholds — a distinct concept from Feature 6's accuracy
// "Consistency Rating" (std-deviation of per-attempt accuracy); this one
// measures days-practiced-vs-elapsed-days-this-month.
export const MONTHLY_CONSISTENCY_BANDS = [
  { min: 90, label: 'Excellent' },
  { min: 70, label: 'Good' },
  { min: 50, label: 'Average' },
  { min: 0, label: 'Needs Improvement' },
] as const;

export interface MonthlyConsistency {
  daysPracticed: number;
  daysElapsed: number;
  daysMissed: number;
  percentage: number;
  band: string;
}

export function computeMonthlyConsistency(calendar: PracticeCalendar): MonthlyConsistency {
  const elapsed = calendar.days.filter(d => !d.isFuture);
  const daysPracticed = elapsed.filter(d => d.sessionsCount > 0).length;
  const daysElapsed = elapsed.length;
  const daysMissed = daysElapsed - daysPracticed;
  const percentage = daysElapsed > 0 ? Math.round((daysPracticed / daysElapsed) * 100) : 0;
  const band = MONTHLY_CONSISTENCY_BANDS.find(b => percentage >= b.min)!.label;
  return { daysPracticed, daysElapsed, daysMissed, percentage, band };
}

// ── Weekly Activity (last 7 days) ─────────────────────────────────────────
// Built from OlympiadAttemptSummary[] (Feature 12's already-lifted attempt
// history) — the one dataset with per-attempt question count + time, which
// accuracyTrend.history doesn't carry.

export interface WeeklyActivityDay {
  dateKey: string;
  dayLabel: string;
  practiced: boolean;
  sessionsCount: number;
  questionsSolved: number;
  timeStudiedSec: number;
}

export function buildWeeklyActivity(attempts: OlympiadAttemptSummary[], today: Date = new Date()): WeeklyActivityDay[] {
  const byDay = new Map<string, { sessions: number; questions: number; timeSec: number }>();
  for (const a of attempts) {
    if (a.status !== 'SUBMITTED') continue;
    const key = toDateKey(new Date(a.startTime));
    const entry = byDay.get(key) ?? { sessions: 0, questions: 0, timeSec: 0 };
    entry.sessions += 1;
    entry.questions += a.questionCount;
    entry.timeSec += a.timeTakenSec;
    byDay.set(key, entry);
  }

  const days: WeeklyActivityDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const key = toDateKey(date);
    const entry = byDay.get(key);
    days.push({
      dateKey: key,
      dayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
      practiced: !!entry,
      sessionsCount: entry?.sessions ?? 0,
      questionsSolved: entry?.questions ?? 0,
      timeStudiedSec: entry?.timeSec ?? 0,
    });
  }
  return days;
}

// ── Practice Frequency ────────────────────────────────────────────────────

export interface PracticeFrequency {
  avgSessionsPerWeek: number;
  avgQuestionsPerDay: number;
  avgStudyTimePerSessionSec: number;
}

export function computePracticeFrequency(overview: PracticeOverviewData, practiceDates: Set<string>): PracticeFrequency {
  const firstMs = new Date(overview.firstPracticeDate).getTime();
  const lastMs = new Date(overview.lastPracticeDate).getTime();
  const daysElapsed = Math.max(1, Math.round((lastMs - firstMs) / 86_400_000) + 1);
  const weeksElapsed = Math.max(1, daysElapsed / 7);

  return {
    avgSessionsPerWeek: round1(overview.totalAttempts / weeksElapsed),
    avgQuestionsPerDay: round1(overview.totalQuestionsAttempted / Math.max(1, practiceDates.size)),
    avgStudyTimePerSessionSec: Math.round(overview.totalPracticeTimeSec / overview.totalAttempts),
  };
}

// ── Streak Milestones ─────────────────────────────────────────────────────
export const STREAK_MILESTONE_DAYS = [7, 14, 30, 60, 100] as const;

export interface StreakMilestone {
  days: number;
  current: number;
  percent: number;
  achieved: boolean;
}

export function buildStreakMilestones(streak: StreakInfo): StreakMilestone[] {
  return STREAK_MILESTONE_DAYS.map(days => {
    const current = Math.min(streak.currentStreak, days);
    return { days, current, percent: Math.round((current / days) * 100), achieved: streak.currentStreak >= days };
  });
}

export function nextStreakMilestone(streak: StreakInfo): { days: number; remaining: number } | null {
  const next = STREAK_MILESTONE_DAYS.find(d => d > streak.currentStreak);
  return next ? { days: next, remaining: next - streak.currentStreak } : null;
}

// ── Consistency Score ─────────────────────────────────────────────────────
// Weighting documented here, nowhere else — mirrors CONFIDENCE_WEIGHTS
// (confidenceScore.ts) and PRIORITY_WEIGHTS (revisionConfig.ts)'s pattern.
// Each factor reuses an already-computed value (streak count, frequency,
// monthly %, weekly activity) — nothing here is recomputed from raw data a
// second time.
export const CONSISTENCY_SCORE_WEIGHTS = {
  currentStreak: 0.30,
  practiceFrequency: 0.25,
  missedDays: 0.25,
  weeklyConsistency: 0.20,
} as const;

const CONSISTENCY_WEIGHT_SUM = Object.values(CONSISTENCY_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
if (Math.round(CONSISTENCY_WEIGHT_SUM * 100) !== 100) {
  throw new Error(`CONSISTENCY_SCORE_WEIGHTS must sum to 1.0, got ${CONSISTENCY_WEIGHT_SUM}`);
}

export const CONSISTENCY_SCORE_BANDS = [
  { min: 90, label: 'Exceptional' },
  { min: 70, label: 'Dedicated' },
  { min: 50, label: 'Consistent' },
  { min: 30, label: 'Improving' },
  { min: 0, label: 'Beginner' },
] as const;

export interface ConsistencyScoreResult {
  score: number;
  band: string;
  breakdown: { label: string; score: number; weight: number }[];
}

/**
 * currentStreak: +10 points per streak day, capped at 100 (10+ day streak
 *   maxes this factor).
 * practiceFrequency: scaled against a 5-sessions/week target (allows rest
 *   days), capped at 100.
 * missedDays: Monthly Consistency's own percentage, reused directly.
 * weeklyConsistency: days practiced in the last 7, reused from Weekly
 *   Activity directly.
 */
export function computeConsistencyScore(
  streak: StreakInfo,
  frequency: PracticeFrequency,
  monthly: MonthlyConsistency,
  weeklyActivity: WeeklyActivityDay[],
): ConsistencyScoreResult {
  const streakScore = Math.min(100, streak.currentStreak * 10);
  const frequencyScore = Math.min(100, (frequency.avgSessionsPerWeek / 5) * 100);
  const missedDaysScore = monthly.percentage;
  const daysPracticedLast7 = weeklyActivity.filter(d => d.practiced).length;
  const weeklyScore = Math.round((daysPracticedLast7 / 7) * 100);

  const breakdown = [
    { label: 'Current Streak', score: Math.round(streakScore), weight: CONSISTENCY_SCORE_WEIGHTS.currentStreak },
    { label: 'Practice Frequency', score: Math.round(frequencyScore), weight: CONSISTENCY_SCORE_WEIGHTS.practiceFrequency },
    { label: 'Missed Days', score: Math.round(missedDaysScore), weight: CONSISTENCY_SCORE_WEIGHTS.missedDays },
    { label: 'Weekly Consistency', score: weeklyScore, weight: CONSISTENCY_SCORE_WEIGHTS.weeklyConsistency },
  ];
  const score = Math.round(breakdown.reduce((s, b) => s + b.score * b.weight, 0));
  const band = CONSISTENCY_SCORE_BANDS.find(b => score >= b.min)!.label;

  return { score, band, breakdown };
}

// ── Consistency Insights (rule-based, transparent) ───────────────────────
// Every line below only appears when the underlying data actually supports
// it — same convention as every other insights engine in this app.

function sameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function buildConsistencyInsights(
  attempts: OlympiadAttemptSummary[],
  streak: StreakInfo,
  monthly: MonthlyConsistency,
  today: Date = new Date(),
): string[] {
  const lines: string[] = [];
  const submitted = attempts.filter(a => a.status === 'SUBMITTED');
  if (!submitted.length) return lines;

  // "You practise consistently every week." — every ISO week since the
  // earliest attempt in view (last 8 weeks, to keep this cheap) had >=1
  // practice day.
  const eightWeeksAgo = addDays(today, -56);
  const recentDates = new Set(
    submitted.filter(a => new Date(a.startTime) >= eightWeeksAgo).map(a => toDateKey(new Date(a.startTime))),
  );
  if (recentDates.size >= 8) {
    const weeksWithPractice = new Set<number>();
    for (const key of recentDates) {
      const [y, m, d] = key.split('-').map(Number);
      const daysSince = Math.floor((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
      weeksWithPractice.add(Math.floor(daysSince / 7));
    }
    if (weeksWithPractice.size >= 6 && [0, 1, 2, 3, 4, 5, 6, 7].every(w => weeksWithPractice.has(w))) {
      lines.push('You practise consistently every week.');
    }
  }

  // "Your practice frequency has improved this month." — this calendar
  // month's session count vs. last calendar month's.
  const lastMonthAnchor = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const thisMonthCount = submitted.filter(a => sameCalendarMonth(new Date(a.startTime), today)).length;
  const lastMonthCount = submitted.filter(a => sameCalendarMonth(new Date(a.startTime), lastMonthAnchor)).length;
  if (lastMonthCount > 0 && thisMonthCount > lastMonthCount) {
    lines.push('Your practice frequency has improved this month.');
  }

  // "Most missed sessions occur on weekends." — compare weekend vs. weekday
  // miss rate across this month's elapsed days.
  const elapsedThisMonth = monthly.daysElapsed;
  if (elapsedThisMonth >= 7) {
    const practiceDates = new Set(submitted.map(a => toDateKey(new Date(a.startTime))));
    let weekendTotal = 0, weekendMissed = 0, weekdayTotal = 0, weekdayMissed = 0;
    for (let d = 1; d <= elapsedThisMonth; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), d);
      const key = toDateKey(date);
      const missed = !practiceDates.has(key);
      if (isWeekend(date)) { weekendTotal++; if (missed) weekendMissed++; }
      else { weekdayTotal++; if (missed) weekdayMissed++; }
    }
    const weekendMissRate = weekendTotal > 0 ? weekendMissed / weekendTotal : 0;
    const weekdayMissRate = weekdayTotal > 0 ? weekdayMissed / weekdayTotal : 0;
    if (weekendTotal >= 2 && weekendMissRate > weekdayMissRate + 0.2) {
      lines.push('Most missed sessions occur on weekends.');
    }
  }

  // "You tend to practise in short bursts." — low average consecutive-run
  // length relative to total practice days, i.e. practice is scattered
  // rather than sustained.
  const allDates = [...new Set(submitted.map(a => toDateKey(new Date(a.startTime))))].sort();
  if (allDates.length >= 5) {
    let runs = 1;
    for (let i = 1; i < allDates.length; i++) {
      const [py, pm, pd] = allDates[i - 1].split('-').map(Number);
      const prevPlusOne = toDateKey(addDays(new Date(py, pm - 1, pd), 1));
      if (prevPlusOne !== allDates[i]) runs++;
    }
    const avgRunLength = allDates.length / runs;
    if (avgRunLength < 1.5 && streak.bestStreak < 3) {
      lines.push('You tend to practise in short bursts rather than sustained streaks.');
    }
  }

  // "Your consistency is improving steadily." — last 2 weeks' practice-day
  // count vs. the 2 weeks before that.
  const last14 = submitted.filter(a => new Date(a.startTime) >= addDays(today, -14));
  const prior14 = submitted.filter(a => {
    const t = new Date(a.startTime);
    return t >= addDays(today, -28) && t < addDays(today, -14);
  });
  const last14Days = new Set(last14.map(a => toDateKey(new Date(a.startTime)))).size;
  const prior14Days = new Set(prior14.map(a => toDateKey(new Date(a.startTime)))).size;
  if (prior14Days > 0 && last14Days > prior14Days) {
    lines.push('Your consistency is improving steadily.');
  }

  return lines.slice(0, 4);
}

// ── AI Consistency Advice (reuse Feature 8 — no second AI engine) ────────
// A thin selector over Feature 8's already-computed LearningInsights
// (riskAlerts, summaryLines) plus the streak/score this file already has —
// deliberately NOT a new scored-rule engine like RECOMMENDATION_RULES;
// just an if/else pick over signals that already exist.

export function buildConsistencyAdvice(
  learningInsights: LearningInsights | null,
  streak: StreakInfo,
  score: ConsistencyScoreResult,
): string {
  const practiceGapAlert = learningInsights?.riskAlerts.find(a => a.id === 'practice-gap');
  if (practiceGapAlert) {
    return "It's been a while since your last practice — a session today will help rebuild your streak.";
  }
  if (streak.currentStreak > 0 && !streak.practicedToday) {
    return 'Maintain your current streak by practising tomorrow.';
  }
  if (score.score < 50) {
    return 'Practising every second day will improve your consistency score.';
  }
  if (learningInsights?.summaryLines.length) {
    return learningInsights.summaryLines[0];
  }
  return 'Keep practising regularly to build a strong study habit.';
}

// ── Motivation message ────────────────────────────────────────────────────
export function buildMotivationMessage(streak: StreakInfo): string {
  const gapToBest = streak.bestStreak - streak.currentStreak;
  if (streak.currentStreak > 0 && gapToBest > 0 && gapToBest <= 3) {
    return `You're only ${gapToBest} day${gapToBest === 1 ? '' : 's'} away from your longest streak.`;
  }
  if (streak.currentStreak > 0 && !streak.practicedToday) {
    return 'One practice session today will keep your streak alive.';
  }
  if (streak.currentStreak === 0) {
    return 'Start a practice session today to begin your streak.';
  }
  return `You're on a ${streak.currentStreak}-day streak — keep up the great work!`;
}
