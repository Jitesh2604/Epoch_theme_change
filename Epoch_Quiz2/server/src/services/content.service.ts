/**
 * Content service — the ONLY layer in the app that talks to the Epoch Content
 * API. Everything else (catalog/subject/question/… services, controllers) goes
 * through here so SDK usage is never scattered.
 *
 * The Content API is the SINGLE SOURCE OF TRUTH for catalog metadata
 * (boards / classes / subjects / series / books / chapters). This layer:
 *   - fetches catalog live from the API,
 *   - retries transient failures with backoff,
 *   - keeps a SHORT-LIVED in-memory TTL cache to avoid hammering the API,
 *   - exposes external-ID → metadata resolvers used by the rest of the backend
 *     to transform stored external IDs into display names.
 *
 * It NEVER writes catalog data to MySQL. There is no synchronisation, no
 * mirror, no persistence of catalog rows anywhere.
 */
import {
  AuthenticationError,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  EpochContentError,
  type Board,
  type Standard,
  type Subject,
  type Series,
  type Book,
  type Chapter,
  type Question,
  type BookFilters,
  type QuestionFilters,
  type PaginatedQuestions,
} from '@epochstudio/content-client';
import { getContentClient, isContentConfigured } from '../lib/contentClient';
import { env } from '../config';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors that should NOT be retried (the request itself is the problem). */
function isFatal(err: unknown): boolean {
  if (err instanceof AuthenticationError || err instanceof ValidationError ||
      err instanceof ForbiddenError || err instanceof NotFoundError) return true;
  const status = (err as EpochContentError)?.status;
  // Retry 429 (rate limit) and 5xx; treat other 4xx as fatal.
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxRetries = env.CONTENT_MAX_RETRIES;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isFatal(err) || attempt > maxRetries) break;
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      logger.warn(`[content] ${label} failed (attempt ${attempt}/${maxRetries + 1}): ${(err as Error).message} — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// ── Short-lived TTL cache ─────────────────────────────────────────────────
// Purely a performance aid to reduce repeated API calls. NOT a database mirror:
// entries live in memory only and expire after CONTENT_CACHE_TTL_MS.

interface CacheEntry<T> { value: T; expires: number }
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const ttl = env.CONTENT_CACHE_TTL_MS;
  const now = Date.now();
  if (ttl > 0) {
    const hit = cache.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expires > now) return hit.value;
  }
  const value = await fn();
  if (ttl > 0) cache.set(key, { value, expires: now + ttl });
  return value;
}

/** Drop all cached Content API responses (e.g. after an admin refresh). */
function clearCache(): void {
  cache.clear();
}

// ── Raw catalog getters (retried + cached) ────────────────────────────────

export const ContentService = {
  isConfigured(): boolean { return isContentConfigured(); },
  clearCache,

  getBoards():    Promise<Board[]>    { return cached('boards',    () => withRetry('boards.list',    () => getContentClient().boards.list())); },
  getStandards(): Promise<Standard[]> { return cached('standards', () => withRetry('standards.list', () => getContentClient().standards.list())); },
  getSubjects():  Promise<Subject[]>  { return cached('subjects',  () => withRetry('subjects.list',  () => getContentClient().subjects.list())); },
  getSeries():    Promise<Series[]>   { return cached('series',    () => withRetry('series.list',     () => getContentClient().series.list())); },

  getBooks(filters?: BookFilters): Promise<Book[]> {
    const key = `books:${JSON.stringify(filters ?? {})}`;
    return cached(key, () => withRetry('books.list', () => getContentClient().books.list(filters)));
  },
  getChapters(bookId: string): Promise<Chapter[]> {
    return cached(`chapters:${bookId}`, () => withRetry(`books.getChapters(${bookId})`, () => getContentClient().books.getChapters(bookId)));
  },
  getQuestions(filters?: QuestionFilters): Promise<PaginatedQuestions> {
    // Questions are NOT cached here — they are app-owned local data and this
    // endpoint is not used for the local question bank. Kept for completeness.
    return withRetry('questions.list', () => getContentClient().questions.list(filters));
  },
};

// ── External-ID → metadata resolvers ──────────────────────────────────────
// Used by the rest of the backend to turn stored external IDs into display
// names (Req #6: combine stored app data with live catalog metadata). Every
// lookup is served from the TTL cache above, so it is cheap. When the API is
// not configured/unreachable, resolvers degrade gracefully to `null` names.

export interface CatalogRef { externalId: string; name: string }

async function safeList<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  if (!isContentConfigured()) return [];
  try { return await fn(); }
  catch (err) { logger.warn(`[content] ${label} unavailable: ${(err as Error).message}`); return []; }
}

/** Build a Map<externalId(String), name> for a catalog dimension. */
async function refMap(
  kind: 'board' | 'class' | 'subject' | 'series',
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (kind === 'board') for (const b of await safeList('boards', () => ContentService.getBoards()))    map.set(String(b.id), b.name);
  if (kind === 'class') for (const s of await safeList('standards', () => ContentService.getStandards())) map.set(String(s.id), s.name);
  if (kind === 'subject') for (const s of await safeList('subjects', () => ContentService.getSubjects())) map.set(String(s.id), s.name);
  if (kind === 'series') for (const s of await safeList('series', () => ContentService.getSeries()))    map.set(String(s.id), s.name);
  return map;
}

export const ContentMeta = {
  boards:    () => refMap('board'),
  classes:   () => refMap('class'),
  subjects:  () => refMap('subject'),
  seriesMap: () => refMap('series'),

  /** Resolve a single subject external id to its name (null if unknown). */
  async subjectName(externalId: string | null): Promise<string | null> {
    if (!externalId) return null;
    return (await refMap('subject')).get(String(externalId)) ?? null;
  },

  /** Resolve a single class external id to its name (null if unknown). */
  async className(externalId: string | null): Promise<string | null> {
    if (!externalId) return null;
    return (await refMap('class')).get(String(externalId)) ?? null;
  },

  /** Resolve a set of book external ids to {externalId,name}[] (missing dropped). */
  async books(externalIds: string[]): Promise<CatalogRef[]> {
    if (!externalIds.length) return [];
    const books = await safeList('books', () => ContentService.getBooks());
    const byId = new Map(books.map(b => [String(b.id), b.name]));
    return externalIds
      .map(id => ({ externalId: String(id), name: byId.get(String(id)) ?? '' }))
      .filter(r => r.name !== '');
  },

  /** True when a subject external id exists in the live catalog. */
  async subjectExists(externalId: string): Promise<boolean> {
    return (await refMap('subject')).has(String(externalId));
  },
  async classExists(externalId: string): Promise<boolean> {
    return (await refMap('class')).has(String(externalId));
  },
};

export type { Board, Standard, Subject, Series, Book, Chapter, Question };
