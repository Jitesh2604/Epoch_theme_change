import type { Request, Response } from '../core/types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { CatalogService } from '../services/catalog.service';

export const listBoards = asyncHandler(async (_req: Request, res: Response) => {
  const data = await CatalogService.listBoards();
  ApiResponse.ok(res, data);
});

export const listClasses = asyncHandler(async (_req: Request, res: Response) => {
  const data = await CatalogService.listClasses();
  ApiResponse.ok(res, data);
});

export const listSeries = asyncHandler(async (_req: Request, res: Response) => {
  const data = await CatalogService.listSeries();
  ApiResponse.ok(res, data);
});

export const listBooks = asyncHandler(async (req: Request, res: Response) => {
  const { boardId, classId, seriesId } = req.query as {
    boardId?: string;
    classId?: string;
    seriesId?: string;
  };
  const data = await CatalogService.listBooks({ boardId, classId, seriesId });
  ApiResponse.ok(res, data);
});

export const getTeacherByCode = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').trim().toUpperCase();
  if (!code) throw ApiError.badRequest('Teacher code is required');
  const data = await CatalogService.resolveTeacherCode(code);
  if (!data) throw ApiError.notFound('No teacher found for that code');
  ApiResponse.ok(res, data);
});
