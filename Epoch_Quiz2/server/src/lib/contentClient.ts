/**
 * Singleton Epoch Content SDK client.
 *
 * The SDK is initialised exactly once, from environment variables. The API key
 * is NEVER hardcoded and never leaves the backend. A timeout is layered on top
 * of the SDK's plain `fetch` (the SDK has no built-in timeout) via a custom
 * fetch implementation using AbortController.
 */
import https from 'node:https';
import { EpochContentClient } from '@epochstudio/content-client';
import { env } from '../config';
import { logger } from '../utils/logger';

/** Wrap the global fetch with an abort-based timeout. */
function timeoutFetch(timeoutMs: number): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await (globalThis.fetch as any)(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as unknown as typeof fetch;
}

/**
 * A fetch that connects to a fixed IP while preserving the TLS SNI and Host
 * header of the original hostname. Only used when CONTENT_RESOLVE_IP is set,
 * for environments where the API host does not resolve via DNS.
 */
function resolvingFetch(ip: string, timeoutMs: number): typeof fetch {
  return ((urlStr: any, init: any = {}) => new Promise((resolve, reject) => {
    const u = new URL(String(urlStr));
    const req = https.request(
      {
        host: ip,
        servername: u.hostname,
        port: u.port || 443,
        method: init.method || 'GET',
        path: u.pathname + u.search,
        headers: { ...(init.headers || {}), Host: u.hostname },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage ?? '',
            json: async () => JSON.parse(body),
            text: async () => body,
          } as any);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Request to ${u.hostname} timed out`)));
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  })) as unknown as typeof fetch;
}

let _client: EpochContentClient | null = null;

/** True when a content API key is configured (sync enabled). */
export function isContentConfigured(): boolean {
  return Boolean(env.CONTENT_API_KEY);
}

/**
 * Return the shared client, creating it on first use. Throws if the API key is
 * not configured — callers should guard with `isContentConfigured()` first.
 */
export function getContentClient(): EpochContentClient {
  if (!env.CONTENT_API_KEY) {
    throw new Error('CONTENT_API_KEY is not configured — content sync is disabled.');
  }
  if (!_client) {
    const fetchImpl = env.CONTENT_RESOLVE_IP
      ? resolvingFetch(env.CONTENT_RESOLVE_IP, env.CONTENT_HTTP_TIMEOUT_MS)
      : timeoutFetch(env.CONTENT_HTTP_TIMEOUT_MS);
    _client = new EpochContentClient({
      apiKey:  env.CONTENT_API_KEY,
      baseUrl: env.CONTENT_BASE_URL,
      fetch:   fetchImpl,
    });
    logger.info(`[content] SDK client initialised (baseUrl=${env.CONTENT_BASE_URL}${env.CONTENT_RESOLVE_IP ? `, pinned→${env.CONTENT_RESOLVE_IP}` : ''})`);
  }
  return _client;
}
