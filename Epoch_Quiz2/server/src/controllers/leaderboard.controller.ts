import type { Request, Response } from '../core/types';
import { LeaderboardService } from '../services/leaderboard.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type {
  AssessmentLeaderboardQuery,
  GlobalLeaderboardQuery,
} from '../validators/leaderboard.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const LeaderboardController = {
  forAssessment: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta, assessment } = await LeaderboardService.forAssessment(
      actorFrom(req),
      p(req, 'id'),
      req.query as unknown as AssessmentLeaderboardQuery,
    );
    ApiResponse.ok(res, items, undefined, { ...meta, assessment });
  }),

  global: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await LeaderboardService.global(
      actorFrom(req),
      req.query as unknown as GlobalLeaderboardQuery,
    );
    ApiResponse.ok(res, items, undefined, meta);
  }),

  myStats: asyncHandler(async (req: Request, res: Response) => {
    const out = await LeaderboardService.myStats(actorFrom(req));
    ApiResponse.ok(res, out);
  }),
};
