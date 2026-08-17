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
import { env, isDev } from '../config';
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

// ── Raw catalog getters (retried + cached) ────────────────────────────────

export const ContentService = {
  isConfigured(): boolean { return isContentConfigured(); },

  // ── TEMPORARY CONTENT CLIENT DEBUG ── every console.log below just prints
  // the resolved value inline (via .then), no new function declared anywhere.
  getBoards():    Promise<Board[]>    { return cached('boards',    () => withRetry('boards.list',    () => getContentClient().boards.list().then(d => { if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw boards.list() response:', JSON.stringify(d, null, 2)); return d; }))); },
  getStandards(): Promise<Standard[]> { return cached('standards', () => withRetry('standards.list', () => getContentClient().standards.list().then(d => { if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw standards.list() response:', JSON.stringify(d, null, 2)); return d; }))); },
  getSubjects():  Promise<Subject[]>  { return cached('subjects',  () => withRetry('subjects.list',  () => getContentClient().subjects.list().then(d => { if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw subjects.list() response:', JSON.stringify(d, null, 2)); return d; }))); },
  getSeries():    Promise<Series[]>   { return cached('series',    () => withRetry('series.list',     () => getContentClient().series.list().then(d => { if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw series.list() response:', JSON.stringify(d, null, 2)); return d; }))); },
  // ── END TEMPORARY CONTENT CLIENT DEBUG ──

  getBooks(filters?: BookFilters): Promise<Book[]> {
    const key = `books:${JSON.stringify(filters ?? {})}`;
    return cached(key, () => withRetry('books.list', () => getContentClient().books.list(filters).then(d => {
      // ── TEMPORARY CONTENT CLIENT DEBUG ──
      if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw books.list() response:', JSON.stringify(d, null, 2));
      // ── END TEMPORARY CONTENT CLIENT DEBUG ──
      return d;
    })));
  },
  getChapters(bookId: string): Promise<Chapter[]> {
    return cached(`chapters:${bookId}`, () => withRetry(`books.getChapters(${bookId})`, () => getContentClient().books.getChapters(bookId).then(d => {
      // ── TEMPORARY CONTENT CLIENT DEBUG ──
      if (isDev) console.log('[CONTENT-CLIENT DATA] (backend terminal) raw books.getChapters() response:', JSON.stringify(d, null, 2));
      // ── END TEMPORARY CONTENT CLIENT DEBUG ──
      return d;
    })));
  },
  getQuestions(filters?: QuestionFilters): Promise<PaginatedQuestions> {
    // Questions are NOT cached here — they are app-owned local data and this
    // endpoint is not used for the local question bank. Kept for completeness.
    // (Removed a pre-existing `console.log(getContentClient().questions.list(filters))`
    // here — it logged the un-awaited Promise object itself, never the
    // resolved data. Replaced below with a correct, dev-only debug log of
    // the actual resolved response.)
    return withRetry('questions.list', async () => {
      const raw = await getContentClient().questions.list(filters);
      // ── TEMPORARY CONTENT CLIENT DEBUG ──
      // This is the FIRST backend location that calls
      // @epochstudio/content-client for question data — logs the exact raw
      // SDK response, before any transformation by this app. Dev-only.
      if (isDev) {
        console.log('[CONTENT-CLIENT DATA] (backend terminal) raw questions.list() response:', JSON.stringify(raw, null, 2));
      }
      // ── END TEMPORARY CONTENT CLIENT DEBUG ──
      return raw;
    });
  },
};

// ── External-ID → metadata resolvers ──────────────────────────────────────
// Used by the rest of the backend to turn stored external IDs into display
// names (Req #6: combine stored app data with live catalog metadata). Every
// lookup is served from the TTL cache above, so it is cheap. When the API is
// not configured/unreachable, resolvers degrade gracefully to `null` names.

export interface CatalogRef { externalId: string; name: string }

/**
 * Single source of truth for the friendly placeholder shown when a stored
 * external id can't be resolved to a name (deleted/renamed catalog entry,
 * transient per-book chapter-fetch failure — see chapterNames() below).
 * Every caller that does `someMap.get(id) ?? id` instead of `?? UNKNOWN_*`
 * leaks a raw database id into the UI — use these constants, never the raw
 * id, as the fallback.
 */
export const UNKNOWN_SUBJECT_NAME = 'Unknown Subject';
export const UNKNOWN_TOPIC_NAME = 'Unknown Topic';
export const UNKNOWN_CLASS_NAME = 'Unknown Class';

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

// ── Chapter-name fallback via /api/questions ───────────────────────────────
// Same runtime-shape caveat documented in questionSync.service.ts: the SDK's
// declared Question type has previously been found to disagree with the live
// payload (nested `chapter: {id, name, book}` vs the SDK's flat `chapterId`,
// no chapter name at all). This app already reads that embedded shape
// defensively when syncing Question rows — this reuses the exact same shape,
// just pulling `chapter.name` (never persisted locally) instead of ids.
interface RtChapterRef { id?: unknown; name?: unknown }
interface RtQuestionForChapter { chapter?: RtChapterRef | null }

async function chapterNamesViaQuestions(bookId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = env.CONTENT_SYNC_PAGE_SIZE;
  let offset = 0;
  for (;;) {
    const page = await ContentService.getQuestions({ bookId, limit: pageSize, offset });
    const rows = (page.questions ?? []) as unknown as RtQuestionForChapter[];
    if (rows.length === 0) break;
    for (const raw of rows) {
      const ch = raw.chapter ?? null;
      if (ch?.id != null && typeof ch.name === 'string' && ch.name.trim()) {
        map.set(String(ch.id), ch.name);
      }
    }
    offset += rows.length;
    if (page.pagination && offset >= page.pagination.total) break;
    if (rows.length < pageSize) break;
  }
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

  /**
   * Resolve chapterExternalId -> chapter name for a set of book external ids
   * (only the books actually referenced, not the whole catalog). Mirrors
   * questionSync.service.ts's buildChapterFallbackMap: one book's failure
   * (e.g. transient API error) is logged and skipped, not fatal to the rest.
   *
   * Some tenant/book configurations reject the single-resource book endpoints
   * (`GET /api/books/chapters/:id`) with 401 while list endpoints on the same
   * API key stay open — observed for every book in this environment. When
   * getChapters() fails, fall back to chapterNamesViaQuestions(), which reads
   * the same chapter id+name off the (working) /api/questions list endpoint
   * instead — see that function for the runtime-shape rationale.
   */
  async chapterNames(bookExternalIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!isContentConfigured()) return map;
    const distinctBookIds = [...new Set(bookExternalIds.map(String))];
    for (const bookId of distinctBookIds) {
      try {
        const chapters = await ContentService.getChapters(bookId);
        for (const ch of chapters) map.set(String(ch.id), ch.name);
        continue;
      } catch (err) {
        logger.warn(`[content] could not load chapters for book ${bookId} via getChapters: ${(err as Error).message} — falling back to /api/questions`);
      }
      try {
        const fallback = await cached(`chapters-via-questions:${bookId}`, () => chapterNamesViaQuestions(bookId));
        for (const [id, name] of fallback) map.set(id, name);
      } catch (err) {
        logger.warn(`[content] chapter fallback via /api/questions also failed for book ${bookId}: ${(err as Error).message}`);
      }
    }
    return map;
  },
};

export type { Board, Standard, Subject, Series, Book, Chapter, Question };
