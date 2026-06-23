/**
 * Multipart form-data parser — replaces `multer`.
 * Returns a middleware that parses one file field and attaches it to req.file.
 * File data is stored in memory (Buffer), matching multer.memoryStorage() behaviour.
 */

import type { Handler, UploadedFile } from '../types';
import type { IncomingMessage } from 'http';

const CRLF     = Buffer.from('\r\n');
const CRLFCRLF = Buffer.from('\r\n\r\n');

// ── Buffer utilities ──────────────────────────────────────────────

/** Returns the index of `needle` in `haystack` starting at `offset`, or -1. */
function indexOf(haystack: Buffer, needle: Buffer, offset = 0): number {
  outer: for (let i = offset; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ── Multipart parser ──────────────────────────────────────────────

interface ParseResult {
  file?:   UploadedFile;
  fields:  Record<string, string>;
}

function parseMultipart(body: Buffer, boundary: string): ParseResult {
  const boundaryBuf  = Buffer.from('--' + boundary);
  const result: ParseResult = { fields: {} };
  let pos = 0;

  while (pos < body.length) {
    const bStart = indexOf(body, boundaryBuf, pos);
    if (bStart === -1) break;

    pos = bStart + boundaryBuf.length;

    // Final boundary ends with --
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;

    // Skip the CRLF after the boundary marker
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

    // Header section ends at \r\n\r\n
    const headerEnd = indexOf(body, CRLFCRLF, pos);
    if (headerEnd === -1) break;

    const headerBlock = body.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4; // skip \r\n\r\n

    // Data ends just before the next boundary (minus the preceding \r\n)
    const nextBound = indexOf(body, boundaryBuf, pos);
    const dataEnd   = nextBound !== -1 ? nextBound - 2 : body.length;
    const data      = body.slice(pos, dataEnd);
    pos = nextBound !== -1 ? nextBound : body.length;

    // Parse headers
    const headers: Record<string, string> = {};
    for (const line of headerBlock.split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        headers[line.slice(0, colon).toLowerCase().trim()] = line.slice(colon + 1).trim();
      }
    }

    const disposition = headers['content-disposition'] ?? '';
    const nameMw      = disposition.match(/\bname="([^"]*)"/i);
    const filenameMw  = disposition.match(/\bfilename="([^"]*)"/i);

    if (filenameMw) {
      result.file = {
        fieldname:    nameMw?.[1] ?? 'file',
        originalname: filenameMw[1],
        mimetype:     headers['content-type'] ?? 'application/octet-stream',
        buffer:       data,
        size:         data.length,
      };
    } else if (nameMw) {
      result.fields[nameMw[1]] = data.toString('utf8');
    }
  }

  return result;
}

// ── Raw body reader ───────────────────────────────────────────────

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
        (req as any).destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Multer-compatible middleware factory ──────────────────────────

interface UploadOptions {
  /** Max file size in bytes (default 5 MB). */
  maxFileSize?: number;
  /** Allowed MIME types or file extensions. If empty, all are accepted. */
  allowedMime?: Set<string>;
  allowedExt?:  RegExp;
}

/** Returns a single-file upload middleware similar to multer().single(fieldName). */
export function singleUpload(fieldName: string, opts: UploadOptions = {}): Handler {
  const {
    maxFileSize = 5 * 1024 * 1024,
    allowedMime = new Set<string>(),
    allowedExt,
  } = opts;

  return async (req, _res, next) => {
    const ct = (req.headers['content-type'] ?? '') as string;
    if (!ct.startsWith('multipart/form-data')) return next();

    const boundaryMatch = ct.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      return next(Object.assign(new Error('Missing multipart boundary'), { statusCode: 400 }));
    }

    try {
      const body   = await readBody(req, maxFileSize * 2); // generous limit for the full body
      const result = parseMultipart(body, boundaryMatch[1]);

      if (result.file) {
        const { originalname, mimetype, size } = result.file;

        // Size check
        if (size > maxFileSize) {
          return next(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
        }

        // MIME / extension check
        const mimeOk = !allowedMime.size || allowedMime.has(mimetype);
        const extOk  = !allowedExt || allowedExt.test(originalname);
        if (!mimeOk && !extOk) {
          return next(Object.assign(new Error(`Unsupported file type: ${mimetype}`), { statusCode: 400 }));
        }

        if (result.file.fieldname === fieldName || fieldName === '*') {
          req.file = result.file;
        }
      }

      // Attach remaining text fields to body
      if (Object.keys(result.fields).length) {
        req.body = { ...(req.body ?? {}), ...result.fields };
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
