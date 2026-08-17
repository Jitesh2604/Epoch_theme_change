// ── TEMPORARY CONTENT CLIENT DEBUG ──
// Dev-only controller — see routes/debug.routes.ts, which only mounts this
// at all when isDev is true (not just a runtime check here; the route tree
// itself does not exist in production). Returns the RAW
// @epochstudio/content-client response, unmodified by any of this app's
// normal shaping — the whole point is to see exactly what the SDK returns
// before ContentService/ContentMeta transform it into {id, name} maps etc.
import type { Request, Response } from '../core/types';
import { ContentService } from '../services/content.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { isDev } from '../config';

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const DebugController = {
  rawContentClientQuestions: asyncHandler(async (req: Request, res: Response) => {
    // Defense in depth — routes/debug.routes.ts already only mounts this
    // router when isDev, so this should be unreachable in production, but
    // the handler itself never trusts that alone.
    if (!isDev) throw ApiError.notFound('Not found');

    const q = req.query as Record<string, string | undefined>;
    const baseFilters = {
      subjectId:  toNumber(q.subjectId),
      boardId:    toNumber(q.boardId),
      standardId: toNumber(q.standardId),
      bookId:     q.bookId || undefined,
      chapterId:  q.chapterId || undefined,
    };

    // 100 is the Content API's own max page size (confirmed: requesting
    // limit=200 still comes back capped at 100) — that's the true "full
    // data" default now, up from the earlier limit=5 sample.
    const PAGE_SIZE = 100;
    const fetchAll = q.all === 'true' || q.all === '1';

    if (!fetchAll) {
      const raw = await ContentService.getQuestions({
        ...baseFilters, limit: toNumber(q.limit) ?? PAGE_SIZE, offset: toNumber(q.offset) ?? 0,
      });
      // Unlike every other controller in this app, this returns the SDK's
      // raw shape directly (still wrapped in the standard { success, data }
      // envelope by ApiResponse.ok — that envelope is this app's HTTP
      // contract, not a Content Client transformation) — no toPublic()-style
      // remapping of field names happens here.
      ApiResponse.ok(res, raw);
      return;
    }

    // ?all=true — walk every page from the Content API and concatenate, so
    // the browser gets literally everything, not just one page. Safety-
    // capped so a misbehaving API (e.g. total keeps climbing, or a page
    // comes back empty before offset reaches total) can never hang the
    // dev server or blow up memory.
    const MAX_QUESTIONS = 2000;
    let offset = 0;
    let total = Infinity;
    const questions: unknown[] = [];
    while (offset < total && questions.length < MAX_QUESTIONS) {
      const page = await ContentService.getQuestions({ ...baseFilters, limit: PAGE_SIZE, offset });
      total = page.pagination.total;
      if (!page.questions.length) break;
      questions.push(...page.questions);
      offset += page.questions.length;
    }
    ApiResponse.ok(res, { questions, pagination: { total, returned: questions.length, pageSize: PAGE_SIZE } });
  }),

  // GET /api/v1/debug/content-client/all — every @epochstudio/content-client
  // resource in one response: boards, standards, subjects, series (all
  // small, fetched whole), books (whole catalog), chapters (for the first
  // book found, since getChapters needs one specific bookId), and a small
  // questions sample (the dedicated /questions endpoint above is the one to
  // use for the full 450-question set via ?all=true).
  rawContentClientAll: asyncHandler(async (_req: Request, res: Response) => {
    if (!isDev) throw ApiError.notFound('Not found');

    // Each resource fetched independently, one failure never sinks the
    // others — e.g. this API key gets a real 401 from the Content API on
    // boards.list() specifically (confirmed pre-existing, not caused by
    // this endpoint: catalog.service.ts calls ContentService.getBoards()
    // directly too), which every OTHER real caller in this app never
    // notices because it goes through ContentMeta's safeList() wrapper
    // instead. This debug endpoint mirrors that same resilience.
    const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
      try { return await fn(); }
      catch (err) { return { error: `${label} failed: ${(err as Error).message}` }; }
    };

    const [boards, standards, subjects, series, books] = await Promise.all([
      safe('boards.list', () => ContentService.getBoards()),
      safe('standards.list', () => ContentService.getStandards()),
      safe('subjects.list', () => ContentService.getSubjects()),
      safe('series.list', () => ContentService.getSeries()),
      safe('books.list', () => ContentService.getBooks()),
    ]);

    const firstBookId = Array.isArray(books) ? books[0]?.id : undefined;
    const [chapters, questionsSample] = await Promise.all([
      firstBookId ? safe('books.getChapters', () => ContentService.getChapters(firstBookId)) : Promise.resolve([]),
      safe('questions.list', () => ContentService.getQuestions({ limit: 5 })),
    ]);

    ApiResponse.ok(res, { boards, standards, subjects, series, books, chapters, questionsSample });
  }),
};
// ── END TEMPORARY CONTENT CLIENT DEBUG ──
