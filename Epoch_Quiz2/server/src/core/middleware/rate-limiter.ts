/**
 * In-memory sliding-window rate limiter — replaces `express-rate-limit`.
 * Uses a per-IP counter that resets after `windowMs`.
 * Periodically purges expired entries to avoid unbounded memory growth.
 */

import type { Handler } from '../types';

interface RateLimitOptions {
  windowMs:                number;
  max:                     number;
  message?:                unknown;
  standardHeaders?:        boolean;
  skipSuccessfulRequests?: boolean;
}

interface Entry {
  count:   number;
  resetAt: number; // epoch ms
}

export function rateLimit(opts: RateLimitOptions): Handler {
  const {
    windowMs,
    max,
    standardHeaders = true,
    skipSuccessfulRequests = false,
    message = {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down.' },
    },
  } = opts;

  const store = new Map<string, Entry>();

  // Purge expired entries every minute to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, 60_000);
  cleanup.unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;
    const remaining = Math.max(0, max - entry.count);

    if (standardHeaders) {
      res.setHeader('RateLimit-Limit',     max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset',     Math.ceil(entry.resetAt / 1000));
    }

    if (entry.count > max) {
      res.status(429).json(message);
      return;
    }

    if (skipSuccessfulRequests) {
      // Decrement counter after a successful response
      const orig = res.end.bind(res);
      res.end = function (...args: any[]) {
        if ((res as any).statusCode < 400) {
          entry!.count = Math.max(0, entry!.count - 1);
        }
        return orig(...args);
      } as typeof res.end;
    }

    next();
  };
}

export default rateLimit;
