import type { Request, Response } from '../core/types';
import { NotificationService } from '../services/notification.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import type { Actor } from '../services/assessment.service';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const NotificationController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const n = await NotificationService.create(actorFrom(req), req.body);
    ApiResponse.created(res, n, 'Notification created');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await NotificationService.list(actorFrom(req), req.query as any);
    ApiResponse.ok(res, items, undefined, meta);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const n = await NotificationService.findById(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, n);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await NotificationService.remove(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, { ok: true }, 'Notification deleted');
  }),
};
