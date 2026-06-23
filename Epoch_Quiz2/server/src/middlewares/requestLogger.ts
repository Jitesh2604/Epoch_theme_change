/**
 * HTTP request logger — replaces morgan.
 * Logs method, URL, status, response time, and content-length using native Date.
 */

import type { Handler } from '../core/types';
import { logger } from '../utils/logger';
import { isProd } from '../config';

export const requestLogger: Handler = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const ms      = Date.now() - start;
    const status  = res.statusCode;
    const method  = (req.method ?? 'GET').padEnd(7);
    const url     = req.originalUrl ?? req.url ?? '/';
    const len     = res.getHeader('Content-Length') ?? '-';

    if (isProd) {
      // Apache "combined"-style for production
      const ip   = req.ip ?? '-';
      const ref  = (req.headers.referer as string | undefined) ?? '-';
      const ua   = (req.headers['user-agent'] as string | undefined) ?? '-';
      logger.http(`${ip} - "${method} ${url} HTTP/1.1" ${status} ${len} "${ref}" "${ua}" +${ms}ms`);
    } else {
      // Colourised dev output
      const color =
        status >= 500 ? '\x1b[31m' :   // red
        status >= 400 ? '\x1b[33m' :   // yellow
        status >= 300 ? '\x1b[36m' :   // cyan
                        '\x1b[32m';    // green
      const reset = '\x1b[0m';
      logger.http(`${color}${method}${reset} ${url} ${color}${status}${reset} ${ms}ms - ${len}`);
    }
  });

  next();
};
