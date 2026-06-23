/**
 * JSON and URL-encoded body parsers using native streams.
 * Replaces express.json() and express.urlencoded().
 */

import type { Handler } from '../types';

const DEFAULT_LIMIT = 1 * 1024 * 1024; // 1 MB

function readBody(req: NodeJS.ReadableStream, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        (req as any).destroy?.();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted')));
  });
}

/** Parse application/json bodies. */
export function json(opts: { limit?: number } = {}): Handler {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return async (req, _res, next) => {
    const ct = (req.headers['content-type'] ?? '') as string;
    if (!ct.includes('application/json')) return next();
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    try {
      const raw = await readBody(req, limit);
      if (!raw.length) { req.body = {}; return next(); }
      req.body = JSON.parse(raw.toString('utf8'));
      next();
    } catch (err: any) {
      if (err?.message?.includes('JSON')) {
        const e = Object.assign(new SyntaxError('Malformed JSON body'), { body: true });
        return next(e);
      }
      next(err);
    }
  };
}

/** Parse application/x-www-form-urlencoded bodies. */
export function urlEncoded(opts: { limit?: number } = {}): Handler {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  return async (req, _res, next) => {
    const ct = (req.headers['content-type'] ?? '') as string;
    if (!ct.includes('application/x-www-form-urlencoded')) return next();
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    try {
      const raw = await readBody(req, limit);
      const params = new URLSearchParams(raw.toString('utf8'));
      const body: Record<string, string | string[]> = {};
      for (const [k, v] of params) {
        const cur = body[k];
        if (cur !== undefined) {
          body[k] = Array.isArray(cur) ? [...cur, v] : [cur, v];
        } else {
          body[k] = v;
        }
      }
      req.body = body;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Raw body reader — returns a Buffer. */
export function raw(opts: { limit?: number } = {}): Handler {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  return async (req, _res, next) => {
    try {
      req.body = await readBody(req, limit);
      next();
    } catch (err) {
      next(err);
    }
  };
}
