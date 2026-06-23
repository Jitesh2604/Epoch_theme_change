import type { Request, Response, NextFunction } from '../core/types';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { isProd } from '../config';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.unprocessable(
      'Validation failed',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    );
  } else if (isMysqlError(err)) {
    apiError = mapMysqlError(err as { code: string; errno: number });
  } else if ((err as any)?.code === 'LIMIT_FILE_SIZE') {
    apiError = ApiError.badRequest('File is too large (max 5 MB)');
  } else if (err instanceof SyntaxError && 'body' in (err as any)) {
    apiError = ApiError.badRequest('Malformed JSON body');
  } else {
    const message = err instanceof Error ? err.message : 'Internal server error';
    apiError = ApiError.internal(message);
  }

  if (!apiError.isOperational || apiError.statusCode >= 500) {
    logger.error(
      `${apiError.statusCode} ${apiError.code} — ${apiError.message}\n${(err as Error)?.stack ?? ''}`
    );
  } else {
    logger.warn(`${apiError.statusCode} ${apiError.code} — ${apiError.message}`);
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(!isProd && !apiError.isOperational ? { stack: (err as Error)?.stack } : {}),
    },
  });
}

function isMysqlError(err: unknown): boolean {
  return typeof (err as any)?.code === 'string' && typeof (err as any)?.errno === 'number';
}

function mapMysqlError(err: { code: string; errno: number }): ApiError {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return ApiError.conflict('Duplicate entry — record already exists');
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED_2':
      return ApiError.badRequest('Foreign key constraint failed');
    default:
      return new ApiError(500, `Database error (${err.code})`);
  }
}
