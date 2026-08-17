import { api } from '../lib/api';
import { useAsync } from './useApi';

// School-level Analytics — the school-scoped analog of useStudentAnalytics,
// but sourced from Assessment Submission/Answer data (see
// server/src/services/schoolAnalytics.service.ts). branchId narrows within
// the caller's own (server-resolved) school; never a raw client schoolId.

export type SchoolAnalyticsOverview =
  | { hasData: false }
  | {
      hasData: true;
      assessmentsAttempted: number;
      studentsAttempted: number;
      participationPercent: number;
      averageScore: number;
      averagePercentage: number;
      totalCorrect: number;
      totalWrong: number;
      totalSkipped: number;
      accuracyPercent: number;
    };

export function useSchoolAnalyticsOverview(branchId?: string) {
  return useAsync<SchoolAnalyticsOverview>(
    () => api.getWithQuery('/school-panel/analytics/overview', { branchId }),
    [branchId],
  );
}

export interface SchoolSubjectStat {
  subjectId: string;
  subjectName: string;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averagePercentage: number;
}

export function useSchoolSubjectBreakdown(branchId?: string) {
  return useAsync<SchoolSubjectStat[]>(
    () => api.getWithQuery('/school-panel/analytics/subject-wise', { branchId }),
    [branchId],
  );
}

export interface SchoolDifficultyStat {
  difficulty: string;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
}

export function useSchoolDifficultyBreakdown(branchId?: string) {
  return useAsync<SchoolDifficultyStat[]>(
    () => api.getWithQuery('/school-panel/analytics/difficulty-wise', { branchId }),
    [branchId],
  );
}

export interface SchoolImprovementPoint {
  session: string;
  date: string;
  averagePercentage: number;
}

export function useSchoolImprovementTrend(branchId?: string) {
  return useAsync<SchoolImprovementPoint[]>(
    () => api.getWithQuery('/school-panel/analytics/improvement-trend', { branchId }),
    [branchId],
  );
}

export interface SchoolTopicStat {
  topicId: string;
  topicName: string;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
}

export interface SchoolTopicInsights {
  strongest: SchoolTopicStat[];
  weakest: SchoolTopicStat[];
}

export function useSchoolTopicInsights(branchId?: string) {
  return useAsync<SchoolTopicInsights>(
    () => api.getWithQuery('/school-panel/analytics/topics', { branchId }),
    [branchId],
  );
}
