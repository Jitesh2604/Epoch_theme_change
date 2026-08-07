import type { Request, Response } from '../core/types';
import { QuestionAnalyticsService, type QuestionAnalyticsFilters } from '../services/questionAnalytics.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Difficulty, QuestionType } from '../lib/enums';

const DIFFICULTY_VALUES = new Set(Object.values(Difficulty));
const QUESTION_TYPE_VALUES = new Set(Object.values(QuestionType));

function filtersFromQuery(query: Request['query']): QuestionAnalyticsFilters {
  const difficulty = typeof query.difficulty === 'string' && DIFFICULTY_VALUES.has(query.difficulty as Difficulty)
    ? (query.difficulty as Difficulty) : undefined;
  const questionType = typeof query.questionType === 'string' && QUESTION_TYPE_VALUES.has(query.questionType as QuestionType)
    ? (query.questionType as QuestionType) : undefined;

  return {
    classExternalId: typeof query.classExternalId === 'string' ? query.classExternalId : undefined,
    boardExternalId: typeof query.boardExternalId === 'string' ? query.boardExternalId : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === 'string' ? query.dateTo : undefined,
    subjectExternalId: typeof query.subjectExternalId === 'string' ? query.subjectExternalId : undefined,
    chapterExternalId: typeof query.chapterExternalId === 'string' ? query.chapterExternalId : undefined,
    difficulty,
    questionType,
  };
}

export const QuestionAnalyticsController = {
  getOverview: asyncHandler(async (req: Request, res: Response) => {
    const data = await QuestionAnalyticsService.getQuestionOverview(filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getTrends: asyncHandler(async (req: Request, res: Response) => {
    const { questionId } = req.params;
    const granularity = req.query.granularity === 'monthly' ? 'monthly' : req.query.granularity === 'weekly' ? 'weekly' : null;
    if (!granularity) throw ApiError.badRequest('granularity must be "weekly" or "monthly"');
    const data = await QuestionAnalyticsService.getQuestionTrends(questionId, granularity, filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getBankCount: asyncHandler(async (req: Request, res: Response) => {
    const data = await QuestionAnalyticsService.getBankCount(filtersFromQuery(req.query));
    ApiResponse.ok(res, { count: data });
  }),
};
