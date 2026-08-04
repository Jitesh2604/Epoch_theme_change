import { api } from '../lib/api';
import { useAsync } from './useApi';

// Admin Analytics — Feature 3: Subject Analytics. Practice Olympiad only,
// platform-wide grouped by subject — see server/src/services/
// subjectAnalytics.service.ts for the exact scope/rules.

export interface SubjectAnalyticsFilters {
  classExternalId?: string;
  boardExternalId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SubjectDifficultyBreakdown {
  EASY: number | null;
  MEDIUM: number | null;
  HARD: number | null;
}

export interface SubjectOverviewRow {
  subjectId: string;
  subjectName: string;
  totalStudentsPracticed: number;
  totalStudentsNeverPracticed: number;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageScore: number;
  averageTimePerQuestionSec: number;
  lastActivityDate: string | null;
  difficulty: SubjectDifficultyBreakdown;
  growthPercent: number | null;
  participationGrowthPercent: number | null;
}

export interface SubjectOverviewResponse {
  subjects: SubjectOverviewRow[];
  totalStudentsOnPlatform: number;
}

export interface SubjectChapterRow {
  topicId: string;
  topicName: string;
  totalAttempts: number;
  accuracyPercent: number;
  averageScore: number;
  averageTimePerQuestionSec: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface SubjectTrends {
  accuracyOverTime: TrendPoint[];
  attemptsOverTime: TrendPoint[];
  participationOverTime: TrendPoint[];
}

function toQuery(filters: SubjectAnalyticsFilters) {
  return {
    classExternalId: filters.classExternalId,
    boardExternalId: filters.boardExternalId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}

export function useSubjectOverview(filters: SubjectAnalyticsFilters) {
  return useAsync<SubjectOverviewResponse>(
    () => api.getWithQuery('/admin-analytics/subjects', toQuery(filters)),
    [filters.classExternalId, filters.boardExternalId, filters.dateFrom, filters.dateTo],
  );
}

export const subjectAnalyticsApi = {
  getChapters: (subjectId: string, filters: SubjectAnalyticsFilters) =>
    api.getWithQuery<SubjectChapterRow[]>(`/admin-analytics/subjects/${subjectId}/chapters`, toQuery(filters)),

  getTrends: (subjectId: string, granularity: 'weekly' | 'monthly', filters: SubjectAnalyticsFilters) =>
    api.getWithQuery<SubjectTrends>(`/admin-analytics/subjects/${subjectId}/trends`, { granularity, ...toQuery(filters) }),
};
