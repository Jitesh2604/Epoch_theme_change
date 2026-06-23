import type { Request, Response } from '../core/types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { SettingsService } from '../services/settings.service';

export const SettingsController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await SettingsService.getAll();
    ApiResponse.ok(res, settings);
  }),

  getCategory: asyncHandler(async (req: Request, res: Response) => {
    const category = Array.isArray(req.params.category) ? req.params.category[0] : req.params.category;
    const settings = await SettingsService.getByCategory(category);
    ApiResponse.ok(res, settings);
  }),

  updateMany: asyncHandler(async (req: Request, res: Response) => {
    const updates = req.body as Record<string, string>;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw ApiError.badRequest('Request body must be an object mapping keys to values');
    }
    await SettingsService.setMany(updates);
    const updated = await SettingsService.getAll();
    ApiResponse.ok(res, updated, 'Settings saved');
  }),
};
