import type { SubjectOverviewRow } from '../hooks/useSubjectAnalytics';

/**
 * Admin Analytics — Feature 3: Subject-level AI Insights.
 *
 * Rule-based only, mirroring learningInsightsEngine.ts's architecture: an
 * ordered list of rules, each inspecting the same already-fetched subject
 * summary array (no new fetch, no recomputation of accuracy/growth/skip
 * rate — all of those come straight off SubjectOverviewRow) and either
 * abstaining or returning an evidence-backed sentence. A rule only fires
 * when the underlying numbers actually support it.
 */

export interface SubjectInsight {
  id: string;
  text: string;
}

// Documented thresholds — only call out a growth/decline/skip-rate/
// engagement gap large enough to be a genuine signal, not noise.
export const GROWTH_NOTABLE_THRESHOLD = 5; // accuracy or participation percentage points
export const HIGH_SKIP_RATE_THRESHOLD = 20; // percent
export const WEAK_SUBJECT_ACCURACY_THRESHOLD = 60; // percent

interface Rule {
  id: string;
  evaluate: (subjects: SubjectOverviewRow[]) => SubjectInsight | null;
}

function skipRatePercent(s: SubjectOverviewRow): number {
  return s.totalQuestionsAttempted > 0 ? Math.round((s.totalSkipped / s.totalQuestionsAttempted) * 1000) / 10 : 0;
}

const RULES: Rule[] = [
  {
    id: 'best-growth',
    evaluate: (subjects) => {
      const candidates = subjects.filter(s => s.growthPercent !== null && s.growthPercent >= GROWTH_NOTABLE_THRESHOLD);
      if (!candidates.length) return null;
      const best = candidates.reduce((a, b) => (b.growthPercent! > a.growthPercent! ? b : a));
      return { id: 'best-growth', text: `${best.subjectName} accuracy improved by ${best.growthPercent}% over the last 30 days.` };
    },
  },
  {
    id: 'worst-decline',
    evaluate: (subjects) => {
      const candidates = subjects.filter(s => s.growthPercent !== null && s.growthPercent <= -GROWTH_NOTABLE_THRESHOLD);
      if (!candidates.length) return null;
      const worst = candidates.reduce((a, b) => (b.growthPercent! < a.growthPercent! ? b : a));
      return { id: 'worst-decline', text: `${worst.subjectName} accuracy has declined by ${Math.abs(worst.growthPercent!)}% over the last 30 days.` };
    },
  },
  {
    id: 'participation-declined',
    evaluate: (subjects) => {
      const candidates = subjects.filter(s => s.participationGrowthPercent !== null && s.participationGrowthPercent <= -GROWTH_NOTABLE_THRESHOLD);
      if (!candidates.length) return null;
      const worst = candidates.reduce((a, b) => (b.participationGrowthPercent! < a.participationGrowthPercent! ? b : a));
      return { id: 'participation-declined', text: `${worst.subjectName} participation has declined ${Math.abs(worst.participationGrowthPercent!)}% over the last 30 days.` };
    },
  },
  {
    id: 'highest-skip-rate',
    evaluate: (subjects) => {
      const withData = subjects.filter(s => s.totalQuestionsAttempted > 0);
      if (!withData.length) return null;
      const worst = withData.reduce((a, b) => (skipRatePercent(b) > skipRatePercent(a) ? b : a));
      if (skipRatePercent(worst) <= HIGH_SKIP_RATE_THRESHOLD) return null;
      return { id: 'highest-skip-rate', text: `${worst.subjectName} has the highest skip rate at ${skipRatePercent(worst)}%.` };
    },
  },
  {
    id: 'fastest-completion',
    evaluate: (subjects) => {
      const withData = subjects.filter(s => s.averageTimePerQuestionSec > 0);
      if (withData.length < 2) return null;
      const fastest = withData.reduce((a, b) => (b.averageTimePerQuestionSec < a.averageTimePerQuestionSec ? b : a));
      return { id: 'fastest-completion', text: `${fastest.subjectName} has the fastest average completion time at ${fastest.averageTimePerQuestionSec}s per question.` };
    },
  },
  {
    id: 'low-engagement',
    evaluate: (subjects) => {
      const candidates = subjects.filter(s => s.totalStudentsPracticed > 0 && s.totalStudentsNeverPracticed > s.totalStudentsPracticed);
      if (!candidates.length) return null;
      const worst = candidates.reduce((a, b) => (b.totalStudentsNeverPracticed > a.totalStudentsNeverPracticed ? b : a));
      return { id: 'low-engagement', text: `${worst.subjectName} has low engagement — ${worst.totalStudentsNeverPracticed} student(s) have never practiced it.` };
    },
  },
  {
    id: 'weakest-subject',
    evaluate: (subjects) => {
      const withData = subjects.filter(s => s.totalAttempts > 0);
      if (!withData.length) return null;
      const weakest = withData.reduce((a, b) => (b.accuracyPercent < a.accuracyPercent ? b : a));
      if (weakest.accuracyPercent >= WEAK_SUBJECT_ACCURACY_THRESHOLD) return null;
      return { id: 'weakest-subject', text: `${weakest.subjectName} needs attention — accuracy is only ${weakest.accuracyPercent}% across ${weakest.totalAttempts} attempts.` };
    },
  },
];

export function buildSubjectInsights(subjects: SubjectOverviewRow[]): SubjectInsight[] {
  return RULES.map(rule => rule.evaluate(subjects)).filter((x): x is SubjectInsight => x !== null);
}
