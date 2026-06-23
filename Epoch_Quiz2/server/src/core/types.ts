/**
 * Core type definitions for the native HTTP framework.
 * Exported names mirror Express so controllers need only a path change, not logic changes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Role } from '../lib/enums';

// ── User attached by authenticate middleware ──────────────────────
export interface UserPayload {
  id:    string;
  email: string;
  role:  Role;
  avatarHue?: number;
}

// ── Uploaded file (multer-compatible shape) ───────────────────────
export interface UploadedFile {
  fieldname:    string;
  originalname: string;
  mimetype:     string;
  buffer:       Buffer;
  size:         number;
}

// ── Cookie options ────────────────────────────────────────────────
export interface CookieOptions {
  maxAge?:   number;
  expires?:  Date;
  httpOnly?: boolean;
  secure?:   boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?:     string;
  domain?:   string;
}

// ── Extended request ──────────────────────────────────────────────
export interface AppRequest extends IncomingMessage {
  /** Parsed request body (JSON / url-encoded). */
  body:        any;
  /** Route path parameters, e.g. { id: "abc" }. */
  params:      Record<string, string>;
  /** Parsed query string as key → string | string[]. */
  query:       Record<string, string | string[]>;
  /** Attached by authenticate middleware. */
  user?:       UserPayload;
  /** Single uploaded file (from multipart middleware). */
  file?:       UploadedFile;
  /** Multiple uploaded files. */
  files?:      UploadedFile[];
  /** Parsed cookies. */
  cookies:     Record<string, string>;
  /** Client IP (respects X-Forwarded-For). */
  ip:          string;
  /** Pathname only (no query string); stripped as we descend into sub-routers. */
  path:        string;
  /** Original full URL, never mutated. */
  originalUrl: string;
  method:      string;
}

// ── Extended response ─────────────────────────────────────────────
export interface AppResponse extends ServerResponse {
  /** Chainable status code setter. */
  status(code: number): this;
  /** Send a JSON body. */
  json(data: unknown): void;
  /** Send a body (Buffer, string, or object). */
  send(data?: Buffer | string | object | null): void;
  /** HTTP redirect. */
  redirect(url: string, statusCode?: number): void;
  /** Set a Set-Cookie header. Chainable. */
  cookie(name: string, value: string, options?: CookieOptions): this;
  /** Clear a cookie. Chainable. */
  clearCookie(name: string, options?: CookieOptions): this;
}

// ── Middleware types ──────────────────────────────────────────────
export type NextFn        = (err?: unknown) => void;
export type Handler       = (req: AppRequest, res: AppResponse, next: NextFn) => void | Promise<void>;
export type ErrorHandler  = (err: unknown, req: AppRequest, res: AppResponse, next: NextFn) => void;
export type AnyHandler    = Handler | ErrorHandler;

// ── Express-compatible aliases so existing controllers compile
//    with only an import-path change. ──────────────────────────────
export type Request        = AppRequest;
export type Response       = AppResponse;
export type NextFunction   = NextFn;
export type RequestHandler = Handler;
