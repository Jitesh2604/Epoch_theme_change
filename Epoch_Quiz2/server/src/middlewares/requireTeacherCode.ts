import type { Request, Response, NextFunction } from '../core/types';
import { Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { TeacherCodeService } from '../services/teacherCode.service';

/**
 * Assessment (not Practice) access gate — must run after `authenticate`.
 * Re-validates the student's saved teacherCode against the live
 * TeacherCode catalog on every call (not just "is the profile field
 * non-null"), so this can't be bypassed by calling the API directly, and a
 * later-deactivated code immediately revokes access. Only STUDENT is
 * gated — admin roles already pass `authorize` on this route for
 * testing/preview and have no teacherCode concept themselves.
 */
export async function requireTeacherCode(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== Role.STUDENT) return next();

  const ok = await TeacherCodeService.studentHasValidCode(req.user.id);
  if (!ok) {
    return next(ApiError.forbidden('A valid teacher code is required to access Assessment.'));
  }
  next();
}
