import type { SubjectStat } from '../hooks/useStudentAnalytics';
import {
  DECLINE_THRESHOLD, LOW_ACCURACY_THRESHOLD,
  type DerivedAnalytics, type LearningInsights,
} from './learningInsightsEngine';
import { getSpeedBand } from './speedBand';

/**
 * Feature 11: Smart Practice Recommendations.
 *
 * Takes Feature 8's already-built `LearningInsights` (itself built from
 * Features 1/2/5/6/7's already-fetched Practice Olympiad data) as its only
 * input — no new fetch, no recomputed analytics, no duplicated rule logic.
 * `buildPracticeRecommendation` is a pure function of that object; every
 * number/reason below is read straight off `insights.derived` or
 * `insights.confidence`, never fabricated.
 *
 * Every tunable threshold is a named export at the top of its section so the
 * rules can be adjusted later without touching the logic that uses them.
 */

export type PracticeDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ── Difficulty selection ────────────────────────────────────────────────
// Configurable accuracy cutoffs: below `easyBelow` → Easy, below
// `mediumBelow` → Medium, otherwise → Hard.
export const DIFFICULTY_ACCURACY_THRESHOLDS = {
  easyBelow: 50,
  mediumBelow: 70,
} as const;

export function recommendDifficulty(accuracyPercent: number): PracticeDifficulty {
  if (accuracyPercent < DIFFICULTY_ACCURACY_THRESHOLDS.easyBelow) return 'EASY';
  if (accuracyPercent < DIFFICULTY_ACCURACY_THRESHOLDS.mediumBelow) return 'MEDIUM';
  return 'HARD';
}

function nextHarderDifficulty(d: PracticeDifficulty): PracticeDifficulty {
  return d === 'EASY' ? 'MEDIUM' : 'HARD';
}

// ── Estimated session ────────────────────────────────────────────────────
// The real question count/time limit are server-assigned per difficulty
// (see server/src/config/practiceConfig.ts) and only resolved once the
// student actually opens the quiz overview; querying that here for a
// not-yet-started session would be an extra round-trip this feature is
// explicitly asked to avoid. These are clearly-labeled estimates instead.
export const ESTIMATED_SESSION_BY_DIFFICULTY: Record<PracticeDifficulty, { questions: number; minutes: number }> = {
  EASY:   { questions: 15, minutes: 12 },
  MEDIUM: { questions: 20, minutes: 18 },
  HARD:   { questions: 20, minutes: 25 },
};

export function computeTargetAccuracy(currentAccuracyPercent: number): number {
  const target = Math.round((currentAccuracyPercent + 10) / 5) * 5;
  return clamp(target, 60, 95);
}

// ── Readiness score ──────────────────────────────────────────────────────
// Blended from confidence score, accuracy, consistency, recency, and
// subject balance, per the spec's own list of inputs. Weights are a
// documented, tunable design choice — same pattern as CONFIDENCE_WEIGHTS in
// confidenceScore.ts.
export const READINESS_WEIGHTS = {
  confidence: 0.4,
  accuracy: 0.25,
  consistency: 0.15,
  recency: 0.1,
  subjectBalance: 0.1,
} as const;

export const READINESS_BAND_THRESHOLDS = { ready: 75, almostReady: 50 } as const;

export interface ReadinessBreakdownEntry {
  label: string;
  score: number;
  weight: number;
}

export type ReadinessBand = 'Ready' | 'Almost Ready' | 'Needs Revision';

export interface ReadinessResult {
  score: number;
  band: ReadinessBand;
  breakdown: ReadinessBreakdownEntry[];
}

function subjectAccuracySpread(subjects: SubjectStat[]): number {
  if (subjects.length < 2) return 0;
  const values = subjects.map(s => s.accuracyPercent);
  return Math.max(...values) - Math.min(...values);
}

function computeReadiness(ctx: DerivedAnalytics, confidenceScore: number): ReadinessResult {
  const accuracyScore = clamp(ctx.overview.accuracyPercent, 0, 100);

  const consistency = ctx.accuracyInsights.consistency;
  const consistencyScore = consistency
    ? clamp(100 - consistency.stdDeviation * 2, 0, 100)
    : accuracyScore;

  const daysSincePractice = (Date.now() - new Date(ctx.overview.lastPracticeDate).getTime()) / 86_400_000;
  const recencyScore = clamp(100 - daysSincePractice * 5, 0, 100);

  const spread = subjectAccuracySpread(ctx.subjects);
  const balanceScore = clamp(100 - spread * 2, 0, 100);

  const breakdown: ReadinessBreakdownEntry[] = [
    { label: 'Confidence Score', score: Math.round(confidenceScore), weight: READINESS_WEIGHTS.confidence },
    { label: 'Accuracy', score: Math.round(accuracyScore), weight: READINESS_WEIGHTS.accuracy },
    { label: 'Consistency', score: Math.round(consistencyScore), weight: READINESS_WEIGHTS.consistency },
    { label: 'Time Since Last Practice', score: Math.round(recencyScore), weight: READINESS_WEIGHTS.recency },
    { label: 'Subject Balance', score: Math.round(balanceScore), weight: READINESS_WEIGHTS.subjectBalance },
  ];

  const score = Math.round(breakdown.reduce((s, b) => s + b.score * b.weight, 0));
  const band: ReadinessBand = score >= READINESS_BAND_THRESHOLDS.ready
    ? 'Ready'
    : score >= READINESS_BAND_THRESHOLDS.almostReady
      ? 'Almost Ready'
      : 'Needs Revision';

  return { score, band, breakdown };
}

// ── Dynamic actions ───────────────────────────────────────────────────────
export const DYNAMIC_ACTION_THRESHOLDS = { challenge: 85, encourage: 45 } as const;

export interface DynamicAction {
  tone: 'challenge' | 'encourage';
  message: string;
}

function buildDynamicAction(readiness: ReadinessResult, primaryDifficulty: PracticeDifficulty): DynamicAction | null {
  if (readiness.score >= DYNAMIC_ACTION_THRESHOLDS.challenge && primaryDifficulty !== 'HARD') {
    return { tone: 'challenge', message: 'Challenge yourself with Hard difficulty.' };
  }
  if (readiness.score < DYNAMIC_ACTION_THRESHOLDS.encourage) {
    return { tone: 'encourage', message: 'Continue with Easy practice until accuracy improves.' };
  }
  return null;
}

// ── Primary target selection ─────────────────────────────────────────────
// Evidence-based, in priority order — the first rule with real supporting
// data wins. Every reason string is built from the exact numbers behind the
// decision, never a generic placeholder.
export const BALANCE_SPREAD_THRESHOLD = 12; // percentage points
export const NEGLECTED_SUBJECT_GAP_DAYS = 7;

interface PrimaryTarget {
  kind: 'subject' | 'mixed';
  subject: SubjectStat | null;
  reason: string;
}

function decliningReason(s: SubjectStat, delta: number): string {
  return `Your ${s.subjectName} accuracy is ${s.accuracyPercent}% and it has declined ${Math.abs(Math.round(delta))} points over your recent attempts.`;
}

function pickPrimaryTarget(ctx: DerivedAnalytics): PrimaryTarget {
  const { subjects, subjectInsights } = ctx;

  // Precomputed once — reused by both the combined "weak + declining" rule
  // below and the standalone "declining" rule, sorted worst-decline-first.
  const declining = subjects
    .map(s => ({ s, delta: s.latestAttemptAccuracy - s.firstAttemptAccuracy }))
    .filter(x => x.delta <= DECLINE_THRESHOLD)
    .sort((a, b) => a.delta - b.delta);

  // 1. Needs immediate attention — practiced enough that the low accuracy
  // can't be explained by inexperience. Strongest evidence available.
  if (subjectInsights?.needsAttention) {
    const s = subjectInsights.needsAttention;
    return {
      kind: 'subject', subject: s,
      reason: `Your ${s.subjectName} accuracy is ${s.accuracyPercent}% after ${s.totalAttempts} attempts — it needs focused attention.`,
    };
  }

  // 2. A subject that is both below the low-accuracy bar AND declining —
  // two independent problems compounding, the flagship "48% and declining"
  // case. Checked before either signal alone so it isn't outranked by, say,
  // a strong subject (89%) that dipped slightly.
  const weakAndDeclining = declining.find(x => x.s.accuracyPercent < LOW_ACCURACY_THRESHOLD);
  if (weakAndDeclining) {
    return { kind: 'subject', subject: weakAndDeclining.s, reason: decliningReason(weakAndDeclining.s, weakAndDeclining.delta) };
  }

  // 3. Weakest subject below threshold, even with no measurable decline.
  if (subjectInsights?.weakest && subjectInsights.weakest.accuracyPercent < LOW_ACCURACY_THRESHOLD) {
    const s = subjectInsights.weakest;
    return {
      kind: 'subject', subject: s,
      reason: `${s.subjectName} is your lowest-accuracy subject at ${s.accuracyPercent}%.`,
    };
  }

  // 4. Otherwise-solid subject that's nonetheless declining — worth catching
  // early, but only once nothing more urgent (1-3 above) applies.
  if (declining.length) {
    return { kind: 'subject', subject: declining[0].s, reason: decliningReason(declining[0].s, declining[0].delta) };
  }

  if (
    subjects.length >= 2
    && subjectAccuracySpread(subjects) <= BALANCE_SPREAD_THRESHOLD
    && subjects.every(s => s.accuracyPercent >= LOW_ACCURACY_THRESHOLD)
  ) {
    const values = subjects.map(s => s.accuracyPercent);
    return {
      kind: 'mixed', subject: null,
      reason: `Your accuracy is consistently strong and balanced across all ${subjects.length} subjects (${Math.min(...values)}%–${Math.max(...values)}%) — Mixed Subjects Practice keeps every subject sharp.`,
    };
  }

  if (subjectInsights?.leastPracticed) {
    const s = subjectInsights.leastPracticed;
    const days = Math.floor((Date.now() - new Date(s.lastPracticeDate).getTime()) / 86_400_000);
    if (days >= NEGLECTED_SUBJECT_GAP_DAYS) {
      return {
        kind: 'subject', subject: s,
        reason: `It's been ${days} days since you last practiced ${s.subjectName} — time to revisit it.`,
      };
    }
  }

  if (subjectInsights?.strongest) {
    const s = subjectInsights.strongest;
    return {
      kind: 'subject', subject: s,
      reason: `You're performing well overall — keep building on your strongest subject, ${s.subjectName} (${s.accuracyPercent}%).`,
    };
  }

  return { kind: 'mixed', subject: null, reason: 'Keep practicing to unlock focused subject recommendations.' };
}

// ── Public shapes ─────────────────────────────────────────────────────────

export interface PrimaryRecommendation {
  kind: 'subject' | 'mixed';
  subjectId: string | null;
  subjectName: string;
  difficulty: PracticeDifficulty;
  estimatedQuestions: number;
  estimatedMinutes: number;
  targetAccuracyPercent: number;
  reason: string;
}

export interface AlternativeRecommendation {
  id: string;
  title: string;
  kind: 'subject' | 'mixed';
  subjectId: string | null;
  subjectName: string;
  difficulty: PracticeDifficulty;
  reason: string;
}

export interface PracticeRecommendation {
  primary: PrimaryRecommendation;
  alternatives: AlternativeRecommendation[];
  goals: string[];
  readiness: ReadinessResult;
  dynamicAction: DynamicAction | null;
}

function buildPrimary(target: PrimaryTarget, ctx: DerivedAnalytics): PrimaryRecommendation {
  const accuracyForDifficulty = target.kind === 'mixed' ? ctx.overview.accuracyPercent : target.subject!.accuracyPercent;
  const difficulty = recommendDifficulty(accuracyForDifficulty);
  const session = ESTIMATED_SESSION_BY_DIFFICULTY[difficulty];

  return {
    kind: target.kind,
    subjectId: target.kind === 'mixed' ? null : target.subject!.subjectId,
    subjectName: target.kind === 'mixed' ? 'Mixed Subjects Practice' : target.subject!.subjectName,
    difficulty,
    estimatedQuestions: session.questions,
    estimatedMinutes: session.minutes,
    targetAccuracyPercent: computeTargetAccuracy(accuracyForDifficulty),
    reason: target.reason,
  };
}

// ── Practice goals ────────────────────────────────────────────────────────
export const SLOW_SUBJECT_TIME_TRIM_FACTOR = 0.8;

function buildSessionGoals(target: PrimaryTarget, ctx: DerivedAnalytics): string[] {
  const goals: string[] = ['Answer every question — avoid skipping.'];

  const skipPct = ctx.accuracyInsights.ratios.skippedPercent;
  if (skipPct > 10) {
    goals.push(`Reduce skipped questions — you currently skip ${skipPct}%.`);
  }

  if (target.kind === 'subject') {
    const s = target.subject!;
    goals.push(`Improve ${s.subjectName} accuracy by 10% (currently ${s.accuracyPercent}%).`);
    const band = getSpeedBand(s.averageTimePerQuestionSec);
    if (band.label === 'Slow' || band.label === 'Very Slow') {
      const targetSec = Math.max(10, Math.round(s.averageTimePerQuestionSec * SLOW_SUBJECT_TIME_TRIM_FACTOR));
      goals.push(`Spend less than ${targetSec} seconds per question (currently ${Math.round(s.averageTimePerQuestionSec)}s).`);
    }
  } else {
    goals.push(`Maintain balanced accuracy across all subjects (currently ${ctx.overview.accuracyPercent}% overall).`);
  }

  return goals.slice(0, 4);
}

// ── Alternative recommendations ──────────────────────────────────────────
function buildAlternatives(primary: PrimaryRecommendation, ctx: DerivedAnalytics): AlternativeRecommendation[] {
  const { subjectInsights, subjects, topicInsights } = ctx;
  const isSamePrimary = (subjectId: string | null) => primary.kind === 'subject' && subjectId === primary.subjectId;
  const candidates: AlternativeRecommendation[] = [];

  if (subjectInsights?.weakest && !isSamePrimary(subjectInsights.weakest.subjectId)) {
    const s = subjectInsights.weakest;
    candidates.push({
      id: 'improve-weakest', title: 'Improve Weakest Subject',
      kind: 'subject', subjectId: s.subjectId, subjectName: s.subjectName,
      difficulty: recommendDifficulty(s.accuracyPercent),
      reason: `${s.subjectName} has your lowest accuracy at ${s.accuracyPercent}%.`,
    });
  }

  if (subjectInsights?.strongest && !isSamePrimary(subjectInsights.strongest.subjectId)) {
    const s = subjectInsights.strongest;
    candidates.push({
      id: 'maintain-strongest', title: 'Maintain Strongest Subject',
      kind: 'subject', subjectId: s.subjectId, subjectName: s.subjectName,
      difficulty: recommendDifficulty(s.accuracyPercent),
      reason: `Good improvement in ${s.subjectName} (${s.accuracyPercent}%) — maintain momentum.`,
    });
  }

  if (subjects.length >= 2 && primary.kind !== 'mixed') {
    candidates.push({
      id: 'mixed-practice', title: 'Mixed Subjects Practice',
      kind: 'mixed', subjectId: null, subjectName: 'Mixed Subjects Practice',
      difficulty: recommendDifficulty(ctx.overview.accuracyPercent),
      reason: `Practice across all ${subjects.length} subjects together to build well-rounded readiness.`,
    });
  }

  if (topicInsights?.weakestTopics.length) {
    const t = topicInsights.weakestTopics[0];
    if (!isSamePrimary(t.subjectId)) {
      candidates.push({
        id: 'review-weak-topic', title: `Review ${t.topicName}`,
        kind: 'subject', subjectId: t.subjectId, subjectName: t.subjectName,
        difficulty: recommendDifficulty(t.accuracyPercent),
        reason: `${t.topicName} is your weakest topic at ${t.accuracyPercent}% accuracy.`,
      });
    }
  }

  // Guaranteed fallbacks — cover the rare case (e.g. a single practiced
  // subject, no topic data) where the rules above yield fewer than 2.
  const fallbacks: AlternativeRecommendation[] = [
    {
      id: 'deepen-practice', title: `Deepen Practice in ${primary.subjectName}`,
      kind: primary.kind, subjectId: primary.subjectId, subjectName: primary.subjectName,
      difficulty: nextHarderDifficulty(primary.difficulty),
      reason: `Step up to ${nextHarderDifficulty(primary.difficulty).toLowerCase()} difficulty in ${primary.subjectName} once you're comfortable, to keep progressing.`,
    },
    {
      id: 'repeat-focused', title: `Repeat ${primary.subjectName} for a Higher Score`,
      kind: primary.kind, subjectId: primary.subjectId, subjectName: primary.subjectName,
      difficulty: primary.difficulty,
      reason: `Another ${primary.difficulty.toLowerCase()}-difficulty session in ${primary.subjectName} reinforces what you just practiced.`,
    },
  ];
  for (const fb of fallbacks) {
    if (candidates.length >= 2) break;
    candidates.push(fb);
  }

  return candidates.slice(0, 2);
}

export function buildPracticeRecommendation(insights: LearningInsights): PracticeRecommendation {
  const ctx = insights.derived;
  const target = pickPrimaryTarget(ctx);
  const primary = buildPrimary(target, ctx);
  const readiness = computeReadiness(ctx, insights.confidence.score);
  const dynamicAction = buildDynamicAction(readiness, primary.difficulty);
  const alternatives = buildAlternatives(primary, ctx);
  const goals = buildSessionGoals(target, ctx);

  return { primary, alternatives, goals, readiness, dynamicAction };
}
