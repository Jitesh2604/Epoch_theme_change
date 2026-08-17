import type { Request, Response } from '../core/types';
import { SchoolAnalyticsService } from '../services/schoolAnalytics.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type { SchoolAnalyticsQuery } from '../validators/schoolPanel.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

function branchIdFrom(req: Request): string | undefined {
  const q = req.query as unknown as SchoolAnalyticsQuery;
  return q.branchId;
}

export const SchoolAnalyticsController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolAnalyticsService.overview(actorFrom(req), branchIdFrom(req));
    ApiResponse.ok(res, data);
  }),

  subjectWise: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolAnalyticsService.subjectBreakdown(actorFrom(req), branchIdFrom(req));
    ApiResponse.ok(res, data);
  }),

  difficultyWise: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolAnalyticsService.difficultyBreakdown(actorFrom(req), branchIdFrom(req));
    ApiResponse.ok(res, data);
  }),

  improvementTrend: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolAnalyticsService.improvementTrend(actorFrom(req), branchIdFrom(req));
    ApiResponse.ok(res, data);
  }),

  topics: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolAnalyticsService.topicInsights(actorFrom(req), branchIdFrom(req));
    ApiResponse.ok(res, data);
  }),
};
