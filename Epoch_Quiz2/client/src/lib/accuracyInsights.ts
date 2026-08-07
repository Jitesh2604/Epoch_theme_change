import type { PracticeOverviewData } from '../hooks/useStudentAnalytics';
import { getConsistencyBand, type ConsistencyBand } from './consistencyBand';
import { getPerformanceBand } from './performanceBand';

/**
 * Feature 6: Accuracy Analytics — pure derivation over PracticeOverviewData
 * (already fetched by AnalyticsPage.tsx for Features 1 and 4). No fetching
 * of its own — the purest reuse of any feature this session.
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TrendDirection = 'improved' | 'declined' | 'consistent';

// A small dead-zone around zero — noise between two single data points
// shouldn't be reported as a real trend either way. Exported since Feature 8
// (classAnalyticsAggregation.ts) reuses the same dead-zone when banding a
// class's mean trend delta, rather than picking a second, possibly-drifting
// value.
export const TREND_DEAD_ZONE = 3;

export interface AccuracyRatios {
  correctPercent: number;
  wrongPercent: number;
  skippedPercent: number;
}

export interface AccuracyInsights {
  ratios: AccuracyRatios;
  trendDirection: TrendDirection;
  trendDeltaPercent: number; // latest - first, signed
  consistency: (ConsistencyBand & { stdDeviation: number; explanation: string }) | null; // null if totalAttempts < 2
  insightLines: string[];
  recommendationLines: string[];
}

export function deriveAccuracyInsights(overview: PracticeOverviewData): AccuracyInsights {
  const { totalCorrect, totalWrong, totalSkipped, totalQuestionsAttempted, accuracyPercent, accuracyTrend } = overview;
  const denom = totalQuestionsAttempted > 0 ? totalQuestionsAttempted : 1;

  const ratios: AccuracyRatios = {
    correctPercent: round((totalCorrect / denom) * 100),
    wrongPercent: round((totalWrong / denom) * 100),
    skippedPercent: round((totalSkipped / denom) * 100),
  };

  const trendDeltaPercent = round(accuracyTrend.latestAttemptAccuracy - accuracyTrend.firstAttemptAccuracy);
  const trendDirection: TrendDirection =
    trendDeltaPercent > TREND_DEAD_ZONE ? 'improved' :
    trendDeltaPercent < -TREND_DEAD_ZONE ? 'declined' : 'consistent';

  // "Variation across attempts," per the request — not meaningful for a
  // single quiz, so this is withheld (not just defaulted to "Highly
  // Consistent," which a lone attempt's stddev-of-0 would otherwise imply).
  const consistency = overview.totalAttempts >= 2
    ? {
        ...getConsistencyBand(accuracyTrend.accuracyStdDeviation),
        stdDeviation: accuracyTrend.accuracyStdDeviation,
        explanation: `Your accuracy varies by about ${accuracyTrend.accuracyStdDeviation} points across your last ${overview.totalAttempts} attempts.`,
      }
    : null;

  const insightLines: string[] = [];
  const recommendationLines: string[] = [];

  // "Steadily improved" / "becoming more consistent" — only claimed when
  // there's enough history to compare a recent window against the rest of
  // the timeline (need both segments to actually mean something), and only
  // when the comparison genuinely supports it.
  if (overview.totalAttempts >= 6) {
    const history = accuracyTrend.history;
    const recent = history.slice(-5).map(h => h.accuracy);
    const earlier = history.slice(0, -5).map(h => h.accuracy);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const stddev = (xs: number[]) => {
      const m = mean(xs);
      return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
    };

    if (earlier.length) {
      if (mean(recent) - mean(earlier) > TREND_DEAD_ZONE) {
        insightLines.push('Your accuracy has steadily improved over recent attempts.');
      }
      if (stddev(recent) < stddev(earlier) - TREND_DEAD_ZONE) {
        insightLines.push('Your accuracy is becoming more consistent.');
      }
    }
  }

  if (ratios.skippedPercent > 20) {
    insightLines.push('You often lose marks due to skipped questions.');
    recommendationLines.push('Reduce skipped questions to improve your overall score.');
  } else if (ratios.skippedPercent < 5 && accuracyPercent >= 70) {
    insightLines.push('You perform well when attempting every question.');
  }

  if (ratios.wrongPercent > ratios.correctPercent && ratios.wrongPercent > 15) {
    insightLines.push('Focus on reducing careless mistakes.');
  }

  const overallBand = getPerformanceBand(accuracyPercent);
  if (overallBand.label === 'Excellent') {
    recommendationLines.push('Your accuracy is excellent. Focus on improving speed next.');
  } else if (ratios.skippedPercent <= 20) {
    recommendationLines.push('Spend a little more time reviewing each question before submitting.');
  }

  if (consistency && (consistency.label === 'Highly Consistent' || consistency.label === 'Mostly Consistent')) {
    recommendationLines.push('Maintain your current consistency.');
  }

  return { ratios, trendDirection, trendDeltaPercent, consistency, insightLines, recommendationLines };
}
