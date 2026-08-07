import type { ClassAnalyticsRow } from './classAnalyticsAggregation';

/**
 * Admin Analytics — Feature 8: Class-level AI Insights.
 *
 * Same ordered-rule-list architecture as studentPerformanceInsights.ts /
 * learningInsightsEngine.ts — each rule inspects only the already-computed
 * ClassAnalyticsRow[] (no fetch, no recomputation) and either abstains or
 * contributes one evidence-backed line.
 *
 * The spec's 5th example ("Assessment participation dropped this week")
 * needs a week-over-week comparison, which would require either a
 * per-class bucketed trend fetch (N+1 — one call per class) or a platform-
 * wide one. This engine stays synchronous and per-class; the platform-wide
 * participation-trend line is composed separately in ClassAnalyticsPage.tsx
 * from a single extra getAssessmentTrends('weekly', {}) call, then merged
 * into the same insights list for display — still real data, just fetched
 * once instead of per class.
 */

const MIN_CLASSES_FOR_COMPARISON = 2;
const MIN_STUDENTS_FOR_SUBJECT_COMPARISON = 3;

function ruleBestOverallClass(rows: ClassAnalyticsRow[]): string | null {
  const eligible = rows.filter(r => r.overallScorePercent !== null);
  if (eligible.length < MIN_CLASSES_FOR_COMPARISON) return null;
  const best = eligible.reduce((a, b) => (b.overallScorePercent! > a.overallScorePercent! ? b : a));
  return `${best.className} has the highest overall performance at ${best.overallScorePercent}%.`;
}

function ruleWeakestSubjectIntervention(rows: ClassAnalyticsRow[]): string | null {
  let worst: { className: string; subjectName: string; avgAccuracy: number } | null = null;
  for (const row of rows) {
    const eligibleSubjects = row.subjects.filter(s => s.participation >= MIN_STUDENTS_FOR_SUBJECT_COMPARISON);
    if (!eligibleSubjects.length) continue;
    const weakest = eligibleSubjects.reduce((a, b) => (b.avgAccuracy < a.avgAccuracy ? b : a));
    if (!worst || weakest.avgAccuracy < worst.avgAccuracy) {
      worst = { className: row.className, subjectName: weakest.subjectName, avgAccuracy: weakest.avgAccuracy };
    }
  }
  if (!worst) return null;
  return `${worst.className} needs intervention in ${worst.subjectName} (${worst.avgAccuracy}% accuracy).`;
}

function ruleHighestParticipation(rows: ClassAnalyticsRow[]): string | null {
  const eligible = rows.filter(r => r.totalStudents > 0);
  if (eligible.length < MIN_CLASSES_FOR_COMPARISON) return null;
  const best = eligible.reduce((a, b) =>
    (b.activeStudents / b.totalStudents) > (a.activeStudents / a.totalStudents) ? b : a);
  const rate = Math.round((best.activeStudents / best.totalStudents) * 100);
  return `${best.className} has the highest practice participation at ${rate}%.`;
}

function ruleSubjectImproved(rows: ClassAnalyticsRow[]): string | null {
  let best: { className: string; subjectName: string } | null = null;
  for (const row of rows) {
    const improved = row.subjects.find(s => s.trendDirection === 'Improving' && s.participation >= MIN_STUDENTS_FOR_SUBJECT_COMPARISON);
    if (improved) { best = { className: row.className, subjectName: improved.subjectName }; break; }
  }
  if (!best) return null;
  return `${best.subjectName} performance has improved in ${best.className}.`;
}

export function buildClassInsights(rows: ClassAnalyticsRow[]): string[] {
  const rules = [ruleBestOverallClass, ruleWeakestSubjectIntervention, ruleHighestParticipation, ruleSubjectImproved];
  return rules.map(rule => rule(rows)).filter((line): line is string => line !== null);
}
