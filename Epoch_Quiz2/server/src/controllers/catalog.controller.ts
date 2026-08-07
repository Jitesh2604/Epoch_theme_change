import type { Request, Response } from '../core/types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
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
