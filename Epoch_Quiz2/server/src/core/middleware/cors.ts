/**
 * Native CORS middleware — replaces the `cors` package.
 */

import type { Handler } from '../types';

interface CorsOptions {
  /** Allowed origins. Function for dynamic validation; Set<string> for static list. */
  origins:        Set<string> | ((origin: string) => boolean);
  credentials?:   boolean;
  methods?:       string[];
  allowedHeaders?: string[];
  /** Preflight max-age in seconds. */
  maxAge?:        number;
}

export function cors(opts: CorsOptions): Handler {
  const methods       = (opts.methods       ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
  const allowedHeaders = (opts.allowedHeaders ?? ['Content-Type', 'Authorization', 'X-Requested-With']).join(', ');

  return (req, res, next) => {
    const origin = req.headers.origin as string | undefined;

    // Determine if origin is allowed
    let allowed = false;
    if (!origin) {
      allowed = true; // Same-origin / non-browser requests (Postman, curl, mobile)
    } else if (opts.origins instanceof Set) {
      allowed = opts.origins.has(origin);
    } else {
      allowed = opts.origins(origin);
    }

    if (!allowed && origin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'CORS', message: `Origin blocked by CORS policy` } }));
      return;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin',      origin);
      res.setHeader('Vary',                              'Origin');
    }
    if (opts.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Pre-flight response
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods',      methods);
      res.setHeader('Access-Control-Allow-Headers',      allowedHeaders);
      if (opts.maxAge) res.setHeader('Access-Control-Max-Age', String(opts.maxAge));
      res.writeHead(204);
      res.end();
      return;
    }

    // Regular request — expose headers
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders);

    next();
  };
}
