import type { Request, Response } from '../core/types';
import { SubjectAnalyticsService, type SubjectAnalyticsFilters } from '../services/subjectAnalytics.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';

function filtersFromQuery(query: Request['query']): SubjectAnalyticsFilters {
  return {
    classExternalId: typeof query.classExternalId === 'string' ? query.classExternalId : undefined,
    boardExternalId: typeof query.boardExternalId === 'string' ? query.boardExternalId : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === 'string' ? query.dateTo : undefined,
  };
}

export const SubjectAnalyticsController = {
  getOverview: asyncHandler(async (req: Request, res: Response) => {
    const data = await SubjectAnalyticsService.getSubjectOverview(filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getChapters: asyncHandler(async (req: Request, res: Response) => {
    const { subjectId } = req.params;
    const data = await SubjectAnalyticsService.getSubjectChapters(subjectId, filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),

  getTrends: asyncHandler(async (req: Request, res: Response) => {
    const { subjectId } = req.params;
    const granularity = req.query.granularity === 'monthly' ? 'monthly' : req.query.granularity === 'weekly' ? 'weekly' : null;
    if (!granularity) throw ApiError.badRequest('granularity must be "weekly" or "monthly"');
    const data = await SubjectAnalyticsService.getSubjectTrends(subjectId, granularity, filtersFromQuery(req.query));
    ApiResponse.ok(res, data);
  }),
};
