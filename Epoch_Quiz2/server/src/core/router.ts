/**
 * Pure Node.js HTTP router.
 * Supports:
 *  - Method-specific routes (get / post / put / patch / delete)
 *  - Prefix middleware (use)
 *  - Nested routers (use('/path', subRouter))
 *  - Named route parameters (:id)
 *  - Error-handler middleware (4-arg functions)
 */

import type { AppRequest, AppResponse, NextFn, Handler, ErrorHandler, AnyHandler } from './types';

// ── Path → RegExp utility ─────────────────────────────────────────

interface ParsedPath {
  regexp:    RegExp;
  paramKeys: string[];
}

function parsePath(path: string, exact: boolean): ParsedPath {
  const paramKeys: string[] = [];
  const escaped = path
    // Escape everything except : * /
    .replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&')
    // Named params → capture group
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, key: string) => {
      paramKeys.push(key);
      return '([^/]+)';
    })
    // Wildcard
    .replace(/\*/g, '(.*)');

  const pattern = exact
    ? `^${escaped}/?$`
    : `^${escaped}(?:/|$)`;

  return { regexp: new RegExp(pattern, 'i'), paramKeys };
}

function extractParams(parsed: ParsedPath, path: string): Record<string, string> | null {
  const m = path.match(parsed.regexp);
  if (!m) return null;
  const params: Record<string, string> = {};
  parsed.paramKeys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
  return params;
}

/** Strip mountPath prefix from path; returns stripped path or null if no match. */
function stripPrefix(path: string, mountPath: string): string | null {
  if (mountPath === '' || mountPath === '/') return path;
  const re = new RegExp(`^${mountPath.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&')}(/|$)`, 'i');
  const m = path.match(re);
  if (!m) return null;
  const rest = path.slice(mountPath.length);
  return rest.startsWith('/') ? rest : '/' + rest || '/';
}

// ── Layer in the stack ────────────────────────────────────────────

interface Layer {
  method:    string;          // 'GET', 'POST', … or '*' (any)
  parsed:    ParsedPath;      // path → regexp + param keys
  exact:     boolean;         // false for use() layers
  handlers:  AnyHandler[];
}

// ── Router ────────────────────────────────────────────────────────

export class Router {
  private readonly _stack: Layer[] = [];

  private _add(method: string, path: string, exact: boolean, handlers: AnyHandler[]): this {
    this._stack.push({ method, parsed: parsePath(path, exact), exact, handlers });
    return this;
  }

  // Method-specific routes only accept regular handlers (not error handlers).
  // This lets TypeScript infer (req, res, next) types in inline lambdas.
  get(path: string, ...h: Handler[]):    this { return this._add('GET',    path, true,  h); }
  post(path: string, ...h: Handler[]):   this { return this._add('POST',   path, true,  h); }
  put(path: string, ...h: Handler[]):    this { return this._add('PUT',    path, true,  h); }
  patch(path: string, ...h: Handler[]):  this { return this._add('PATCH',  path, true,  h); }
  delete(path: string, ...h: Handler[]): this { return this._add('DELETE', path, true,  h); }

  /**
   * Mount middleware or a sub-router.
   * use(fn)               → global middleware, all methods + paths
   * use('/path', fn)      → path-prefix middleware
   * use('/path', router)  → mount sub-router at /path
   */
  use(pathOrFn: string | AnyHandler | Router, ...rest: (AnyHandler | Router)[]): this {
    if (pathOrFn instanceof Router) {
      // use(router) — mount at '/'
      const sub = pathOrFn;
      this._add('*', '', false, [this._mountHandler('', sub)]);
      for (const r of rest) {
        if (r instanceof Router) this._add('*', '', false, [this._mountHandler('', r)]);
        else                      this._add('*', '', false, [r]);
      }
      return this;
    }

    if (typeof pathOrFn === 'string') {
      const mp = pathOrFn.endsWith('/') ? pathOrFn.slice(0, -1) : pathOrFn;
      for (const item of rest) {
        if (item instanceof Router) {
          this._add('*', mp || '', false, [this._mountHandler(mp, item)]);
        } else {
          this._add('*', mp || '', false, [item]);
        }
      }
      return this;
    }

    // use(fn [, fn2, ...]) — global middleware
    const fns = [pathOrFn, ...rest] as AnyHandler[];
    this._add('*', '', false, fns);
    return this;
  }

  /** Wraps a sub-router with path-prefix stripping. */
  private _mountHandler(mountPath: string, subRouter: Router): Handler {
    return (req, res, next) => {
      const stripped = mountPath ? stripPrefix(req.path, mountPath) : req.path;
      if (stripped === null) return next();

      const savedPath = req.path;
      req.path = stripped || '/';

      subRouter.handle(req, res, (err?: unknown) => {
        req.path = savedPath;
        next(err);
      });
    };
  }

  /** Dispatch a request through this router's stack. */
  handle(req: AppRequest, res: AppResponse, done: NextFn): void {
    const method = (req.method ?? 'GET').toUpperCase();

    // Build a flat execution list from matching layers
    type StackEntry = { fn: AnyHandler; params: Record<string, string> };
    const flat: StackEntry[] = [];

    for (const layer of this._stack) {
      // Method filter (HEAD falls back to GET)
      const methodOk =
        layer.method === '*' ||
        layer.method === method ||
        (method === 'HEAD' && layer.method === 'GET');
      if (!methodOk) continue;

      // Path match
      const params = extractParams(layer.parsed, req.path);
      if (params === null) continue;

      for (const fn of layer.handlers) {
        flat.push({ fn, params });
      }
    }

    let i = 0;

    const next = (err?: unknown): void => {
      if (i >= flat.length) return done(err);

      const { fn, params } = flat[i++];
      const isErrFn = fn.length === 4;

      // Merge params into req
      if (Object.keys(params).length) {
        req.params = { ...req.params, ...params };
      }

      if (err !== undefined) {
        // In error mode — only call 4-arg error handlers
        if (isErrFn) {
          try {
            (fn as ErrorHandler)(err, req, res, next);
          } catch (e) {
            next(e);
          }
        } else {
          next(err); // pass error along, skip regular handler
        }
      } else {
        // Normal mode — only call 3-arg handlers
        if (!isErrFn) {
          try {
            const result = (fn as Handler)(req, res, next);
            if (result instanceof Promise) result.catch(next);
          } catch (e) {
            next(e);
          }
        } else {
          next(); // skip error handler in normal mode
        }
      }
    };

    next();
  }
}
