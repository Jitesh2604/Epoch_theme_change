import { api } from '../lib/api';
import { useAsync } from './useApi';
import type { QuestionOverviewRow } from './useQuestionAnalytics';

// Admin Analytics — Feature 5: Assessment Analytics. Assessment module only
// (Assessment/Submission/Answer) — never Practice Olympiad data. See
// server/src/services/assessmentOverview.service.ts /
// assessmentQuestionAnalytics.service.ts for the exact scope/rules.

export interface AssessmentAnalyticsFilters {
  classExternalId?: string;
  subjectExternalId?: string;
  assessmentId?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  dateFrom?: string;
  dateTo?: string;
}

export interface SubmissionStats {
  totalAttempts: number;
  completedAttempts: number;
  incompleteAttempts: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  lowestScore: number;
  medianScore: number;
  stdDeviationScore: number;
  passRate: number;
  failRate: number;
  averageCompletionTimeSec: number;
}

export interface AssessmentKPIs extends SubmissionStats {
  totalAssessments: number;
  draftAssessments: number;
  publishedAssessments: number;
  activeAssessments: number;
  closedAssessments: number;
}

export interface AssessmentTableRow extends SubmissionStats {
  assessmentId: string;
  title: string;
  classId: string | null;
  className: string;
  subjectId: string | null;
  subjectName: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  totalQuestions: number;
  studentsAssigned: number;
  studentsAttempted: number;
  studentsCompleted: number;
  participationRate: number;
}

export interface ClassPerformanceRow extends SubmissionStats {
  classId: string | null;
  className: string;
  totalAssessments: number;
  studentsAssigned: number;
  studentsAttempted: number;
  participationRate: number;
}

export interface AssessmentOverviewResponse {
  kpis: AssessmentKPIs;
  assessments: AssessmentTableRow[];
  classPerformance: ClassPerformanceRow[];
}

export interface TrendPoint { date: string; count: number }

export interface AssessmentTrends {
  attemptsOverTime: TrendPoint[];
  averageScoreOverTime: TrendPoint[];
  participationOverTime: TrendPoint[];
  passRateOverTime: TrendPoint[];
}

/** Field-for-field the same shape as QuestionOverviewRow (Feature 4) plus
 *  pendingGrading — so classifyQuestionQuality()/buildQuestionInsights()
 *  work on this array unmodified. */
export interface AssessmentQuestionOverviewRow extends QuestionOverviewRow {
  pendingGrading: number;
}

export interface AssessmentStudentRow {
  rank: number;
  studentId: string;
  studentName: string;
  avatarHue: number;
  score: number;
  totalMarks: number;
  percent: number;
  timeTakenSec: number;
  submittedAt: string | null;
  status: string;
  passed: boolean;
}

export interface AssessmentStudentsResponse {
  items: AssessmentStudentRow[];
  assessment: { id: string; title: string; totalMarks: number; passingMarks: number };
}

/** Feature 7: bank-count has its own small filter shape — unlike
 *  AssessmentAnalyticsFilters (used by getQuestionOverview), it supports
 *  chapter/difficulty/type since a bank size count is scoped structurally,
 *  not by assessment/status/date. Mirrors questionAnalytics.service.ts's
 *  getBankCount filters on the Practice side. */
export interface AssessmentQuestionBankCountFilters {
  classExternalId?: string;
  subjectExternalId?: string;
  chapterExternalId?: string;
  difficulty?: string;
  questionType?: string;
}

function toQuery(filters: AssessmentAnalyticsFilters) {
  return {
    classExternalId: filters.classExternalId,
    subjectExternalId: filters.subjectExternalId,
    assessmentId: filters.assessmentId,
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}

export function useAssessmentOverview(filters: AssessmentAnalyticsFilters) {
  return useAsync<AssessmentOverviewResponse>(
    () => api.getWithQuery('/admin-analytics/assessments', toQuery(filters)),
    [filters.classExternalId, filters.subjectExternalId, filters.assessmentId, filters.status, filters.dateFrom, filters.dateTo],
  );
}

export const assessmentAnalyticsApi = {
  getTrends: (granularity: 'weekly' | 'monthly' | 'yearly', filters: AssessmentAnalyticsFilters) =>
    api.getWithQuery<AssessmentTrends>('/admin-analytics/assessments/trends', { granularity, ...toQuery(filters) }),

  getQuestionOverview: (filters: AssessmentAnalyticsFilters) =>
    api.getWithQuery<AssessmentQuestionOverviewRow[]>('/admin-analytics/assessments/questions', toQuery(filters)),

  getAssessmentStudents: (assessmentId: string) =>
    api.get<AssessmentStudentsResponse>(`/admin-analytics/assessments/${assessmentId}/students`),

  getQuestionBankCount: (filters: AssessmentQuestionBankCountFilters) =>
    api.getWithQuery<{ count: number }>('/admin-analytics/assessments/questions/bank-count', { ...filters }),
};
