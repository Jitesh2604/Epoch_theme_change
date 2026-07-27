import type { PracticeOverviewData, SubjectStat, TopicStat } from '../hooks/useStudentAnalytics';
import type { LearningInsights } from './learningInsightsEngine';
import type { OlympiadAttemptSummary } from '../hooks/usePracticeQuiz';
import type { RevisionDashboard } from '../hooks/useRevision';
import { getSpeedBand } from './speedBand';

/**
 * Feature 14: Achievements, Badges & Learning Milestones.
 *
 * A pure derivation over data Features 1–13 already fetch — AchievementContext
 * below is assembled once by AnalyticsPage.tsx from objects those features
 * already hold (PracticeOverviewData, SubjectStat[], TopicStat[],
 * LearningInsights, attempt history, RevisionDashboard, the Feature 9 study
 * streak). No new backend query anywhere in this file.
 *
 * Every badge is one entry in a flat, data-driven catalog (ACHIEVEMENT_RULES
 * + the dynamic Subject Mastery generator) — each with its own `evaluate()`
 * closure, mirroring the RECOMMENDATION_RULES / DIFFICULTY_THRESHOLDS pattern
 * used elsewhere in this app for "many small, independently configurable
 * rules." Adding a badge later means appending one entry, nothing else
 * changes.
 */

export type BadgeLevel = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export const BADGE_LEVEL_META: Record<BadgeLevel, { emoji: string; label: string }> = {
  BRONZE:   { emoji: '🥉', label: 'Bronze' },
  SILVER:   { emoji: '🥈', label: 'Silver' },
  GOLD:     { emoji: '🥇', label: 'Gold' },
  PLATINUM: { emoji: '💎', label: 'Platinum' },
  DIAMOND:  { emoji: '⭐', label: 'Diamond' },
};

export type AchievementCategory =
  | 'PRACTICE' | 'ACCURACY' | 'SUBJECT_MASTERY' | 'REVISION'
  | 'SPEED' | 'CONSISTENCY' | 'IMPROVEMENT';

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  PRACTICE: 'Practice Achievements',
  ACCURACY: 'Accuracy Achievements',
  SUBJECT_MASTERY: 'Subject Mastery',
  REVISION: 'Revision Achievements',
  SPEED: 'Speed Achievements',
  CONSISTENCY: 'Consistency Achievements',
  IMPROVEMENT: 'Improvement Achievements',
};

export interface AchievementContext {
  overview: PracticeOverviewData;
  subjects: SubjectStat[];
  topics: TopicStat[];
  attempts: OlympiadAttemptSummary[];
  learningInsights: LearningInsights | null;
  practiceStreak: { currentStreak: number; bestStreak: number } | null;
  revision: RevisionDashboard | null;
}

export interface AchievementProgress {
  current: number;
  target: number;
  percent: number;
  unlocked: boolean;
  /** Best-effort — reconstructed from already-fetched historical data where
   *  possible (see each rule's comment), never fabricated. */
  unlockedAt: Date | null;
}

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  level: BadgeLevel;
  icon: string;
  unit: string;
  evaluate: (ctx: AchievementContext) => AchievementProgress;
}

export interface EvaluatedAchievement extends AchievementProgress {
  definition: AchievementDefinition;
}

function pct(current: number, target: number): number {
  return target > 0 ? Math.round(Math.min(100, (current / target) * 100)) : 0;
}

function progress(current: number, target: number, unlockedAt: Date | null): AchievementProgress {
  const unlocked = current >= target;
  return { current: Math.min(current, target), target, percent: pct(current, target), unlocked, unlockedAt: unlocked ? unlockedAt : null };
}

/** First history entry (chronological) whose accuracy already meets
 *  `threshold` — the date that percentage milestone was first reached.
 *  Reuses Feature 6's accuracyTrend.history, never recomputed. */
function firstDateAtAccuracy(overview: PracticeOverviewData, threshold: number): Date | null {
  const hit = overview.accuracyTrend.history.find(h => h.accuracy >= threshold);
  return hit ? new Date(hit.date) : null;
}

/** The Nth practice attempt's date (1-indexed) — history is chronological
 *  and its length equals totalAttempts, so history[n-1] is the exact
 *  attempt that crossed an n-session milestone. Reuses Feature 6's data for
 *  a session-count purpose it wasn't originally computed for. */
function dateAtAttemptCount(overview: PracticeOverviewData, n: number): Date | null {
  const entry = overview.accuracyTrend.history[n - 1];
  return entry ? new Date(entry.date) : null;
}

// ── Practice Achievements ────────────────────────────────────────────────
// A session-count ladder — each tier's name is escalating so "Recently
// Unlocked"/"Next Achievements" reads naturally as real progress.
const PRACTICE_TIERS: { threshold: number; name: string; level: BadgeLevel }[] = [
  { threshold: 1,   name: 'First Practice',      level: 'BRONZE' },
  { threshold: 10,  name: 'Practice Explorer',   level: 'SILVER' },
  { threshold: 25,  name: 'Practice Enthusiast', level: 'GOLD' },
  { threshold: 50,  name: 'Practice Pro',        level: 'PLATINUM' },
  { threshold: 100, name: 'Practice Legend',     level: 'DIAMOND' },
];

function buildPracticeAchievements(): AchievementDefinition[] {
  return PRACTICE_TIERS.map(tier => ({
    id: `practice-${tier.threshold}`,
    category: 'PRACTICE',
    name: tier.name,
    description: `Complete ${tier.threshold} Practice Olympiad session${tier.threshold === 1 ? '' : 's'}.`,
    level: tier.level,
    icon: '🎯',
    unit: 'practice sessions',
    evaluate: ctx => progress(ctx.overview.totalAttempts, tier.threshold, dateAtAttemptCount(ctx.overview, tier.threshold)),
  }));
}

// ── Accuracy Achievements ─────────────────────────────────────────────────
// The percentage tiers reuse Feature 6's bestAccuracyAchieved (the best any
// single attempt has ever scored) — a real, already-computed peak, not a
// new calculation. Accuracy Master is a higher, sustained bar: overall
// accuracy, not just a single high score.
export const ACCURACY_MASTER_THRESHOLD = 90;
export const ACCURACY_MASTER_MIN_ATTEMPTS = 10;

const ACCURACY_TIERS: { threshold: number; name: string; level: BadgeLevel }[] = [
  { threshold: 100, name: 'First Perfect Score', level: 'GOLD' },
  { threshold: 80,  name: '80% Accuracy',        level: 'BRONZE' },
  { threshold: 90,  name: '90% Accuracy',        level: 'SILVER' },
  { threshold: 95,  name: '95% Accuracy',        level: 'PLATINUM' },
];

function buildAccuracyAchievements(): AchievementDefinition[] {
  const tierBadges: AchievementDefinition[] = ACCURACY_TIERS.map(tier => ({
    id: `accuracy-${tier.threshold}`,
    category: 'ACCURACY',
    name: tier.name,
    description: tier.threshold === 100
      ? 'Score 100% accuracy on a Practice Olympiad attempt.'
      : `Reach ${tier.threshold}% accuracy on a single Practice Olympiad attempt.`,
    level: tier.level,
    icon: '🎯',
    unit: '% accuracy (best attempt)',
    evaluate: ctx => progress(
      Math.round(ctx.overview.accuracyTrend.bestAccuracyAchieved), tier.threshold,
      firstDateAtAccuracy(ctx.overview, tier.threshold),
    ),
  }));

  const accuracyMaster: AchievementDefinition = {
    id: 'accuracy-master',
    category: 'ACCURACY',
    name: 'Accuracy Master',
    description: `Maintain ${ACCURACY_MASTER_THRESHOLD}%+ overall accuracy across at least ${ACCURACY_MASTER_MIN_ATTEMPTS} attempts.`,
    level: 'DIAMOND',
    icon: '🎯',
    unit: '% overall accuracy',
    evaluate: ctx => {
      const meetsVolume = ctx.overview.totalAttempts >= ACCURACY_MASTER_MIN_ATTEMPTS;
      const current = Math.round(ctx.overview.accuracyPercent);
      const unlocked = meetsVolume && current >= ACCURACY_MASTER_THRESHOLD;
      // "Sustained" mastery has no single crossing point to reconstruct
      // precisely — lastPracticeDate is the best-effort approximation,
      // consistent with similar approximations elsewhere in this app.
      return {
        current: Math.min(current, ACCURACY_MASTER_THRESHOLD), target: ACCURACY_MASTER_THRESHOLD,
        percent: meetsVolume ? pct(current, ACCURACY_MASTER_THRESHOLD) : pct(ctx.overview.totalAttempts, ACCURACY_MASTER_MIN_ATTEMPTS),
        unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null,
      };
    },
  };

  return [...tierBadges, accuracyMaster];
}

// ── Subject Mastery ───────────────────────────────────────────────────────
// One dynamically-generated badge per subject the student has practiced —
// reuses Feature 2's SubjectStat[] directly, no new per-subject query.
export const SUBJECT_MASTERY_ACCURACY_THRESHOLD = 85;
export const SUBJECT_MASTERY_MIN_ATTEMPTS = 5;

function buildSubjectMasteryAchievements(ctx: AchievementContext): AchievementDefinition[] {
  return ctx.subjects.map(s => ({
    id: `subject-mastery-${s.subjectId}`,
    category: 'SUBJECT_MASTERY',
    name: `${s.subjectName} Master`,
    description: `Maintain ${SUBJECT_MASTERY_ACCURACY_THRESHOLD}%+ accuracy in ${s.subjectName} over at least ${SUBJECT_MASTERY_MIN_ATTEMPTS} attempts.`,
    level: 'GOLD',
    icon: '🏅',
    unit: 'attempts',
    evaluate: () => {
      const meetsAccuracy = s.accuracyPercent >= SUBJECT_MASTERY_ACCURACY_THRESHOLD;
      const meetsVolume = s.totalAttempts >= SUBJECT_MASTERY_MIN_ATTEMPTS;
      const unlocked = meetsAccuracy && meetsVolume;
      // Both conditions must hold — percent is the more binding of the two,
      // so progress reflects whichever constraint is furthest from met.
      const percent = Math.min(pct(s.totalAttempts, SUBJECT_MASTERY_MIN_ATTEMPTS), pct(s.accuracyPercent, SUBJECT_MASTERY_ACCURACY_THRESHOLD));
      return {
        current: Math.min(s.totalAttempts, SUBJECT_MASTERY_MIN_ATTEMPTS), target: SUBJECT_MASTERY_MIN_ATTEMPTS,
        percent, unlocked, unlockedAt: unlocked ? new Date(s.lastPracticeDate) : null,
      };
    },
  }));
}

// ── Revision Achievements (reuse Feature 13) ─────────────────────────────
export const REVISION_CHAMPION_SESSIONS = 20;

function buildRevisionAchievements(): AchievementDefinition[] {
  const defs: { id: string; name: string; level: BadgeLevel; description: string; target: (r: RevisionDashboard['streak']) => number; current: (r: RevisionDashboard['streak']) => number }[] = [
    { id: 'first-revision', name: 'First Revision Session', level: 'BRONZE', description: 'Complete your first revision session.', target: () => 1, current: r => r.totalSessions },
    { id: 'revision-streak-7', name: '7-Day Revision Streak', level: 'SILVER', description: 'Reach a 7-day revision streak.', target: () => 7, current: r => r.bestStreak },
    { id: 'revision-streak-30', name: '30-Day Revision Streak', level: 'PLATINUM', description: 'Reach a 30-day revision streak.', target: () => 30, current: r => r.bestStreak },
    { id: 'revision-champion', name: 'Revision Champion', level: 'DIAMOND', description: `Complete ${REVISION_CHAMPION_SESSIONS} revision sessions.`, target: () => REVISION_CHAMPION_SESSIONS, current: r => r.totalSessions },
  ];

  return defs.map(d => ({
    id: d.id, category: 'REVISION' as const, name: d.name, description: d.description, level: d.level, icon: '🔁',
    unit: d.id.includes('streak') ? 'day streak' : 'revision sessions',
    evaluate: ctx => {
      if (!ctx.revision) return { current: 0, target: d.target(ctx.revision as any), percent: 0, unlocked: false, unlockedAt: null };
      return progress(
        d.current(ctx.revision.streak), d.target(ctx.revision.streak),
        ctx.revision.streak.lastSessionDate ? new Date(ctx.revision.streak.lastSessionDate) : null,
      );
    },
  }));
}

// ── Speed Achievements (reuse Feature 4) ─────────────────────────────────
export const SPEED_MASTER_ACCURACY_THRESHOLD = 70;

function buildSpeedAchievements(): AchievementDefinition[] {
  return [
    {
      id: 'fast-thinker', category: 'SPEED', name: 'Fast Thinker',
      description: 'Reach a "Fast" or "Good" average pace overall.',
      level: 'BRONZE', icon: '⚡', unit: 'speed band',
      evaluate: ctx => {
        const band = getSpeedBand(ctx.overview.averageTimePerQuestionSec);
        const unlocked = band.label === 'Fast' || band.label === 'Good';
        return { current: unlocked ? 1 : 0, target: 1, percent: unlocked ? 100 : 40, unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null };
      },
    },
    {
      id: 'speed-master', category: 'SPEED', name: 'Speed Master',
      description: `Reach a "Fast" average pace while keeping accuracy at ${SPEED_MASTER_ACCURACY_THRESHOLD}%+.`,
      level: 'GOLD', icon: '⚡', unit: 'speed + accuracy',
      evaluate: ctx => {
        const band = getSpeedBand(ctx.overview.averageTimePerQuestionSec);
        const unlocked = band.label === 'Fast' && ctx.overview.accuracyPercent >= SPEED_MASTER_ACCURACY_THRESHOLD;
        return { current: unlocked ? 1 : 0, target: 1, percent: unlocked ? 100 : (band.label === 'Fast' ? 70 : 30), unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null };
      },
    },
    {
      id: 'time-management-expert', category: 'SPEED', name: 'Time Management Expert',
      description: 'Reach "Excellent" (fast + accurate) efficiency in at least one subject.',
      level: 'PLATINUM', icon: '⚡', unit: 'subjects at excellent efficiency',
      evaluate: ctx => {
        const excellentCount = ctx.learningInsights?.derived.speedInsights?.efficiencyBySubject
          .filter(e => e.efficiency.quadrant === 'excellent').length ?? 0;
        const unlocked = excellentCount >= 1;
        return { current: Math.min(excellentCount, 1), target: 1, percent: unlocked ? 100 : 0, unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null };
      },
    },
  ];
}

// ── Consistency Achievements (reuse Feature 6/8/9) ───────────────────────
export const CONSISTENT_LEARNER_MIN_ATTEMPTS = 10;

function buildConsistencyAchievements(): AchievementDefinition[] {
  return [
    {
      id: 'practice-streak-7', category: 'CONSISTENCY', name: '7-Day Practice Streak',
      description: 'Reach a 7-day practice streak.', level: 'SILVER', icon: '🔥', unit: 'day streak',
      evaluate: ctx => progress(ctx.practiceStreak?.bestStreak ?? 0, 7, ctx.practiceStreak && ctx.practiceStreak.bestStreak >= 7 ? new Date(ctx.overview.lastPracticeDate) : null),
    },
    {
      id: 'practice-streak-30', category: 'CONSISTENCY', name: '30-Day Practice Streak',
      description: 'Reach a 30-day practice streak.', level: 'PLATINUM', icon: '🔥', unit: 'day streak',
      evaluate: ctx => progress(ctx.practiceStreak?.bestStreak ?? 0, 30, ctx.practiceStreak && ctx.practiceStreak.bestStreak >= 30 ? new Date(ctx.overview.lastPracticeDate) : null),
    },
    {
      id: 'consistent-learner', category: 'CONSISTENCY', name: 'Consistent Learner',
      description: `Keep accuracy consistent across attempts (Consistent or better) over at least ${CONSISTENT_LEARNER_MIN_ATTEMPTS} attempts.`,
      level: 'GOLD', icon: '🔥', unit: 'attempts',
      evaluate: ctx => {
        const consistency = ctx.learningInsights?.derived.accuracyInsights.consistency;
        const meetsVolume = ctx.overview.totalAttempts >= CONSISTENT_LEARNER_MIN_ATTEMPTS;
        const meetsLabel = !!consistency && ['Consistent', 'Highly Consistent'].includes(consistency.label);
        const unlocked = meetsVolume && meetsLabel;
        return {
          current: Math.min(ctx.overview.totalAttempts, CONSISTENT_LEARNER_MIN_ATTEMPTS), target: CONSISTENT_LEARNER_MIN_ATTEMPTS,
          percent: meetsLabel ? pct(ctx.overview.totalAttempts, CONSISTENT_LEARNER_MIN_ATTEMPTS) : (meetsVolume ? 40 : pct(ctx.overview.totalAttempts, CONSISTENT_LEARNER_MIN_ATTEMPTS)),
          unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null,
        };
      },
    },
  ];
}

// ── Improvement Achievements (reuse Features 3 & 6) ──────────────────────
export const BIGGEST_IMPROVEMENT_THRESHOLD = 15;
export const ACCURACY_IMPROVEMENT_THRESHOLD = 10;
export const REDUCED_SKIP_RATE_THRESHOLD = 10;

function buildImprovementAchievements(): AchievementDefinition[] {
  return [
    {
      id: 'biggest-subject-improvement', category: 'IMPROVEMENT', name: 'Biggest Subject Improvement',
      description: `Improve a subject's accuracy by ${BIGGEST_IMPROVEMENT_THRESHOLD}+ points from your first attempt to your latest.`,
      level: 'GOLD', icon: '📈', unit: '% improvement',
      evaluate: ctx => {
        const pick = ctx.learningInsights?.derived.subjectInsights?.biggestImprovement;
        const current = pick ? Math.round(pick.improvementPercent) : 0;
        return progress(current, BIGGEST_IMPROVEMENT_THRESHOLD, current >= BIGGEST_IMPROVEMENT_THRESHOLD ? new Date(ctx.overview.lastPracticeDate) : null);
      },
    },
    {
      id: 'accuracy-improvement', category: 'IMPROVEMENT', name: 'Accuracy Improvement',
      description: `Improve your overall accuracy by ${ACCURACY_IMPROVEMENT_THRESHOLD}+ points since your first attempts.`,
      level: 'SILVER', icon: '📈', unit: '% improvement',
      evaluate: ctx => {
        const insights = ctx.learningInsights?.derived.accuracyInsights;
        const improved = insights?.trendDirection === 'improved';
        const current = improved ? Math.round(insights!.trendDeltaPercent) : 0;
        return progress(current, ACCURACY_IMPROVEMENT_THRESHOLD, current >= ACCURACY_IMPROVEMENT_THRESHOLD ? new Date(ctx.overview.lastPracticeDate) : null);
      },
    },
    {
      id: 'reduced-skip-rate', category: 'IMPROVEMENT', name: 'Reduced Skip Rate',
      // Approximated: per-attempt skip history isn't tracked anywhere in
      // this app (only cumulative totals), so this reads "current skip rate
      // is low" rather than a true before/after trend. Progress is framed
      // as an "answer rate" (100 - skip%) so it follows the same
      // higher-current-is-better convention as every other badge here,
      // even though the underlying, user-facing metric is a skip rate.
      description: `Keep your overall skipped-question rate at or below ${REDUCED_SKIP_RATE_THRESHOLD}%.`,
      level: 'BRONZE', icon: '📈', unit: '% answered (target: 100 − skip rate)',
      evaluate: ctx => {
        const skipPct = ctx.learningInsights?.derived.accuracyInsights.ratios.skippedPercent ?? 100;
        const answerRateTarget = 100 - REDUCED_SKIP_RATE_THRESHOLD;
        const answerRateCurrent = Math.round(100 - skipPct);
        const unlocked = skipPct <= REDUCED_SKIP_RATE_THRESHOLD;
        return progress(answerRateCurrent, answerRateTarget, unlocked ? new Date(ctx.overview.lastPracticeDate) : null);
      },
    },
    {
      id: 'better-time-management', category: 'IMPROVEMENT', name: 'Better Time Management',
      description: 'Cut your time-per-question in a subject compared to your first attempts there.',
      level: 'SILVER', icon: '📈', unit: 'subjects improved',
      evaluate: ctx => {
        const improvement = ctx.learningInsights?.derived.speedInsights?.speedImprovement;
        const unlocked = !!improvement;
        return { current: unlocked ? 1 : 0, target: 1, percent: unlocked ? 100 : 0, unlocked, unlockedAt: unlocked ? new Date(ctx.overview.lastPracticeDate) : null };
      },
    },
  ];
}

// ── Catalog assembly ──────────────────────────────────────────────────────

function buildStaticCatalog(): AchievementDefinition[] {
  return [
    ...buildPracticeAchievements(),
    ...buildAccuracyAchievements(),
    ...buildRevisionAchievements(),
    ...buildSpeedAchievements(),
    ...buildConsistencyAchievements(),
    ...buildImprovementAchievements(),
  ];
}

export function evaluateAchievements(ctx: AchievementContext): EvaluatedAchievement[] {
  const catalog = [...buildStaticCatalog(), ...buildSubjectMasteryAchievements(ctx)];
  return catalog.map(definition => ({ definition, ...definition.evaluate(ctx) }));
}

// ── Learning Milestones ──────────────────────────────────────────────────
// A simpler flat list (no badge levels) — reuses the same already-fetched
// data as the badge catalog above.
export interface MilestoneDefinition {
  id: string;
  name: string;
  evaluate: (ctx: AchievementContext) => AchievementProgress;
}

const QUESTION_MILESTONES = [100, 500, 1000];

export function evaluateMilestones(ctx: AchievementContext): (MilestoneDefinition & AchievementProgress)[] {
  const perfectQuizCount = ctx.overview.accuracyTrend.history.filter(h => h.accuracy >= 100).length;

  const defs: MilestoneDefinition[] = [
    ...QUESTION_MILESTONES.map(n => ({
      id: `questions-${n}`,
      name: `${n.toLocaleString()} Questions Solved`,
      evaluate: (c: AchievementContext) => progress(c.overview.totalQuestionsAttempted, n, null),
    })),
    {
      id: 'five-subjects',
      name: '5 Subjects Practiced',
      evaluate: c => progress(c.overview.totalSubjectsPracticed, 5, null),
    },
    {
      id: 'first-mixed-practice',
      name: 'First Mixed Practice',
      evaluate: c => progress(c.overview.totalMixedPracticeAttempts, 1, null),
    },
    {
      id: 'ten-perfect-quizzes',
      name: '10 Perfect Quizzes',
      evaluate: () => progress(perfectQuizCount, 10, null),
    },
  ];

  return defs.map(d => ({ ...d, ...d.evaluate(ctx) }));
}

// ── Personal Bests ────────────────────────────────────────────────────────
export interface PersonalBest {
  label: string;
  value: string;
  detail?: string;
}

export function evaluatePersonalBests(ctx: AchievementContext): PersonalBest[] {
  const bests: PersonalBest[] = [
    { label: 'Highest Accuracy', value: `${ctx.overview.accuracyTrend.bestAccuracyAchieved}%` },
    { label: 'Best Score', value: String(ctx.overview.bestScore) },
    { label: 'Longest Practice Streak', value: `${ctx.practiceStreak?.bestStreak ?? 0} days` },
    { label: 'Longest Revision Streak', value: `${ctx.revision?.streak.bestStreak ?? 0} days` },
  ];

  if (ctx.overview.shortestSession) {
    bests.push({
      label: 'Fastest Quiz',
      value: fmtMinutes(ctx.overview.shortestSession.durationSec),
      detail: ctx.overview.shortestSession.subjectLabel,
    });
  }

  const questionsByDay = new Map<string, number>();
  for (const a of ctx.attempts) {
    if (a.status !== 'SUBMITTED') continue;
    const day = new Date(a.startTime).toISOString().slice(0, 10);
    questionsByDay.set(day, (questionsByDay.get(day) ?? 0) + a.questionCount);
  }
  const maxDay = [...questionsByDay.values()].reduce((m, v) => Math.max(m, v), 0);
  bests.push({ label: 'Most Questions Solved in One Day', value: String(maxDay) });

  return bests;
}

function fmtMinutes(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Recently Unlocked / Next Achievements ─────────────────────────────────

export function recentlyUnlocked(evaluated: EvaluatedAchievement[], limit = 5): EvaluatedAchievement[] {
  return evaluated
    .filter(e => e.unlocked && e.unlockedAt)
    .sort((a, b) => (b.unlockedAt as Date).getTime() - (a.unlockedAt as Date).getTime())
    .slice(0, limit);
}

export function nextAchievements(evaluated: EvaluatedAchievement[], limit = 3): EvaluatedAchievement[] {
  return evaluated
    .filter(e => !e.unlocked && e.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}
