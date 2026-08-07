import type { PracticeOverviewData, SubjectStat, QuestionTypeStat } from '../hooks/useStudentAnalytics';
import type { StudentCandidate, StudentBulkInsight } from '../hooks/useStudentPerformance';
import { computeConfidence } from './confidenceScore';
import { deriveInsights } from './strengthWeaknessInsights';
import { deriveAccuracyInsights } from './accuracyInsights';
import { computeStreak, practiceDatesFromOverview } from './studyPlanEngine';
import { evaluateAtRisk, AT_RISK_ASSESSMENT_AVG_THRESHOLD } from './atRiskDetection';
import { classifyStudentPerformance, type PerformanceGrade } from './studentPerformanceGrade';

/**
 * Admin Analytics — Feature 6/8: per-student row derivation.
 *
 * Extracted from StudentPerformancePage.tsx (Feature 6) so Feature 8 (Class
 * Analytics) can group the exact same already-computed per-student numbers
 * by class, instead of re-deriving accuracy/trend/at-risk/grade — those all
 * need per-student PracticeOverviewData/ConfidenceResult inputs that don't
 * exist at class granularity, so the correct reuse is "compute once per
 * student here, then aggregate the result," not "recompute at class level."
 * Pure move — no logic changed from the original StudentPerformancePage.tsx.
 */

export type Trend = 'Improving' | 'Stable' | 'Declining';

/** "Active" window for the Active-Students KPI / DAU-style activity read —
 *  same 7-day cutoff Feature 2 already used for its "active" status filter
 *  option, reused by Feature 8's class-level activity rollup too. */
export const ACTIVE_WINDOW_DAYS = 7;
/** "Inactive" window — matches Feature 2's existing "> 30d or never" wording. */
export const INACTIVE_WINDOW_DAYS = 30;

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
  lastLoginAt: string | null;
  hasData: boolean;
  totalAttempts: number;
  totalQuestionsSolved: number;
  averageScore: number;
  accuracyPercent: number;
  averageTimePerQuestionSec: number;
  totalPracticeTimeSec: number;
  lastPracticeDate: string | null;
  practiceStreak: number;
  revisionStreak: number;
  confidenceScore: number | null;
  confidenceBand: string | null;
  strongestSubject: string | null;
  weakestSubject: string | null;
  subjectIds: string[];
  /** Full SubjectStat[] (not narrowed) — Feature 8 needs averageScore/
   *  firstAttemptAccuracy/latestAttemptAccuracy for its per-class Subject
   *  Comparison and "subject improved" insight; every SubjectAccuracyPoint
   *  consumer (Feature 6's own platform-wide Subject Comparison card) still
   *  works unmodified since SubjectStat is a strict superset of that shape. */
  subjects: SubjectStat[];
  trend: Trend | null;
  practiceTrendDeltaPercent: number | null;
  atRisk: boolean;
  atRiskReasons: string[];
  // Feature 6 — Assessment side
  assessmentAttempts: number;
  assessmentCompletedAttempts: number;
  assessmentAveragePercent: number | null;
  assessmentAverageScore: number | null;
  assessmentPassRate: number | null;
  lastAssessmentDate: string | null;
  assessmentSubjectIds: string[];
  // Feature 6 — merged
  lastActiveDate: string | null;
  grade: PerformanceGrade | null;
  gradeReasons: string[];
}

export function latestDate(...dates: (string | null)[]): string | null {
  const valid = dates.filter((d): d is string => d !== null);
  if (!valid.length) return null;
  return valid.reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));
}

export function buildRow(candidate: StudentCandidate, insight: StudentBulkInsight | undefined): StudentRow {
  const base = {
    id: candidate.id, name: candidate.name, email: candidate.email,
    avatarHue: candidate.avatarHue, classExternalId: candidate.classExternalId,
    className: candidate.className, lastLoginAt: candidate.lastLoginAt,
  };

  const assessment = insight?.assessment ?? null;
  const assessmentAttempts = assessment?.totalAttempts ?? 0;
  const assessmentCompletedAttempts = assessment?.completedAttempts ?? 0;
  const assessmentAveragePercent = assessment && assessmentCompletedAttempts > 0 ? assessment.averagePercentage : null;
  const assessmentAverageScore = assessment && assessmentCompletedAttempts > 0 ? assessment.averageScore : null;
  const assessmentPassRate = assessment && assessmentCompletedAttempts > 0 ? assessment.passRate : null;
  const lastAssessmentDate = assessment?.lastAssessmentDate ?? null;
  const assessmentSubjectIds = assessment?.subjectIds ?? [];

  const overview = insight?.overview;
  if (!insight || !overview || overview.hasData === false) {
    // No practice attempts at all — always flagged at-risk (unchanged
    // Feature 2 invariant: a student with zero engagement is never "on
    // track"). If they do have Assessment history, that reason is added
    // rather than replacing the practice-side reason — both are real.
    const reasons = ['Never practiced'];
    if (assessmentAveragePercent !== null && assessmentAveragePercent < AT_RISK_ASSESSMENT_AVG_THRESHOLD) {
      reasons.push(`Assessment average is ${assessmentAveragePercent}%, below the ${AT_RISK_ASSESSMENT_AVG_THRESHOLD}% at-risk threshold.`);
    }
    const grade = classifyStudentPerformance({ atRisk: true, atRiskReasons: reasons, accuracyPercent: null, assessmentAveragePercent });

    return {
      ...base,
      hasData: false,
      totalAttempts: 0, totalQuestionsSolved: 0, averageScore: 0, accuracyPercent: 0,
      averageTimePerQuestionSec: 0, totalPracticeTimeSec: 0, lastPracticeDate: null,
      practiceStreak: 0, revisionStreak: insight?.revisionStreak.currentStreak ?? 0,
      confidenceScore: null, confidenceBand: null,
      strongestSubject: null, weakestSubject: null, subjectIds: [], subjects: [],
      trend: null, practiceTrendDeltaPercent: null,
      atRisk: true, atRiskReasons: reasons,
      assessmentAttempts, assessmentCompletedAttempts, assessmentAveragePercent, assessmentAverageScore,
      assessmentPassRate, lastAssessmentDate, assessmentSubjectIds,
      lastActiveDate: latestDate(candidate.lastLoginAt, lastAssessmentDate),
      grade: grade.grade, gradeReasons: grade.reasons,
    };
  }

  const data: PracticeOverviewData = overview;
  const subjects: SubjectStat[] = insight.subjects;
  const questionTypes: QuestionTypeStat[] = insight.questionTypes;

  const confidence = computeConfidence(data, subjects, questionTypes);
  const strengthWeakness = deriveInsights(subjects);
  const accuracyInsights = deriveAccuracyInsights(data);
  const practiceDates = practiceDatesFromOverview(data);
  const streak = computeStreak(practiceDates, new Set(), new Date());
  const atRisk = evaluateAtRisk({ overview: data, confidence, assessmentAveragePercent });

  const trend: Trend =
    accuracyInsights.trendDirection === 'improved' ? 'Improving' :
    accuracyInsights.trendDirection === 'declined' ? 'Declining' : 'Stable';

  const grade = classifyStudentPerformance({
    atRisk: atRisk.atRisk, atRiskReasons: atRisk.reasons,
    accuracyPercent: data.accuracyPercent, assessmentAveragePercent,
  });

  return {
    ...base,
    hasData: true,
    totalAttempts: data.totalAttempts,
    totalQuestionsSolved: data.totalQuestionsAttempted,
    averageScore: data.averageScore,
    accuracyPercent: data.accuracyPercent,
    averageTimePerQuestionSec: data.averageTimePerQuestionSec,
    totalPracticeTimeSec: data.totalPracticeTimeSec,
    lastPracticeDate: data.lastPracticeDate,
    practiceStreak: streak.currentStreak,
    revisionStreak: insight.revisionStreak.currentStreak,
    confidenceScore: confidence.score,
    confidenceBand: confidence.band,
    strongestSubject: strengthWeakness?.strongest.subjectName ?? null,
    weakestSubject: strengthWeakness?.weakest.subjectName ?? null,
    subjectIds: subjects.map(s => s.subjectId),
    subjects,
    trend, practiceTrendDeltaPercent: accuracyInsights.trendDeltaPercent,
    atRisk: atRisk.atRisk, atRiskReasons: atRisk.reasons,
    assessmentAttempts, assessmentCompletedAttempts, assessmentAveragePercent, assessmentAverageScore,
    assessmentPassRate, lastAssessmentDate, assessmentSubjectIds,
    lastActiveDate: latestDate(candidate.lastLoginAt, data.lastPracticeDate, lastAssessmentDate),
    grade: grade.grade, gradeReasons: grade.reasons,
  };
}

export function daysSince(dateIso: string | null, now: number): number | null {
  if (!dateIso) return null;
  return Math.floor((now - new Date(dateIso).getTime()) / 86_400_000);
}
