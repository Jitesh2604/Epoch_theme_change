/**
 * JWT utilities using only the native `crypto` module.
 * Supports HS256 signing and verification (the only algorithm used by this app).
 * Replaces the `jsonwebtoken` package.
 */

import { createHmac, timingSafeEqual, createHash } from 'crypto';
import type { Role } from '../lib/enums';
import { env } from '../config';

// ── Base64URL helpers ─────────────────────────────────────────────

function toBase64Url(input: Buffer | string): string {
  const b64 = Buffer.isBuffer(input)
    ? input.toString('base64')
    : Buffer.from(input, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// ── Duration parser ───────────────────────────────────────────────

export function parseDurationMs(s: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(s.trim());
  if (!m) throw new Error(`Invalid duration string: "${s}"`);
  const n = Number(m[1]);
  const table: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * table[m[2]];
}

function durationToSeconds(s: string): number {
  return Math.floor(parseDurationMs(s) / 1000);
}

// ── Token types ───────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub:   string;   // user id
  email: string;
  role:  Role;
  type:  'access';
  iat?:  number;
  exp?:  number;
}

export interface RefreshTokenPayload {
  sub:  string;   // user id
  jti:  string;   // token id
  type: 'refresh';
  iat?: number;
  exp?: number;
}

type SignableUser = { id: string; email: string; role: Role };

// ── Signing ───────────────────────────────────────────────────────

function sign(payload: Record<string, unknown>, secret: string, expiresIn: string): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now    = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + durationToSeconds(expiresIn) };
  const body   = toBase64Url(JSON.stringify(claims));
  const sig    = toBase64Url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function signAccessToken(user: SignableUser): string {
  return sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    env.JWT_ACCESS_EXPIRES_IN,
  );
}

export function signRefreshToken(user: Pick<SignableUser, 'id'>, jti: string): string {
  return sign(
    { sub: user.id, jti, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    env.JWT_REFRESH_EXPIRES_IN,
  );
}

// ── Verification ──────────────────────────────────────────────────

class JwtError extends Error {
  constructor(message: string, public readonly code: 'EXPIRED' | 'INVALID' | 'MALFORMED') {
    super(message);
    // Mirror jsonwebtoken error.name so existing catch blocks keep working
    this.name = code === 'EXPIRED' ? 'TokenExpiredError' : 'JsonWebTokenError';
  }
}

function verify<T>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed JWT', 'MALFORMED');

  const [header, body, signature] = parts;

  // Timing-safe signature verification prevents timing attacks
  const expected = toBase64Url(
    createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  const sigBuf = Buffer.from(signature, 'ascii');
  const expBuf = Buffer.from(expected,  'ascii');

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new JwtError('Invalid token signature', 'INVALID');
  }

  let payload: any;
  try {
    payload = JSON.parse(fromBase64Url(body));
  } catch {
    throw new JwtError('Cannot decode JWT payload', 'MALFORMED');
  }

  if (payload.exp !== undefined && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new JwtError('Token has expired', 'EXPIRED');
  }

  return payload as T;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verify<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET);
  if (payload.type !== 'access') throw new JwtError('Wrong token type', 'INVALID');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verify<RefreshTokenPayload>(token, env.JWT_REFRESH_SECRET);
  if (payload.type !== 'refresh') throw new JwtError('Wrong token type', 'INVALID');
  return payload;
}

/** SHA-256 hash of a refresh token — never store the raw token. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
