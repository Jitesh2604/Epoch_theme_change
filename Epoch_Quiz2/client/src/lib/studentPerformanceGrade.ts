/**
 * Feature 6: Overall Performance Grade — the single "configurable rules"
 * module for classifying a student as Excellent / Good / Average / Needs
 * Improvement / At Risk. Every threshold lives here, in one place, so
 * retuning the rules never requires touching the table/detail-panel UI.
 *
 * This blends signals Feature 6 already computes (practice accuracy,
 * assessment average, the at-risk flag from atRiskDetection.ts) — it does
 * not re-derive any of them. "At Risk" is not a low-score band; it's
 * reserved for the same multi-signal evidence atRiskDetection.ts already
 * evaluates (accuracy, skip rate, inactivity, trend, confidence, assessment
 * average, assessment trend) — a student can have a mediocre-but-stable
 * score and still land in "Needs Improvement" rather than "At Risk" if none
 * of those specific risk indicators fired.
 */

export type PerformanceGrade = 'Excellent' | 'Good' | 'Average' | 'Needs Improvement' | 'At Risk';

/** Blended-score band cutoffs (inclusive lower bound), tune here only. */
export const GRADE_EXCELLENT_THRESHOLD = 85;
export const GRADE_GOOD_THRESHOLD = 70;
export const GRADE_AVERAGE_THRESHOLD = 50;
// Below GRADE_AVERAGE_THRESHOLD → 'Needs Improvement' (unless atRisk, see above).

export interface StudentGradeInput {
  atRisk: boolean;
  atRiskReasons?: string[];
  /** Practice Olympiad overall accuracy — null when the student has no
   *  practice attempts yet. */
  accuracyPercent: number | null;
  /** Assessment average percentage — null when the student has no
   *  completed Assessment submissions yet. */
  assessmentAveragePercent: number | null;
}

export interface StudentGradeResult {
  /** null only when there's no practice AND no assessment data to grade —
   *  an honest "not yet gradeable" state, never a fabricated default band. */
  grade: PerformanceGrade | null;
  reasons: string[];
}

export function classifyStudentPerformance({
  atRisk, atRiskReasons, accuracyPercent, assessmentAveragePercent,
}: StudentGradeInput): StudentGradeResult {
  if (atRisk) {
    return {
      grade: 'At Risk',
      reasons: atRiskReasons?.length ? atRiskReasons : ['Flagged at-risk by one or more performance indicators.'],
    };
  }

  const signals = [accuracyPercent, assessmentAveragePercent].filter((v): v is number => v != null);
  if (!signals.length) {
    return { grade: null, reasons: ['No practice or assessment data yet.'] };
  }

  const blended = signals.reduce((s, v) => s + v, 0) / signals.length;
  const label = accuracyPercent != null && assessmentAveragePercent != null
    ? 'blended practice + assessment average'
    : accuracyPercent != null ? 'practice accuracy' : 'assessment average';

  const grade: PerformanceGrade =
    blended >= GRADE_EXCELLENT_THRESHOLD ? 'Excellent' :
    blended >= GRADE_GOOD_THRESHOLD ? 'Good' :
    blended >= GRADE_AVERAGE_THRESHOLD ? 'Average' :
    'Needs Improvement';

  return { grade, reasons: [`${Math.round(blended)}% ${label}.`] };
}
