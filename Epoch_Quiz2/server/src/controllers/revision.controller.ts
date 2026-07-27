import type { Request, Response } from '../core/types';
import { RevisionService } from '../services/revision.service';
import { QuizService } from '../services/quiz.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Role } from '../lib/enums';

export const RevisionController = {
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have a revision center');

    const data = await RevisionService.getDashboard(req.user.id);
    ApiResponse.ok(res, data);
  }),

  /** Feature 13 — "Start Today's Revision". Attempt creation stays owned by
   *  QuizService (same as every other mode); this just hands off to it. */
  start: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have a revision center');

    const result = await QuizService.startRevisionSession(req.user.id);
    ApiResponse.created(res, result, 'Revision session started');
  }),
};
