/**
 * Security headers middleware — replaces `helmet`.
 */

import type { Handler } from '../types';

interface SecurityOptions {
  /** Enable strict Content-Security-Policy (production). */
  csp?:  boolean;
  /** Enable HSTS header (production). */
  hsts?: boolean;
}

export function security(opts: SecurityOptions = {}): Handler {
  return (_req, res, next) => {
    // Remove server identity
    res.removeHeader('X-Powered-By');

    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Enable XSS filtering in older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Disable browser feature APIs
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (opts.csp) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "font-src 'self'",
          "object-src 'none'",
          "upgrade-insecure-requests",
        ].join('; '),
      );
    }

    if (opts.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}
