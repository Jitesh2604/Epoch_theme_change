import type { Request, Response } from '../core/types';
import { BookmarkService } from '../services/bookmark.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Role } from '../lib/enums';
import type { BookmarkBodyInput } from '../validators/bookmark.validator';

const param = (req: Request, key: string): string => req.params[key] as string;

export const BookmarkController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have bookmarks');

    const data = await BookmarkService.list(req.user.id);
    ApiResponse.ok(res, data);
  }),

  add: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have bookmarks');

    const { questionId } = req.body as BookmarkBodyInput;
    const result = await BookmarkService.add(req.user.id, questionId);
    ApiResponse.ok(res, result, 'Question bookmarked');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== Role.STUDENT) throw ApiError.forbidden('Only students have bookmarks');

    const result = await BookmarkService.remove(req.user.id, param(req, 'questionId'));
    ApiResponse.ok(res, result, 'Bookmark removed');
  }),
};
