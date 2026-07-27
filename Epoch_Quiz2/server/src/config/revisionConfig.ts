/**
 * Feature 13: Revision Center & Spaced Revision — every tunable number for
 * the scheduler and priority scoring lives here, nowhere else, mirroring
 * PracticeConfig's "change values here only" convention.
 */

/** Spaced-repetition schedule: intervalIndex 0 = Day 1, 1 = Day 3, etc. A
 *  correct revision answer advances one step (capped at the last entry); a
 *  wrong or skipped one resets to index 0. */
export const REVISION_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** A topic (chapter) at or below this accuracy makes every question the
 *  student has attempted in it a revision candidate, even ones answered
 *  correctly — the topic as a whole needs reinforcement. */
export const TOPIC_ACCURACY_THRESHOLD = 70;

/** Time budget for a Revision Session attempt, mirroring
 *  RETRY_SECONDS_PER_QUESTION in quiz.service.ts — revision has no
 *  PracticeConfig entry of its own since it can mix difficulties/subjects. */
export const REVISION_SECONDS_PER_QUESTION = 60;

/**
 * Priority scoring weights (see RevisionService.computePriority). Each
 * factor is normalized to a 0-100 sub-score before weighting, so the total
 * is always 0-100 regardless of how the sub-scores are individually capped.
 */
export const PRIORITY_WEIGHTS = {
  wrongCount: 0.35,
  skipCount: 0.20,
  daysSinceLastSeen: 0.20,
  topicAccuracyGap: 0.15,
  bookmarked: 0.10,
} as const;

const PRIORITY_WEIGHT_SUM = Object.values(PRIORITY_WEIGHTS).reduce((s, w) => s + w, 0);
if (Math.round(PRIORITY_WEIGHT_SUM * 100) !== 100) {
  throw new Error(`PRIORITY_WEIGHTS must sum to 1.0, got ${PRIORITY_WEIGHT_SUM}`);
}

/** Priority band cutoffs on the 0-100 blended score. */
export const PRIORITY_THRESHOLDS = { high: 65, medium: 35 } as const;
