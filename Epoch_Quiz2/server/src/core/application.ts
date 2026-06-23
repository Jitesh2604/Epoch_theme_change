/**
 * Native HTTP Application.
 * Wraps Node.js http.createServer() with a Router-based middleware pipeline.
 * API is intentionally Express-compatible so existing code migrates with
 * only import-path changes.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';
import { URL } from 'url';
import type { AppRequest, AppResponse, CookieOptions } from './types';
import { Router } from './router';

// ── Response helpers ──────────────────────────────────────────────

function augmentResponse(raw: ServerResponse): AppResponse {
  const res = raw as AppResponse;

  res.status = function (code) {
    this.statusCode = code;
    return this;
  };

  res.json = function (data) {
    if (this.headersSent) return;
    const body = JSON.stringify(data);
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
    this.end(body);
  };

  res.send = function (data?) {
    if (this.headersSent) return;
    if (data == null) { this.end(); return; }
    if (Buffer.isBuffer(data)) {
      this.setHeader('Content-Length', data.length);
      this.end(data);
    } else if (typeof data === 'object') {
      this.json(data);
    } else {
      const body = String(data);
      if (!this.hasHeader('Content-Type')) this.setHeader('Content-Type', 'text/plain; charset=utf-8');
      this.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
      this.end(body);
    }
  };

  res.redirect = function (url, code = 302) {
    this.writeHead(code, { Location: url });
    this.end();
  };

  res.cookie = function (name, value, opts: CookieOptions = {}) {
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
    if (opts.maxAge   != null)  parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.expires)           parts.push(`Expires=${opts.expires.toUTCString()}`);
    parts.push(`Path=${opts.path ?? '/'}`);
    if (opts.domain)            parts.push(`Domain=${opts.domain}`);
    if (opts.httpOnly)          parts.push('HttpOnly');
    if (opts.secure)            parts.push('Secure');
    if (opts.sameSite) {
      const ss = opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1);
      parts.push(`SameSite=${ss}`);
    }
    const existing = this.getHeader('Set-Cookie');
    const prev: string[] = Array.isArray(existing) ? existing : existing ? [existing as string] : [];
    this.setHeader('Set-Cookie', [...prev, parts.join('; ')]);
    return this;
  };

  res.clearCookie = function (name, opts: CookieOptions = {}) {
    return (this as AppResponse).cookie(name, '', {
      ...opts,
      expires: new Date(0),
      maxAge: 0,
    });
  };

  return res;
}

// ── Request helpers ───────────────────────────────────────────────

function augmentRequest(raw: IncomingMessage): AppRequest {
  const req = raw as AppRequest;
  const base = 'http://localhost'; // we only need pathname + search
  const parsed = new URL(req.url ?? '/', base);

  req.originalUrl = req.url ?? '/';
  req.path        = parsed.pathname;
  req.params      = {};
  req.body        = undefined;
  req.file        = undefined;
  req.files       = undefined;
  req.user        = undefined;
  req.ip          =
    ((req.headers['x-forwarded-for'] as string | undefined) ?? '')
      .split(',')[0]
      .trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  // Query string
  req.query = {};
  parsed.searchParams.forEach((value, key) => {
    const current = req.query[key];
    if (current !== undefined) {
      req.query[key] = Array.isArray(current) ? [...current, value] : [current as string, value];
    } else {
      req.query[key] = value;
    }
  });

  // Cookies
  req.cookies = {};
  const cookieHeader = req.headers.cookie ?? '';
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k) {
        try { req.cookies[k] = decodeURIComponent(v); }
        catch { req.cookies[k] = v; }
      }
    }
  }

  return req;
}

// ── Application ───────────────────────────────────────────────────

export class Application {
  private readonly _router: Router;

  constructor() {
    this._router = new Router();
  }

  // Delegate routing methods to the internal router
  use(...args: Parameters<Router['use']>): this {
    (this._router.use as Function)(...args);
    return this;
  }

  /** Creates a native http.Server and starts listening. */
  listen(port: number, callback?: () => void): Server {
    const server = createServer((rawReq, rawRes) => {
      const req = augmentRequest(rawReq);
      const res = augmentResponse(rawRes);

      // Final fallback when nothing handles the request
      this._router.handle(req, res, (err?: unknown) => {
        if (res.headersSent) return;
        if (err) {
          const code = (err as any)?.statusCode ?? 500;
          res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            error: {
              code: (err as any)?.code ?? 'INTERNAL_ERROR',
              message: (err as any)?.message ?? 'Internal server error',
            },
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Route not found' },
          }));
        }
      });
    });

    server.listen(port, callback);
    return server;
  }
}
