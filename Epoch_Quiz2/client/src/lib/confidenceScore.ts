import type { PracticeOverviewData, SubjectStat, QuestionTypeStat } from '../hooks/useStudentAnalytics';
import { getSpeedBand } from './speedBand';

/**
 * Feature 8 (AI Learning Insights) — Confidence Meter.
 *
 * A single 0-100 "how ready are you" score, blended from five signals this
 * feature already has on hand from Features 1, 2, 4, 5 and 6 — no new
 * fetch, no recomputation of anything those features didn't already derive.
 *
 * WEIGHTING — tune here, nowhere else. The request specifies these five
 * inputs but not their relative importance, so the split below is a
 * documented design choice: accuracy is weighted highest because it's the
 * single most direct signal of mastery, consistency next because a spiky
 * score is less trustworthy than a steady one, and speed/balance/question-
 * type share the remainder as secondary readiness signals.
 */
export const CONFIDENCE_WEIGHTS = {
  accuracy: 0.35,
  consistency: 0.20,
  speedEfficiency: 0.15,
  subjectBalance: 0.15,
  questionTypePerformance: 0.15,
} as const;

const WEIGHT_SUM = Object.values(CONFIDENCE_WEIGHTS).reduce((s, w) => s + w, 0);
if (Math.round(WEIGHT_SUM * 100) !== 100) {
  throw new Error(`CONFIDENCE_WEIGHTS must sum to 1.0, got ${WEIGHT_SUM}`);
}

// Whole-number rounding for every score/contribution shown in the UI — a
// 0-100 confidence meter reads as an integer, not "48.39".
function round(n: number): number { return Math.round(n); }
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }

// Maps Feature 4's 5 speed bands onto a 0-100 sub-score for this meter only
// — the bands themselves stay the single source of truth in speedBand.ts.
const SPEED_BAND_SCORE: Record<string, number> = {
  Fast: 100, Good: 85, Average: 65, Slow: 45, 'Very Slow': 25,
};

function speedEfficiencyScore(avgSecPerQuestion: number): number {
  return SPEED_BAND_SCORE[getSpeedBand(avgSecPerQuestion).label] ?? 50;
}

// Documented, tunable band cutoffs — the request names the 5 labels but not
// numeric thresholds (same situation consistencyBand.ts was already in).
const CONFIDENCE_BANDS = [
  { min: 91, label: 'Expert', emoji: '🏆' },
  { min: 76, label: 'Advanced', emoji: '🚀' },
  { min: 61, label: 'Proficient', emoji: '💪' },
  { min: 41, label: 'Developing', emoji: '🌱' },
  { min: 0, label: 'Beginner', emoji: '📘' },
];

export interface ConfidenceBreakdownEntry {
  label: string;
  weight: number;
  score: number;
  contribution: number;
  note: string;
}

export interface ConfidenceResult {
  score: number;
  band: string;
  bandEmoji: string;
  breakdown: ConfidenceBreakdownEntry[];
}

export function computeConfidence(
  overview: PracticeOverviewData,
  subjects: SubjectStat[],
  questionTypes: QuestionTypeStat[],
): ConfidenceResult {
  // 1. Accuracy — Feature 1's headline number, already 0-100.
  const accuracyScore = clamp(overview.accuracyPercent, 0, 100);

  // 2. Consistency — inverted std-deviation of per-attempt accuracy
  //    (Feature 6). A single attempt has no spread to measure; falls back
  //    to the accuracy score itself rather than a fabricated "perfect" 100.
  const consistencyScore = overview.totalAttempts >= 2
    ? clamp(100 - overview.accuracyTrend.accuracyStdDeviation * 2, 0, 100)
    : accuracyScore;

  // 3. Speed efficiency — overall average time/question through the same
  //    5 speed bands used everywhere else (Feature 4).
  const speedBand = getSpeedBand(overview.averageTimePerQuestionSec);
  const speedScore = speedEfficiencyScore(overview.averageTimePerQuestionSec);

  // 4. Subject balance — coefficient of variation of questions-attempted
  //    per subject (Feature 2). Evenly spread practice scores high; one
  //    subject hogging all the attempts scores low. A single practiced
  //    subject has no spread to measure and falls back to a neutral
  //    midpoint rather than a false "perfectly balanced" 100.
  let balanceScore: number;
  if (subjects.length <= 1) {
    balanceScore = 50;
  } else {
    const counts = subjects.map(s => s.totalQuestionsAttempted);
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    balanceScore = clamp(100 - cv * 100, 0, 100);
  }

  // 5. Question-type performance — attempt-weighted average accuracy across
  //    question types (Feature 5). Falls back to overall accuracy when no
  //    type-level data exists yet.
  let typeScore: number;
  if (questionTypes.length) {
    const totalQ = questionTypes.reduce((s, t) => s + t.totalQuestionsAttempted, 0);
    typeScore = totalQ > 0
      ? clamp(questionTypes.reduce((s, t) => s + t.accuracyPercent * t.totalQuestionsAttempted, 0) / totalQ, 0, 100)
      : accuracyScore;
  } else {
    typeScore = accuracyScore;
  }

  const breakdown: ConfidenceBreakdownEntry[] = [
    {
      label: 'Accuracy', weight: CONFIDENCE_WEIGHTS.accuracy, score: round(accuracyScore),
      contribution: round(accuracyScore * CONFIDENCE_WEIGHTS.accuracy),
      note: `${round(accuracyScore)}% overall accuracy`,
    },
    {
      label: 'Consistency', weight: CONFIDENCE_WEIGHTS.consistency, score: round(consistencyScore),
      contribution: round(consistencyScore * CONFIDENCE_WEIGHTS.consistency),
      note: overview.totalAttempts >= 2
        ? `±${overview.accuracyTrend.accuracyStdDeviation} pts spread across your attempts`
        : 'Not enough attempts yet to measure spread',
    },
    {
      label: 'Speed Efficiency', weight: CONFIDENCE_WEIGHTS.speedEfficiency, score: round(speedScore),
      contribution: round(speedScore * CONFIDENCE_WEIGHTS.speedEfficiency),
      note: `${speedBand.label} pace overall`,
    },
    {
      label: 'Subject Balance', weight: CONFIDENCE_WEIGHTS.subjectBalance, score: round(balanceScore),
      contribution: round(balanceScore * CONFIDENCE_WEIGHTS.subjectBalance),
      note: subjects.length <= 1 ? 'Only one subject practiced so far' : `Practice spread across ${subjects.length} subjects`,
    },
    {
      label: 'Question Type Performance', weight: CONFIDENCE_WEIGHTS.questionTypePerformance, score: round(typeScore),
      contribution: round(typeScore * CONFIDENCE_WEIGHTS.questionTypePerformance),
      note: questionTypes.length ? `${round(typeScore)}% average accuracy across question types` : 'No question-type data yet',
    },
  ];

  const score = round(breakdown.reduce((s, b) => s + b.contribution, 0));
  const band = CONFIDENCE_BANDS.find(b => score >= b.min)!;

  return { score, band: band.label, bandEmoji: band.emoji, breakdown };
}

/**
 * Feature 10 (Personalized Report Card) — per-subject confidence.
 *
 * A lighter sibling of computeConfidence() above, at subject granularity.
 * SubjectStat doesn't carry a full accuracy-history standard deviation —
 * that's only ever computed overall, across every attempt (Feature 6's
 * accuracyTrend) — so recreating the exact 5-factor formula per subject
 * would mean a new query Features 1-9 never needed. Instead this reuses the
 * two SubjectStat signals that stand in for the same ideas: accuracy itself,
 * speed efficiency (the same speedEfficiencyScore used above), and a
 * first-vs-latest-attempt stability read in place of a variance the data
 * doesn't carry.
 *
 * WEIGHTING — tune here, nowhere else. Deliberately separate from
 * CONFIDENCE_WEIGHTS above since the two scores answer different questions
 * ("how ready is this student overall" vs "how solid is this one subject").
 */
export const SUBJECT_CONFIDENCE_WEIGHTS = {
  accuracy: 0.5,
  speedEfficiency: 0.25,
  stability: 0.25,
} as const;

export function computeSubjectConfidence(subject: {
  accuracyPercent: number;
  averageTimePerQuestionSec: number;
  firstAttemptAccuracy: number;
  latestAttemptAccuracy: number;
}): number {
  const accuracyScore = clamp(subject.accuracyPercent, 0, 100);
  const speedScore = speedEfficiencyScore(subject.averageTimePerQuestionSec);

  // Improved or held steady -> full marks; declined -> penalized in
  // proportion to the drop (a 20-point decline halves this sub-score).
  const delta = subject.latestAttemptAccuracy - subject.firstAttemptAccuracy;
  const stabilityScore = delta >= 0 ? 100 : clamp(100 + delta * 2, 0, 100);

  const score = accuracyScore * SUBJECT_CONFIDENCE_WEIGHTS.accuracy
    + speedScore * SUBJECT_CONFIDENCE_WEIGHTS.speedEfficiency
    + stabilityScore * SUBJECT_CONFIDENCE_WEIGHTS.stability;

  return round(score);
}
