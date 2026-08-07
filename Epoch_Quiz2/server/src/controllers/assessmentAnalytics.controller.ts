import type { Request, Response } from '../core/types';
import { AssessmentOverviewService } from '../services/assessmentOverview.service';
import { AssessmentQuestionAnalyticsService } from '../services/assessmentQuestionAnalytics.service';
import { LeaderboardService } from '../services/leaderboard.service';
import type { Actor } from '../services/assessment.service';
import type { AssessmentAnalyticsFilters } from '../services/assessmentAnalyticsShared.service';
import type { AssessmentQuestionBankCountFilters } from '../services/assessmentQuestionAnalytics.service';
import { AssessmentStatus, Difficulty, QuestionType } from '../lib/enums';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const ASSESSMENT_STATUS_VALUES = new Set(Object.values(AssessmentStatus));
const DIFFICULTY_VALUES = new Set(Object.values(Difficulty));
const QUESTION_TYPE_VALUES = new Set(Object.values(QuestionType));

function bankCountFiltersFromQuery(query: Request['query']): AssessmentQuestionBankCountFilters {
  const difficulty = typeof query.difficulty === 'string' && DIFFICULTY_VALUES.has(query.difficulty as Difficulty)
    ? (query.difficulty as Difficulty) : undefined;
  const questionType = typeof query.questionType === 'string' && QUESTION_TYPE_VALUES.has(query.questionType as QuestionType)
    ? (query.questionType as QuestionType) : undefined;

  return {
    classExternalId: typeof query.classExternalId === 'string' ? query.classExternalId : undefined,
    subjectExternalId: typeof query.subjectExternalId === 'string' ? query.subjectExternalId : undefined,
    chapterExternalId: typeof query.chapterExternalId === 'string' ? query.chapterExternalId : undefined,
    difficulty,
    questionType,
  };
}

function filtersFromQuery(query: Request['query']): AssessmentAnalyticsFilters {
  const status = typeof query.status === 'string' && ASSESSMENT_STATUS_VALUES.has(query.status as AssessmentStatus)
    ? (query.status as AssessmentStatus) : undefined;

  return {
    classExternalId: typeof query.classExternalId === 'string' ? query.classExternalId : undefined,
    subjectExternalId: typeof query.subjectExternalId === 'string' ? query.subjectExternalId : undefined,
    assessmentId: typeof query.assessmentId === 'string' ? query.assessmentId : undefined,
    status,
    dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === 'string' ? query.dateTo : undefined,
  };
}

export const AssessmentAnalyticsController = {
  getOverview: asyncHandler(async (req: Request, res: Response) => {
    const data = await AssessmentOverviewService.getOverview(filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getTrends: asyncHandler(async (req: Request, res: Response) => {
    const granularity = req.query.granularity === 'monthly' ? 'monthly'
      : req.query.granularity === 'yearly' ? 'yearly'
      : req.query.granularity === 'weekly' ? 'weekly' : null;
    if (!granularity) throw ApiError.badRequest('granularity must be "weekly", "monthly", or "yearly"');
    const data = await AssessmentOverviewService.getAssessmentTrends(granularity, filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getQuestionOverview: asyncHandler(async (req: Request, res: Response) => {
    const data = await AssessmentQuestionAnalyticsService.getQuestionOverview(filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getQuestionBankCount: asyncHandler(async (req: Request, res: Response) => {
    const data = await AssessmentQuestionAnalyticsService.getBankCount(bankCountFiltersFromQuery(req.query));
    ApiResponse.ok(res, { count: data });
  }),

  // Reuses LeaderboardService.forAssessment unmodified — admin actors skip
  // the STUDENT-only gating branch, so this is a direct pass-through, not
  // new ranking logic.
  getAssessmentStudents: asyncHandler(async (req: Request, res: Response) => {
    const { items, assessment } = await LeaderboardService.forAssessment(
      actorFrom(req),
      req.params.assessmentId,
      { page: 1, limit: 500 },
    );
    ApiResponse.ok(res, { items, assessment });
  }),
};
