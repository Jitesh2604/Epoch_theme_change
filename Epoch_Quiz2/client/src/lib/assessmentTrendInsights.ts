/**
 * Feature 6: Assessment score trend — the Assessment-side analogue of
 * accuracyInsights.ts's trend detection. Same technique (first attempt vs.
 * latest attempt, with a dead zone around zero so noise between two points
 * isn't reported as a real trend) — reimplemented here rather than imported
 * because the input shape differs (a percent-history array built from
 * Assessment submissions, not PracticeOverviewData's accuracyTrend).
 */

export type AssessmentTrendDirection = 'improved' | 'declined' | 'consistent';

// Matches accuracyInsights.ts's TREND_DEAD_ZONE — same dead-zone reasoning
// applies to Assessment percentages, so the value is kept identical.
const TREND_DEAD_ZONE = 3;

export interface AssessmentTrendPoint {
  date: string;
  percent: number;
}

export interface AssessmentTrendResult {
  direction: AssessmentTrendDirection;
  deltaPercent: number; // latest - first, signed
}

/** history must be chronological (oldest first) and pre-filtered to
 *  completed submissions only (a percent from an IN_PROGRESS submission is
 *  meaningless). Fewer than 2 points can't show a trend. */
export function deriveAssessmentTrend(history: AssessmentTrendPoint[]): AssessmentTrendResult {
  if (history.length < 2) return { direction: 'consistent', deltaPercent: 0 };

  const first = history[0].percent;
  const latest = history[history.length - 1].percent;
  const deltaPercent = Math.round((latest - first) * 100) / 100;

  const direction: AssessmentTrendDirection =
    deltaPercent > TREND_DEAD_ZONE ? 'improved' :
    deltaPercent < -TREND_DEAD_ZONE ? 'declined' : 'consistent';

  return { direction, deltaPercent };
}
