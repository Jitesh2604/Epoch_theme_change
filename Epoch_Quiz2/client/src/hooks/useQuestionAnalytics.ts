import { api } from '../lib/api';
import { useAsync } from './useApi';

// Admin Analytics — Feature 4: Question Analytics. Practice Olympiad only,
// platform-wide grouped by individual question — see server/src/services/
// questionAnalytics.service.ts for the exact scope/rules.

export interface QuestionAnalyticsFilters {
  classExternalId?: string;
  boardExternalId?: string;
  dateFrom?: string;
  dateTo?: string;
  subjectExternalId?: string;
  chapterExternalId?: string;
  difficulty?: string;
  questionType?: string;
}

export interface QuestionOverviewRow {
  questionId: string;
  promptPreview: string;
  subjectId: string | null;
  subjectName: string;
  chapterId: string | null;
  chapterName: string | null;
  difficulty: string;
  questionType: string;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  successRatePercent: number;
  wrongRatePercent: number;
  skipRatePercent: number;
  totalTimeSpentSec: number;
  averageTimeSpentSec: number;
  lastAttemptedDate: string;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface QuestionTrends {
  attemptsOverTime: TrendPoint[];
  successRateOverTime: TrendPoint[];
  skipRateOverTime: TrendPoint[];
}

function toQuery(filters: QuestionAnalyticsFilters) {
  return {
    classExternalId: filters.classExternalId,
    boardExternalId: filters.boardExternalId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    subjectExternalId: filters.subjectExternalId,
    chapterExternalId: filters.chapterExternalId,
    difficulty: filters.difficulty,
    questionType: filters.questionType,
  };
}

export function useQuestionOverview(filters: QuestionAnalyticsFilters) {
  return useAsync<QuestionOverviewRow[]>(
    () => api.getWithQuery('/admin-analytics/questions', toQuery(filters)),
    [
      filters.classExternalId, filters.boardExternalId, filters.dateFrom, filters.dateTo,
      filters.subjectExternalId, filters.chapterExternalId, filters.difficulty, filters.questionType,
    ],
  );
}

export const questionAnalyticsApi = {
  getTrends: (questionId: string, granularity: 'weekly' | 'monthly', filters: QuestionAnalyticsFilters) =>
    api.getWithQuery<QuestionTrends>(`/admin-analytics/questions/${questionId}/trends`, { granularity, ...toQuery(filters) }),

  /** Feature 7: total Practice question bank size matching structural
   *  filters — see questionAnalytics.service.ts's getBankCount for why this
   *  can't be derived from the per-question overview array. */
  getBankCount: (filters: QuestionAnalyticsFilters) =>
    api.getWithQuery<{ count: number }>('/admin-analytics/questions/bank-count', toQuery(filters)),
};
