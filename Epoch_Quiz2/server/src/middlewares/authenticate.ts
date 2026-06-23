import type { Request, Response, NextFunction } from '../core/types';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

/**
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches
 * a minimal user payload to `req.user`. Throws 401 on any failure.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization as string | undefined;
  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or invalid Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) return next(ApiError.unauthorized('Missing access token'));

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Access token expired', { code: 'TOKEN_EXPIRED' }));
    }
    return next(ApiError.unauthorized('Invalid access token'));
  }
}
