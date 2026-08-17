import type { Request, Response, NextFunction } from '../core/types';
import { Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { BranchCodeService } from '../services/branchCode.service';

/**
 * Assessment (not Practice) access gate — must run after `authenticate`.
 * Replaces the earlier per-class "Class Code" gate: a student now unlocks
 * Assessment by VERIFYING their already-selected School+Branch with a real
 * Branch Code (see BranchCodeService.verify) — having schoolId/branchId
 * set from registration alone is never sufficient. Only STUDENT is gated —
 * admin/school-admin roles already pass `authorize` on this route for
 * testing/preview and have no branch-verification concept themselves.
 */
export async function requireBranchVerification(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== Role.STUDENT) return next();

  const verified = await BranchCodeService.studentIsVerified(req.user.id);
  if (!verified) {
    return next(ApiError.forbidden('A valid Branch Code is required to access Assessment.'));
  }
  next();
}
