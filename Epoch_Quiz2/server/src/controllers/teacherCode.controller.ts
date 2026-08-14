import type { Request, Response } from '../core/types';
import { TeacherCodeService } from '../services/teacherCode.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  AdminCreateTeacherCodeInput,
  AdminUpdateTeacherCodeInput,
} from '../validators/teacherCode.validator';

const p = (req: Request, key: string): string => req.params[key] as string;

export const TeacherCodeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const items = await TeacherCodeService.list(includeInactive);
    ApiResponse.ok(res, items);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const tc = await TeacherCodeService.create(req.body as AdminCreateTeacherCodeInput);
    ApiResponse.created(res, tc, 'Teacher code created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const tc = await TeacherCodeService.update(p(req, 'id'), req.body as AdminUpdateTeacherCodeInput);
    ApiResponse.ok(res, tc, 'Teacher code updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const tc = await TeacherCodeService.deactivate(p(req, 'id'));
    ApiResponse.ok(res, tc, 'Teacher code deactivated');
  }),
};
