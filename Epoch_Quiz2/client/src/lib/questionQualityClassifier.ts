import type { QuestionOverviewRow } from '../hooks/useQuestionAnalytics';

/**
 * Admin Analytics — Feature 4: Question Quality Classification.
 *
 * Pure, deterministic, and fully configurable — every threshold is a named
 * constant below, single source of truth, same convention as
 * revisionConfig.ts / learningInsightsEngine.ts / atRiskDetection.ts. No new
 * fetch, no recomputation of success/skip rate — both come straight off
 * QuestionOverviewRow (server/src/services/questionAnalytics.service.ts).
 *
 * 'Insufficient Data' is one label beyond the request's named examples
 * (Excellent/Good/Average/Needs Review/Very Difficult/Too Easy) — added for
 * the same reason strengthWeaknessInsights.ts's "Biggest Improvement" and
 * confidenceScore.ts's consistency factor both refuse to score
 * under-evidenced data: classifying a question attempted twice as "Very
 * Difficult" from a fluke would be dishonest, not a firm quality signal.
 */

export const MIN_ATTEMPTS_FOR_CLASSIFICATION = 5;

// High skip rate is checked before success-rate bands — a question many
// students abandon without answering is a review candidate regardless of
// how the students who *did* answer performed (skipping keeps successRate's
// denominator small and can otherwise mask the real problem).
export const HIGH_SKIP_RATE_THRESHOLD = 30; // percent

// Success-rate band boundaries — each is the inclusive upper bound of its
// band (a rate of exactly 30% is "Very Difficult", not "Needs Review").
export const VERY_DIFFICULT_MAX = 30;
export const NEEDS_REVIEW_MAX = 50;
export const AVERAGE_MAX = 70;
export const GOOD_MAX = 90;
// >= this and not already flagged by skip rate -> "Too Easy" instead of
// "Excellent" — a suspiciously high success rate is itself a signal the
// question may be too easy / trivially guessable, not just well-written.
export const TOO_EASY_MIN = 95;

// Feature 7: Review Detection thresholds — deliberately slightly more
// sensitive than NEEDS_REVIEW_MAX/HIGH_SKIP_RATE_THRESHOLD above. Those
// drive the single first-match-wins status label; this drives an ADDITIVE
// reasons list (deriveReviewReasons below) meant to catch every applicable
// signal, not just the first one, so a borderline "Average"-band question
// (51-60% success, i.e. 40-49% wrong) that the status label alone wouldn't
// flag can still surface a wrong-rate reason.
export const HIGH_WRONG_RATE_THRESHOLD = 40; // percent of answered attempts

// Feature 4 (moved here for Feature 7): a question's average solving time
// is a review candidate when it's this many times its difficulty+type peer
// group's average — same technique questionInsightsEngine.ts's
// 'time-outlier' insight already uses, now also reused per-question by
// deriveReviewReasons. MIN_PEERS_FOR_TIME_COMPARISON guards against a
// "peer average" computed from too few peers to mean anything.
export const TIME_OUTLIER_MULTIPLIER = 2;
export const MIN_PEERS_FOR_TIME_COMPARISON = 3;

export type QuestionQualityStatus =
  | 'Insufficient Data'
  | 'Needs Review'
  | 'Very Difficult'
  | 'Average'
  | 'Good'
  | 'Excellent'
  | 'Too Easy';

export interface QuestionQualityResult {
  status: QuestionQualityStatus;
  reason: string;
}

/**
 * Decision order (documented, evaluated top to bottom, first match wins):
 *   1. totalAttempts < MIN_ATTEMPTS_FOR_CLASSIFICATION -> Insufficient Data
 *   2. skipRatePercent >= HIGH_SKIP_RATE_THRESHOLD      -> Needs Review
 *   3. successRatePercent <= VERY_DIFFICULT_MAX          -> Very Difficult
 *   4. successRatePercent >= TOO_EASY_MIN                -> Too Easy
 *   5. successRatePercent <= NEEDS_REVIEW_MAX             -> Needs Review
 *   6. successRatePercent <= AVERAGE_MAX                  -> Average
 *   7. successRatePercent <= GOOD_MAX                     -> Good
 *   8. otherwise (GOOD_MAX < successRate < TOO_EASY_MIN)  -> Excellent
 */
export function classifyQuestionQuality(row: Pick<QuestionOverviewRow, 'totalAttempts' | 'successRatePercent' | 'skipRatePercent'>): QuestionQualityResult {
  const { totalAttempts, successRatePercent, skipRatePercent } = row;

  if (totalAttempts < MIN_ATTEMPTS_FOR_CLASSIFICATION) {
    return { status: 'Insufficient Data', reason: `Only ${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'} so far — need at least ${MIN_ATTEMPTS_FOR_CLASSIFICATION} to classify.` };
  }
  if (skipRatePercent >= HIGH_SKIP_RATE_THRESHOLD) {
    return { status: 'Needs Review', reason: `${skipRatePercent}% of students skip this question.` };
  }
  if (successRatePercent <= VERY_DIFFICULT_MAX) {
    return { status: 'Very Difficult', reason: `Only ${successRatePercent}% success rate.` };
  }
  if (successRatePercent >= TOO_EASY_MIN) {
    return { status: 'Too Easy', reason: `${successRatePercent}% success rate — most students answer this correctly.` };
  }
  if (successRatePercent <= NEEDS_REVIEW_MAX) {
    return { status: 'Needs Review', reason: `${successRatePercent}% success rate is below the ${NEEDS_REVIEW_MAX}% threshold.` };
  }
  if (successRatePercent <= AVERAGE_MAX) {
    return { status: 'Average', reason: `${successRatePercent}% success rate.` };
  }
  if (successRatePercent <= GOOD_MAX) {
    return { status: 'Good', reason: `${successRatePercent}% success rate.` };
  }
  return { status: 'Excellent', reason: `${successRatePercent}% success rate — well-calibrated difficulty.` };
}

/**
 * Feature 7: the request's 5-band vocabulary (Excellent/Good/Average/
 * Difficult/Critical), as a pure display mapping over the 7-status
 * classification above — no threshold is duplicated, only relabeled.
 * 'Insufficient Data' maps to null: a question with too few attempts to
 * classify honestly has no performance band yet, not a fabricated one.
 */
export type PerformanceBand = 'Excellent' | 'Good' | 'Average' | 'Difficult' | 'Critical';

const BAND_BY_STATUS: Record<QuestionQualityStatus, PerformanceBand | null> = {
  'Insufficient Data': null,
  'Too Easy': 'Excellent',
  'Excellent': 'Excellent',
  'Good': 'Good',
  'Average': 'Average',
  'Needs Review': 'Difficult',
  'Very Difficult': 'Critical',
};

export function toPerformanceBand(status: QuestionQualityStatus): PerformanceBand | null {
  return BAND_BY_STATUS[status];
}

export interface ReviewDetectionResult {
  flagged: boolean;
  reasons: string[];
}

/**
 * Feature 7: Review Detection — unlike classifyQuestionQuality's
 * first-match-wins status, this checks every signal independently and
 * collects every reason that applies (same additive pattern as
 * atRiskDetection.ts), so a question flagged for multiple real reasons
 * shows all of them, not just whichever the classifier happened to match
 * first. A question with fewer than MIN_ATTEMPTS_FOR_CLASSIFICATION
 * attempts is never flagged — there isn't enough evidence to responsibly
 * call it a problem question yet, same gate the classifier uses.
 */
export function deriveReviewReasons(
  row: Pick<QuestionOverviewRow, 'totalAttempts' | 'successRatePercent' | 'skipRatePercent' | 'wrongRatePercent' | 'averageTimeSpentSec'>,
  peerAvgTimeSec: number | null,
): ReviewDetectionResult {
  if (row.totalAttempts < MIN_ATTEMPTS_FOR_CLASSIFICATION) return { flagged: false, reasons: [] };

  const reasons: string[] = [];

  if (row.successRatePercent <= NEEDS_REVIEW_MAX) {
    reasons.push(`Success rate is ${row.successRatePercent}%, at or below the ${NEEDS_REVIEW_MAX}% review threshold.`);
  }
  if (row.skipRatePercent >= HIGH_SKIP_RATE_THRESHOLD) {
    reasons.push(`${row.skipRatePercent}% of students skip this question, at or above the ${HIGH_SKIP_RATE_THRESHOLD}% threshold.`);
  }
  if (row.wrongRatePercent >= HIGH_WRONG_RATE_THRESHOLD) {
    reasons.push(`${row.wrongRatePercent}% of answers are wrong, at or above the ${HIGH_WRONG_RATE_THRESHOLD}% threshold.`);
  }
  if (peerAvgTimeSec !== null && peerAvgTimeSec > 0 && row.averageTimeSpentSec >= TIME_OUTLIER_MULTIPLIER * peerAvgTimeSec) {
    const multiplier = Math.round((row.averageTimeSpentSec / peerAvgTimeSec) * 10) / 10;
    reasons.push(`Takes ${multiplier}x longer than similar questions to solve.`);
  }

  return { flagged: reasons.length > 0, reasons };
}
