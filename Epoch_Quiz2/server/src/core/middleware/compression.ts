/**
 * Gzip/deflate response compression — replaces the `compression` package.
 * Uses native `zlib` streams.
 */

import { createGzip, createDeflate, createBrotliCompress } from 'zlib';
import type { Handler } from '../types';

// Content types worth compressing (text, JSON, etc.)
const COMPRESSIBLE = /^text\/|application\/(json|javascript|xml|x-www-form-urlencoded)|image\/svg\+xml/i;

// Don't compress small responses
const MIN_SIZE = 1024; // 1 KB

export function compression(): Handler {
  return (req, res, next) => {
    const accept = (req.headers['accept-encoding'] as string | undefined) ?? '';

    const supportsGzip    = accept.includes('gzip');
    const supportsBrotli  = accept.includes('br');
    const supportsDeflate = accept.includes('deflate');

    if (!supportsGzip && !supportsBrotli && !supportsDeflate) {
      return next();
    }

    // Override res.end to intercept and compress the body
    const origEnd   = res.end.bind(res);
    const origWrite = res.write.bind(res);

    const chunks: Buffer[] = [];
    let compressStarted = false;

    const shouldCompress = (): boolean => {
      if (compressStarted) return false;
      const ct = (res.getHeader('Content-Type') as string | undefined) ?? '';
      const cl = res.getHeader('Content-Length');
      if (cl && Number(cl) < MIN_SIZE) return false;
      return COMPRESSIBLE.test(ct);
    };

    res.write = function (chunk: any, ...args: any[]) {
      if (!shouldCompress()) return origWrite(chunk, ...args);
      if (!compressStarted) {
        compressStarted = true;
        res.removeHeader('Content-Length');
      }
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    } as typeof res.write;

    res.end = function (chunk?: any, ...args: any[]) {
      if (!shouldCompress() || !compressStarted && !chunk) {
        return origEnd(chunk, ...args);
      }

      if (!compressStarted) compressStarted = true;
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

      const body = Buffer.concat(chunks);
      if (body.length < MIN_SIZE) {
        return origEnd(body);
      }

      const pick = supportsBrotli ? 'br' : supportsGzip ? 'gzip' : 'deflate';
      const stream = pick === 'br'
        ? createBrotliCompress()
        : pick === 'gzip'
          ? createGzip()
          : createDeflate();

      res.setHeader('Content-Encoding', pick);
      res.removeHeader('Content-Length');

      const compressed: Buffer[] = [];
      stream.on('data', (d: Buffer) => compressed.push(d));
      stream.on('end', () => origEnd(Buffer.concat(compressed)));
      stream.write(body);
      stream.end();

      return res;
    } as typeof res.end;

    next();
  };
}
