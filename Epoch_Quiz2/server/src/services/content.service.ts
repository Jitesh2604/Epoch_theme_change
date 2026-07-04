/**
 * Content service — the ONLY layer in the app that talks to the Epoch Content
 * SDK. Everything else (sync service, controllers) goes through here so SDK
 * usage is never scattered. Adds retry with backoff for transient failures and
 * leaves client-side errors (auth / validation / 404) un-retried.
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
import { getContentClient } from '../lib/contentClient';
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
  const maxRetries = env.CONTENT_SYNC_MAX_RETRIES;
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

export const ContentService = {
  getBoards():    Promise<Board[]>    { return withRetry('boards.list',    () => getContentClient().boards.list()); },
  getStandards(): Promise<Standard[]> { return withRetry('standards.list', () => getContentClient().standards.list()); },
  getSubjects():  Promise<Subject[]>  { return withRetry('subjects.list',  () => getContentClient().subjects.list()); },
  getSeries():    Promise<Series[]>   { return withRetry('series.list',     () => getContentClient().series.list()); },

  getBooks(filters?: BookFilters): Promise<Book[]> {
    return withRetry('books.list', () => getContentClient().books.list(filters));
  },
  getChapters(bookId: string): Promise<Chapter[]> {
    return withRetry(`books.getChapters(${bookId})`, () => getContentClient().books.getChapters(bookId));
  },
  getQuestions(filters?: QuestionFilters): Promise<PaginatedQuestions> {
    return withRetry('questions.list', () => getContentClient().questions.list(filters));
  },
};

export type { Board, Standard, Subject, Series, Book, Chapter, Question };
