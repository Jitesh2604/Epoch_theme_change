import type { QuestionTypeStat } from '../hooks/useStudentAnalytics';
import { pickBy } from './pickBy';
import { getEfficiencyQuadrant, type EfficiencyQuadrant } from './speedInsights';
import { getSpeedBand } from './speedBand';
import { getQuestionTypeLabel } from './questionTypeLabel';

/**
 * Feature 5: Question Type Analytics — pure derivation over
 * QuestionTypeStat[] (already fetched by AnalyticsPage.tsx). No fetching of
 * its own, no recalculation of anything the backend already computed.
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function betterEvidence(a: QuestionTypeStat, b: QuestionTypeStat): QuestionTypeStat {
  if (a.totalAttempts !== b.totalAttempts) return a.totalAttempts > b.totalAttempts ? a : b;
  return a.questionType.localeCompare(b.questionType) <= 0 ? a : b;
}

// Feature 5 asks for plainer wording than Feature 4's "Excellent/Needs
// Review/..." labels — same underlying quadrant classification/thresholds
// (reused via getEfficiencyQuadrant), different display text for this
// feature's "Speed vs Accuracy" section specifically.
const SPEED_ACCURACY_LABEL: Record<EfficiencyQuadrant, string> = {
  excellent:           'Fast & Accurate',
  'needs-review':      'Fast but Inaccurate',
  'careful-learner':   'Slow but Accurate',
  'needs-improvement': 'Slow & Inaccurate',
};

export interface QuestionTypeImprovementPick {
  type: QuestionTypeStat;
  improvementPercent: number; // > 0
}

export interface QuestionTypeInsights {
  bestType: QuestionTypeStat;
  weakestType: QuestionTypeStat;
  /** null unless that type's speed band is actually Slow/Very Slow — not
   *  fabricated when every type is reasonably fast. */
  slowType: QuestionTypeStat | null;
  leastAttemptedType: QuestionTypeStat;
  /** null when no type has ≥2 attempts, or nothing actually improved. */
  improvingType: QuestionTypeImprovementPick | null;
  speedAccuracyByType: { type: QuestionTypeStat; quadrant: EfficiencyQuadrant; label: string }[];
  insightLines: string[];
}

export function deriveQuestionTypeInsights(types: QuestionTypeStat[]): QuestionTypeInsights | null {
  if (!types.length) return null;

  const bestType   = pickBy(types, t => t.accuracyPercent, 'max', betterEvidence);
  const weakestType = pickBy(types, t => t.accuracyPercent, 'min', betterEvidence);

  const slowestCandidate = pickBy(types, t => t.averageTimePerQuestionSec, 'max', betterEvidence);
  const slowType = ['Slow', 'Very Slow'].includes(getSpeedBand(slowestCandidate.averageTimePerQuestionSec).label)
    ? slowestCandidate
    : null;

  const leastAttemptedType = pickBy(types, t => t.totalAttempts, 'min', betterEvidence);

  const withHistory = types.filter(t => t.totalAttempts >= 2);
  let improvingType: QuestionTypeImprovementPick | null = null;
  if (withHistory.length) {
    const best = withHistory.reduce((best, t) => {
      const delta = t.latestAttemptAccuracy - t.firstAttemptAccuracy;
      const bestDelta = best.latestAttemptAccuracy - best.firstAttemptAccuracy;
      return delta > bestDelta ? t : best;
    });
    const improvementPercent = round(best.latestAttemptAccuracy - best.firstAttemptAccuracy);
    if (improvementPercent > 0) improvingType = { type: best, improvementPercent };
  }

  const speedAccuracyByType = types.map(type => {
    const efficiency = getEfficiencyQuadrant(type);
    return { type, quadrant: efficiency.quadrant, label: SPEED_ACCURACY_LABEL[efficiency.quadrant] };
  });

  const insightLines: string[] = [];
  insightLines.push(`You solve ${getQuestionTypeLabel(bestType.questionType)} questions very accurately.`);
  if (slowType) {
    insightLines.push(`You spend too much time on ${getQuestionTypeLabel(slowType.questionType)} questions.`);
  }
  if (improvingType) {
    insightLines.push(`Your ${getQuestionTypeLabel(improvingType.type.questionType)} accuracy has improved over time.`);
  }
  if (leastAttemptedType.questionType !== bestType.questionType) {
    insightLines.push(`Consider practicing more ${getQuestionTypeLabel(leastAttemptedType.questionType)} questions.`);
  }

  return {
    bestType, weakestType, slowType, leastAttemptedType, improvingType,
    speedAccuracyByType, insightLines,
  };
}
