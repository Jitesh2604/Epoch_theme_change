import type { AssessmentTableRow, ClassPerformanceRow, AssessmentQuestionOverviewRow, TrendPoint } from '../hooks/useAssessmentAnalytics';

/**
 * Admin Analytics — Feature 5: Assessment-level AI Insights.
 *
 * Rule-based only, mirroring subjectInsightsEngine.ts's architecture: an
 * ordered list of rules, each inspecting already-fetched data (the
 * assessment table, class-wise rollup, question array, or monthly
 * participation trend) and either abstaining or returning an
 * evidence-backed sentence. Question-level insights (lowest success rate,
 * time outliers on individual questions, chapter concentration) are NOT
 * reimplemented here — buildQuestionInsights() from questionInsightsEngine.ts
 * is reused as-is on the same AssessmentQuestionOverviewRow[] array (it only
 * needs the QuestionOverviewRow-shaped fields, which this array has).
 */

export interface AssessmentInsight {
  id: string;
  text: string;
}

// Documented thresholds — only call out a signal large/consistent enough to
// be genuine, matching every other insights engine's evidence discipline.
export const PARTICIPATION_CHANGE_NOTABLE = 10; // percent, month-over-month
export const MIN_COMPLETED_FOR_CLASS_COMPARISON = 5;
export const MIN_ASSESSMENTS_FOR_ABANDONMENT_FLAG = 3; // minimum totalAttempts before flagging
export const HIGH_ABANDONMENT_THRESHOLD = 30; // percent
export const MIN_QUESTIONS_PER_SUBJECT_FOR_COMPARISON = 3;
export const SUBJECT_TIME_OUTLIER_MULTIPLIER = 1.5;

/** Small internal grouping helper — deliberately not the full rollupBy from
 *  QuestionAnalyticsPage.tsx (a page-local component helper), just the
 *  couple of sums this file's two subject-level rules need. Not a formula
 *  duplication — accuracy/time-per-question are still read directly off
 *  each already-computed AssessmentQuestionOverviewRow. */
function groupBySubject(questions: AssessmentQuestionOverviewRow[]) {
  const map = new Map<string, { subjectName: string; correct: number; wrong: number; timeSpentSec: number; attempts: number; questionCount: number }>();
  for (const q of questions) {
    const key = q.subjectId ?? '__none__';
    const entry = map.get(key) ?? { subjectName: q.subjectName, correct: 0, wrong: 0, timeSpentSec: 0, attempts: 0, questionCount: 0 };
    entry.correct += q.totalCorrect;
    entry.wrong += q.totalWrong;
    entry.timeSpentSec += q.totalTimeSpentSec;
    entry.attempts += q.totalAttempts;
    entry.questionCount += 1;
    map.set(key, entry);
  }
  return [...map.values()];
}

interface Rule {
  id: string;
  evaluate: (ctx: {
    assessments: AssessmentTableRow[];
    classPerformance: ClassPerformanceRow[];
    questions: AssessmentQuestionOverviewRow[];
    monthlyParticipation: TrendPoint[];
  }) => AssessmentInsight | null;
}

const RULES: Rule[] = [
  {
    id: 'participation-trend',
    evaluate: ({ monthlyParticipation }) => {
      const withData = monthlyParticipation.filter(p => p.count > 0);
      if (withData.length < 2) return null;
      const latest = monthlyParticipation[monthlyParticipation.length - 1];
      const prior = monthlyParticipation[monthlyParticipation.length - 2];
      if (prior.count <= 0) return null;
      const changePercent = Math.round(((latest.count - prior.count) / prior.count) * 100);
      if (Math.abs(changePercent) < PARTICIPATION_CHANGE_NOTABLE) return null;
      return {
        id: 'participation-trend',
        text: changePercent > 0
          ? `Assessment participation increased ${changePercent}% this month.`
          : `Assessment participation decreased ${Math.abs(changePercent)}% this month.`,
      };
    },
  },
  {
    id: 'best-class',
    evaluate: ({ classPerformance }) => {
      const eligible = classPerformance.filter(c => c.completedAttempts >= MIN_COMPLETED_FOR_CLASS_COMPARISON);
      if (eligible.length < 2) return null;
      const best = eligible.reduce((a, b) => (b.averageScore > a.averageScore ? b : a));
      return { id: 'best-class', text: `${best.className} achieved the highest average score (${best.averageScore}).` };
    },
  },
  {
    id: 'weakest-subject-accuracy',
    evaluate: ({ questions }) => {
      const groups = groupBySubject(questions).filter(g => g.questionCount >= MIN_QUESTIONS_PER_SUBJECT_FOR_COMPARISON);
      if (groups.length < 2) return null;
      const withAccuracy = groups.map(g => ({ ...g, accuracy: g.correct + g.wrong > 0 ? Math.round((g.correct / (g.correct + g.wrong)) * 100) : 0 }));
      const worst = withAccuracy.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
      return { id: 'weakest-subject-accuracy', text: `${worst.subjectName} contributed the lowest accuracy (${worst.accuracy}%) across assessments.` };
    },
  },
  {
    id: 'high-abandonment',
    evaluate: ({ assessments }) => {
      const candidates = assessments
        .filter(a => a.totalAttempts >= MIN_ASSESSMENTS_FOR_ABANDONMENT_FLAG)
        .map(a => ({ a, abandonmentRate: a.totalAttempts > 0 ? Math.round((a.incompleteAttempts / a.totalAttempts) * 100) : 0 }))
        .filter(x => x.abandonmentRate >= HIGH_ABANDONMENT_THRESHOLD);
      if (!candidates.length) return null;
      const worst = candidates.reduce((a, b) => (b.abandonmentRate > a.abandonmentRate ? b : a));
      return { id: 'high-abandonment', text: `${worst.a.title} has a very high abandonment rate (${worst.abandonmentRate}%).` };
    },
  },
  {
    id: 'subject-time-outlier',
    evaluate: ({ questions }) => {
      const groups = groupBySubject(questions).filter(g => g.questionCount >= MIN_QUESTIONS_PER_SUBJECT_FOR_COMPARISON && g.attempts > 0);
      if (groups.length < 2) return null;
      const withAvgTime = groups.map(g => ({ ...g, avgTime: g.timeSpentSec / g.attempts }));
      const overallAvg = withAvgTime.reduce((s, g) => s + g.avgTime, 0) / withAvgTime.length;
      if (overallAvg <= 0) return null;
      const outlier = withAvgTime.reduce((a, b) => (b.avgTime > a.avgTime ? b : a));
      if (outlier.avgTime < overallAvg * SUBJECT_TIME_OUTLIER_MULTIPLIER) return null;
      return { id: 'subject-time-outlier', text: `Students spend significantly more time on ${outlier.subjectName} questions than other subjects.` };
    },
  },
];

export function buildAssessmentInsights(
  assessments: AssessmentTableRow[],
  classPerformance: ClassPerformanceRow[],
  questions: AssessmentQuestionOverviewRow[],
  monthlyParticipation: TrendPoint[],
): AssessmentInsight[] {
  const ctx = { assessments, classPerformance, questions, monthlyParticipation };
  return RULES.map(rule => rule.evaluate(ctx)).filter((x): x is AssessmentInsight => x !== null);
}
