import type { PracticeOverviewData } from '../hooks/useStudentAnalytics';
import { deriveAccuracyInsights } from './accuracyInsights';
import type { ConfidenceResult } from './confidenceScore';

/**
 * Admin Analytics — Feature 2: At-Risk Student Detection.
 *
 * Pure derivation over analytics Feature 2 already computes for the table
 * (overview, confidence) — no new fetch, no recomputation of accuracy/skip/
 * trend/confidence themselves (all reused from accuracyInsights.ts /
 * confidenceScore.ts). This file only adds the threshold comparisons, same
 * documented-constant convention as revisionConfig.ts / learningInsightsEngine.ts.
 */

export const AT_RISK_ACCURACY_THRESHOLD = 50;
export const AT_RISK_SKIP_RATE_THRESHOLD = 30;
export const AT_RISK_INACTIVITY_DAYS = 14;
export const AT_RISK_LOW_CONFIDENCE_THRESHOLD = 40;

export interface AtRiskInput {
  overview: PracticeOverviewData;
  confidence: ConfidenceResult;
  /** Overdue revision-queue count — only available where the full
   *  RevisionService.getDashboard was fetched (the Summary Panel), not the
   *  table's cheaper batched revision-streak read. Omit to skip this signal. */
  revisionOverdueCount?: number | null;
  now?: Date;
}

export interface AtRiskResult {
  atRisk: boolean;
  reasons: string[];
}

export function evaluateAtRisk({ overview, confidence, revisionOverdueCount, now = new Date() }: AtRiskInput): AtRiskResult {
  const reasons: string[] = [];

  if (overview.accuracyPercent < AT_RISK_ACCURACY_THRESHOLD) {
    reasons.push(`Accuracy is ${overview.accuracyPercent}%, below the ${AT_RISK_ACCURACY_THRESHOLD}% at-risk threshold.`);
  }

  const accuracyInsights = deriveAccuracyInsights(overview);
  if (accuracyInsights.ratios.skippedPercent > AT_RISK_SKIP_RATE_THRESHOLD) {
    reasons.push(`Skipping ${accuracyInsights.ratios.skippedPercent}% of questions, above the ${AT_RISK_SKIP_RATE_THRESHOLD}% threshold.`);
  }

  const daysSinceLastPractice = Math.floor((now.getTime() - new Date(overview.lastPracticeDate).getTime()) / 86_400_000);
  if (daysSinceLastPractice > AT_RISK_INACTIVITY_DAYS) {
    reasons.push(`No practice in ${daysSinceLastPractice} days.`);
  }

  if (accuracyInsights.trendDirection === 'declined') {
    reasons.push(`Accuracy is declining (${accuracyInsights.trendDeltaPercent} points vs. first attempt).`);
  }

  if (confidence.score < AT_RISK_LOW_CONFIDENCE_THRESHOLD) {
    reasons.push(`Confidence score is ${confidence.score} (${confidence.band}), below the ${AT_RISK_LOW_CONFIDENCE_THRESHOLD} threshold.`);
  }

  if (revisionOverdueCount != null && revisionOverdueCount > 0) {
    reasons.push(`${revisionOverdueCount} revision item${revisionOverdueCount === 1 ? '' : 's'} overdue.`);
  }

  return { atRisk: reasons.length > 0, reasons };
}
