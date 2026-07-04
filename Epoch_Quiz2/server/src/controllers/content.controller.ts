import type { Request, Response } from '../core/types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { ContentSyncService } from '../services/content-sync.service';
import { isContentConfigured } from '../lib/contentClient';

export const ContentController = {
  /** Admin-only: run a full incremental synchronisation immediately. */
  sync: asyncHandler(async (_req: Request, res: Response) => {
    if (!isContentConfigured()) {
      throw ApiError.badRequest('CONTENT_API_KEY is not configured on the server.');
    }
    if (ContentSyncService.isRunning()) {
      throw ApiError.conflict('A content sync is already in progress.');
    }
    const result = await ContentSyncService.run('MANUAL');
    ApiResponse.ok(
      res,
      result,
      result.status === 'SUCCESS' ? 'Content sync completed' : 'Content sync completed with errors',
    );
  }),

  /** Admin-only: recent sync history. */
  logs: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.ok(res, await ContentSyncService.recentLogs(20));
  }),

  /** Admin-only: whether the SDK is configured / a sync is running. */
  status: asyncHandler(async (_req: Request, res: Response) => {
    ApiResponse.ok(res, { configured: isContentConfigured(), running: ContentSyncService.isRunning() });
  }),
};
