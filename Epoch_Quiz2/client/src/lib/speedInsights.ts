import type { PracticeOverviewData, SubjectStat } from '../hooks/useStudentAnalytics';

/**
 * Speed/time-efficiency derivation over PracticeOverviewData + SubjectStat[].
 * The standalone "Speed & Time Analytics" UI section that originally used
 * this directly has been removed; `getEfficiencyQuadrant`/`deriveSpeedInsights`
 * remain in use by learningInsightsEngine.ts (AI Learning Insights) and
 * questionTypeInsights.ts (Speed vs Accuracy).
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Same tie-break idea as strengthWeaknessInsights.ts's betterEvidence —
 *  prefer the subject with more attempts behind the number, then alphabetical. */
function betterEvidence(a: SubjectStat, b: SubjectStat): SubjectStat {
  if (a.totalAttempts !== b.totalAttempts) return a.totalAttempts > b.totalAttempts ? a : b;
  return a.subjectName.localeCompare(b.subjectName) <= 0 ? a : b;
}

function pickBy(items: SubjectStat[], score: (s: SubjectStat) => number, direction: 'max' | 'min'): SubjectStat {
  return items.reduce((best, s) => {
    const bs = score(best), ss = score(s);
    if (ss === bs) return betterEvidence(best, s);
    if (direction === 'max') return ss > bs ? s : best;
    return ss < bs ? s : best;
  });
}

// The 70% line matches the same cutoff Feature 3's "Needs Attention" already
// uses — one consistent accuracy bar across features, not a second number.
const ACCURATE_THRESHOLD = 70;
// Fast/Good speed bands (see speedBand.ts) vs. Average/Slow/Very Slow.
const FAST_THRESHOLD_SEC = 35;

export type EfficiencyQuadrant = 'excellent' | 'needs-review' | 'careful-learner' | 'needs-improvement';

export interface EfficiencyLabel {
  quadrant: EfficiencyQuadrant;
  label: string;
  description: string;
}

/** Structural, not just SubjectStat — Feature 5's QuestionTypeStat also
 *  satisfies this shape, so the same classification (and its thresholds)
 *  is reused as-is rather than re-implemented per feature. */
export function getEfficiencyQuadrant(subject: { averageTimePerQuestionSec: number; accuracyPercent: number }): EfficiencyLabel {
  const fast = subject.averageTimePerQuestionSec <= FAST_THRESHOLD_SEC;
  const accurate = subject.accuracyPercent >= ACCURATE_THRESHOLD;

  if (fast && accurate) {
    return { quadrant: 'excellent', label: 'Excellent', description: 'Fast + Accurate' };
  }
  if (fast && !accurate) {
    return { quadrant: 'needs-review', label: 'Needs Review', description: 'Very Fast but Low Accuracy — you may be rushing' };
  }
  if (!fast && accurate) {
    return { quadrant: 'careful-learner', label: 'Careful Learner', description: 'Slow but High Accuracy' };
  }
  return { quadrant: 'needs-improvement', label: 'Needs Improvement', description: 'Slow and Low Accuracy' };
}

export interface SpeedImprovementPick {
  subject: SubjectStat;
  improvementSec: number; // firstAttemptTimePerQuestionSec - latestAttemptTimePerQuestionSec, > 0 (got faster)
}

export interface SpeedTimeInsights {
  overallAverageTimePerQuestionSec: number;
  totalPracticeTimeSec: number;
  averageQuizDurationSec: number;
  fastestSubject: SubjectStat;
  slowestSubject: SubjectStat;
  efficiencyBySubject: { subject: SubjectStat; efficiency: EfficiencyLabel }[];
  /** null when no subject has ≥2 attempts, or nothing actually got faster. */
  speedImprovement: SpeedImprovementPick | null;
  speedInsightLines: string[];
}

export function deriveSpeedInsights(overview: PracticeOverviewData, subjects: SubjectStat[]): SpeedTimeInsights | null {
  if (!subjects.length) return null;

  const fastestSubject = pickBy(subjects, s => s.averageTimePerQuestionSec, 'min');
  const slowestSubject = pickBy(subjects, s => s.averageTimePerQuestionSec, 'max');
  const efficiencyBySubject = subjects.map(subject => ({ subject, efficiency: getEfficiencyQuadrant(subject) }));

  const withHistory = subjects.filter(s => s.totalAttempts >= 2);
  let speedImprovement: SpeedImprovementPick | null = null;
  if (withHistory.length) {
    const best = withHistory.reduce((best, s) => {
      const delta = s.firstAttemptTimePerQuestionSec - s.latestAttemptTimePerQuestionSec;
      const bestDelta = best.firstAttemptTimePerQuestionSec - best.latestAttemptTimePerQuestionSec;
      return delta > bestDelta ? s : best;
    });
    const improvementSec = round(best.firstAttemptTimePerQuestionSec - best.latestAttemptTimePerQuestionSec);
    // Only a real speed-up counts — a slowdown or flat trend isn't
    // "improving," same honesty guard as Feature 3's accuracy pick.
    if (improvementSec > 0) speedImprovement = { subject: best, improvementSec };
  }

  const summaryLines: string[] = [];
  summaryLines.push(`You answer ${fastestSubject.subjectName} questions the fastest.`);
  if (slowestSubject.subjectId !== fastestSubject.subjectId) {
    summaryLines.push(`You spend significantly more time on ${slowestSubject.subjectName} questions.`);
  }
  if (speedImprovement) {
    summaryLines.push(`Your overall solving speed is improving in ${speedImprovement.subject.subjectName}.`);
  }
  const carefulLearner = efficiencyBySubject.find(e => e.efficiency.quadrant === 'careful-learner');
  if (carefulLearner) {
    summaryLines.push(`Consider improving your speed in ${carefulLearner.subject.subjectName} without sacrificing accuracy.`);
  }

  return {
    overallAverageTimePerQuestionSec: overview.averageTimePerQuestionSec,
    totalPracticeTimeSec: overview.totalPracticeTimeSec,
    averageQuizDurationSec: overview.totalAttempts > 0 ? round(overview.totalPracticeTimeSec / overview.totalAttempts) : 0,
    fastestSubject,
    slowestSubject,
    efficiencyBySubject,
    speedImprovement,
    speedInsightLines: summaryLines,
  };
}
