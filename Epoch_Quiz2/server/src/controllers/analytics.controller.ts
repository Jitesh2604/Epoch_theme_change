import type { Request, Response } from '../core/types';
import { AnalyticsService } from '../services/analytics.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Role } from '../lib/enums';

export const AnalyticsController = {
  getPracticeOverview: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have practice analytics');

    const data = await AnalyticsService.getPracticeOverview(req.user.id);
    ApiResponse.ok(res, data);
  }),

  getSubjectBreakdown: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have practice analytics');

    const data = await AnalyticsService.getSubjectBreakdown(req.user.id);
    ApiResponse.ok(res, data);
  }),

  getQuestionTypeBreakdown: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have practice analytics');

    const data = await AnalyticsService.getQuestionTypeBreakdown(req.user.id);
    ApiResponse.ok(res, data);
  }),

  getTopicBreakdown: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have practice analytics');

    const data = await AnalyticsService.getTopicBreakdown(req.user.id);
    ApiResponse.ok(res, data);
  }),
};
