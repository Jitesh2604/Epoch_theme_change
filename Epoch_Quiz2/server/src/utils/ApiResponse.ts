import type { Response } from '../core/types';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

export const ApiResponse = {
  ok<T>(res: Response, data: T, message?: string, meta?: unknown) {
    const body: SuccessEnvelope<T> = { success: true, data, ...(message ? { message } : {}), ...(meta ? { meta: meta as Record<string, unknown> } : {}) };
    return res.status(200).json(body);
  },

  created<T>(res: Response, data: T, message = 'Created') {
    const body: SuccessEnvelope<T> = { success: true, data, message };
    return res.status(201).json(body);
  },

  noContent(res: Response) {
    return res.status(204).send();
  },
};
