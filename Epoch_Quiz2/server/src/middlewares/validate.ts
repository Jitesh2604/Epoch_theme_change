import type { Request, Response, NextFunction } from '../core/types';
import type { ZodSchema } from 'zod';

type Target = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware.
 * Replaces req[target] with the parsed (typed) value on success;
 * Zod errors are forwarded to the global error handler.
 */
export const validate =
  (schema: ZodSchema, target: Target = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Reassign parsed/coerced value so handlers consume typed data.
    (req as any)[target] = result.data;
    next();
  };
