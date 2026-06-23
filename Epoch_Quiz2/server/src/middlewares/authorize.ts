import type { Request, Response, NextFunction } from '../core/types';
import type { Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';

/**
 * Role-based authorization. Must run after `authenticate`.
 *   router.get('/admin/only', authenticate, authorize('ADMIN'), handler)
 *   router.post('/staff',    authenticate, authorize('ADMIN', 'TEACHER'), handler)
 */
export const authorize =
  (...allowed: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role ${req.user.role} is not permitted`));
    }
    next();
  };
