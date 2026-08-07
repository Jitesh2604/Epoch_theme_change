import { AT_RISK_ACCURACY_THRESHOLD, AT_RISK_ASSESSMENT_AVG_THRESHOLD } from './atRiskDetection';
import type { Trend } from './studentRowBuilder';

/**
 * Admin Analytics — Feature 8: Class-level At-Risk Detection.
 *
 * Same additive multi-reason pattern as atRiskDetection.ts (every applicable
 * signal is reported, not just the first match) — reuses that file's
 * accuracy/assessment-average thresholds directly (a "low" number means the
 * same thing whether it's one student's or a class's average), and adds two
 * class-only signals with their own documented constants below. No new
 * fetch: every input here is already computed by classAnalyticsAggregation.ts
 * from data Features 5/6 already fetched.
 */

/** Below this active-in-ACTIVE_WINDOW_DAYS ratio, a class's practice
 *  participation is a review candidate — deliberately distinct from
 *  HIGH_INACTIVE_STUDENT_PERCENT below, which uses the longer
 *  INACTIVE_WINDOW_DAYS window: a class can have low *recent* engagement
 *  without yet having a large *long-term-inactive* population, and vice
 *  versa — both are real, independent signals worth surfacing separately. */
export const LOW_PARTICIPATION_RATE_THRESHOLD = 50; // percent, active/total

/** At or above this percentage of students inactive for INACTIVE_WINDOW_DAYS
 *  (or who have never engaged), a class is flagged — same "> 30d or never"
 *  semantics Feature 2/6 already uses per-student, applied as a class-wide
 *  proportion here. */
export const HIGH_INACTIVE_STUDENT_PERCENT = 50; // percent

export interface ClassRiskInput {
  totalStudents: number;
  activeStudents: number; // active within ACTIVE_WINDOW_DAYS
  inactiveStudents: number; // inactive beyond INACTIVE_WINDOW_DAYS, or never active
  avgPracticeAccuracy: number | null;
  avgAssessmentPercent: number | null;
  practiceTrendDirection: Trend | null;
}

export interface ClassRiskResult {
  atRisk: boolean;
  reasons: string[];
}

export function evaluateClassRisk({
  totalStudents, activeStudents, inactiveStudents, avgPracticeAccuracy, avgAssessmentPercent, practiceTrendDirection,
}: ClassRiskInput): ClassRiskResult {
  const reasons: string[] = [];
  if (totalStudents === 0) return { atRisk: false, reasons: [] };

  const participationRate = Math.round((activeStudents / totalStudents) * 100);
  if (participationRate < LOW_PARTICIPATION_RATE_THRESHOLD) {
    reasons.push(`Only ${participationRate}% of students are actively practicing, below the ${LOW_PARTICIPATION_RATE_THRESHOLD}% threshold.`);
  }

  if (avgAssessmentPercent !== null && avgAssessmentPercent < AT_RISK_ASSESSMENT_AVG_THRESHOLD) {
    reasons.push(`Average assessment score is ${avgAssessmentPercent}%, below the ${AT_RISK_ASSESSMENT_AVG_THRESHOLD}% at-risk threshold.`);
  }

  if (avgPracticeAccuracy !== null && avgPracticeAccuracy < AT_RISK_ACCURACY_THRESHOLD) {
    reasons.push(`Average practice accuracy is ${avgPracticeAccuracy}%, below the ${AT_RISK_ACCURACY_THRESHOLD}% at-risk threshold.`);
  }

  if (practiceTrendDirection === 'Declining') {
    reasons.push('Practice accuracy is trending downward across the class.');
  }

  const inactivePercent = Math.round((inactiveStudents / totalStudents) * 100);
  if (inactivePercent >= HIGH_INACTIVE_STUDENT_PERCENT) {
    reasons.push(`${inactivePercent}% of students are inactive, at or above the ${HIGH_INACTIVE_STUDENT_PERCENT}% threshold.`);
  }

  return { atRisk: reasons.length > 0, reasons };
}
