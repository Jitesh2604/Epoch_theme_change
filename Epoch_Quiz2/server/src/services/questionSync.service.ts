/**
 * Question Sync Service.
 *
 * Imports app-owned `Question` rows from the Epoch Content API. This is NOT a
 * catalog sync: boards/classes/subjects/series/books/chapters are still never
 * persisted locally — ContentService/ContentMeta remain the only source for
 * that metadata (see content.service.ts). This service writes only the
 * question rows themselves, tagged with the external ids (book/chapter/
 * subject/class) needed to resolve their catalog context on read, plus a
 * resolved `educationBoard` name for display.
 *
 * Idempotent: matched by the Content API's stable question id, stored in
 * `Question.externalId` (unique). Re-running updates existing rows instead of
 * creating duplicates. Per-record failures are logged and skipped; they never
 * abort the run.
 *
 * NOTE ON RUNTIME SHAPE: the Content API SDK's declared TypeScript types have
 * previously been found to disagree with the live JSON payload (embedded
 * `chapter.book.{standardId,boardId,subjectId}` + `options[]` vs the SDK's
 * flat `chapterId` + `questionOptions[]`). This service reads defensively —
 * it prefers the embedded shape and falls back to a book/chapter map built
 * from `ContentService.getBooks()` + `getChapters()` when a question has no
 * embedded chapter/book.
 */
import { prisma } from '../lib/prisma';
import { Difficulty, QuestionType, Role, DEFAULT_LANGUAGE } from '../lib/enums';
import { toJson } from '../utils/json';
import { logger } from '../utils/logger';
import { env } from '../config';
import { ContentService, ContentMeta } from './content.service';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

// ── Runtime shapes ────────────────────────────────────────────────────────
// Read defensively; see file header note.

interface RtOption { text?: unknown; isCorrect?: unknown }
interface RtBookRef { id?: unknown; standardId?: unknown; boardId?: unknown; subjectId?: unknown }
interface RtChapterRef { id?: unknown; book?: RtBookRef | null }
interface RtQuestion {
  id?: unknown;
  text?: unknown;
  level?: unknown;
  explanation?: unknown;
  correctAnswer?: unknown;
  options?: unknown;
  questionOptions?: unknown;
  chapter?: RtChapterRef | null;
  chapterId?: unknown;
}

interface BookCtx { bookExternalId: string; standardId: number | null; boardId: number | null; subjectId: number | null }

export interface QuestionSyncStats {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  skipReasons: Record<string, number>;
}

function toDifficulty(level: unknown): Difficulty {
  const v = String(level ?? '').toUpperCase().trim();
  return v === 'EASY' || v === 'MEDIUM' || v === 'HARD' ? (v as Difficulty) : Difficulty.MEDIUM;
}

function bumpSkip(stats: QuestionSyncStats, reason: string): void {
  stats.skipped++;
  stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1;
}

async function findCreator(): Promise<{ id: string; email: string } | null> {
  return prisma.user.findFirst({
    where: { role: { in: [Role.SUPER_ADMIN, Role.PUBLICATION_ADMIN, Role.CONTENT_MANAGER] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
}

/** Build chapterExternalId -> book context by walking every book's chapter list. Used only as a fallback. */
async function buildChapterFallbackMap(): Promise<Map<string, BookCtx>> {
  const map = new Map<string, BookCtx>();
  const books = await ContentService.getBooks();
  for (const book of books) {
    const ctx: BookCtx = {
      bookExternalId: String(book.id),
      standardId: book.standardId ?? null,
      boardId: book.boardId ?? null,
      subjectId: book.subjectId ?? null,
    };
    try {
      const chapters = await ContentService.getChapters(String(book.id));
      for (const ch of chapters) map.set(String(ch.id), ctx);
    } catch (err) {
      logger.warn(`[question-sync] could not load chapters for book ${book.id}: ${(err as Error).message}`);
    }
  }
  return map;
}

function normalize(raw: RtQuestion): {
  externalId: string;
  prompt: string;
  level: unknown;
  explanation: string | null;
  correctAnswerRaw: string | null;
  options: { text: string; isCorrect: boolean }[];
  chapterExternalId: string | null;
  embeddedBook: BookCtx | null;
} {
  const rawOptions = (Array.isArray(raw.options) ? raw.options : Array.isArray(raw.questionOptions) ? raw.questionOptions : []) as RtOption[];
  const options = rawOptions
    .map((o) => ({ text: typeof o.text === 'string' ? o.text : '', isCorrect: Boolean(o.isCorrect) }))
    .filter((o) => o.text.trim() !== '');

  const chapter = raw.chapter ?? null;
  const chapterExternalId = chapter?.id != null ? String(chapter.id) : raw.chapterId != null ? String(raw.chapterId) : null;

  const book = chapter?.book ?? null;
  const embeddedBook: BookCtx | null = book?.id != null
    ? {
        bookExternalId: String(book.id),
        standardId: typeof book.standardId === 'number' ? book.standardId : null,
        boardId: typeof book.boardId === 'number' ? book.boardId : null,
        subjectId: typeof book.subjectId === 'number' ? book.subjectId : null,
      }
    : null;

  return {
    externalId: String(raw.id),
    prompt: typeof raw.text === 'string' ? raw.text : '',
    level: raw.level,
    explanation: typeof raw.explanation === 'string' && raw.explanation.trim() ? raw.explanation : null,
    correctAnswerRaw: typeof raw.correctAnswer === 'string' ? raw.correctAnswer : null,
    options,
    chapterExternalId,
    embeddedBook,
  };
}

export const QuestionSyncService = {
  async run(): Promise<QuestionSyncStats> {
    const started = Date.now();
    const stats: QuestionSyncStats = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, durationMs: 0, skipReasons: {} };

    if (!ContentService.isConfigured()) {
      throw new Error('CONTENT_API_KEY is not configured — cannot sync questions from the Content API.');
    }

    const creator = await findCreator();
    if (!creator) {
      throw new Error('No SUPER_ADMIN / PUBLICATION_ADMIN / CONTENT_MANAGER user exists. Run `npm run seed` first to create the default admin.');
    }
    logger.info(`[question-sync] importing as ${creator.email}`);

    const boardsMap = await ContentMeta.boards(); // externalId(string) -> name

    let chapterFallbackMap: Map<string, BookCtx> | null = null;
    const chapterCache = new Map<string, BookCtx | null>();

    async function resolveBookCtx(chapterExternalId: string, embedded: BookCtx | null): Promise<BookCtx | null> {
      if (embedded) return embedded;
      if (chapterCache.has(chapterExternalId)) return chapterCache.get(chapterExternalId)!;
      if (!chapterFallbackMap) {
        logger.info('[question-sync] questions have no embedded chapter/book — building fallback map from books.list()/getChapters()…');
        chapterFallbackMap = await buildChapterFallbackMap();
      }
      const ctx = chapterFallbackMap.get(chapterExternalId) ?? null;
      chapterCache.set(chapterExternalId, ctx);
      return ctx;
    }

    const pageSize = env.CONTENT_SYNC_PAGE_SIZE;
    let offset = 0;

    logger.info(`[question-sync] starting import (page size ${pageSize})…`);

    for (;;) {
      const page = await ContentService.getQuestions({ limit: pageSize, offset });
      const rows = (page.questions ?? []) as unknown as RtQuestion[];
      if (rows.length === 0) break;

      for (const raw of rows) {
        stats.fetched++;
        const q = normalize(raw);

        if (!q.externalId) { bumpSkip(stats, 'missing id'); continue; }
        if (!q.prompt.trim()) { bumpSkip(stats, 'missing prompt'); continue; }
        if (q.options.length < 2) { bumpSkip(stats, 'fewer than 2 options'); continue; }

        let correctIdxs = q.options
          .map((o, i) => (o.isCorrect ? i : -1))
          .filter((i) => i >= 0);

        if (correctIdxs.length === 0 && q.correctAnswerRaw) {
          const idx = q.options.findIndex((o) => o.text.trim().toLowerCase() === q.correctAnswerRaw!.trim().toLowerCase());
          if (idx >= 0) correctIdxs = [idx];
        }
        if (correctIdxs.length === 0) { bumpSkip(stats, 'no correct option identified'); continue; }

        let bookCtx: BookCtx | null = null;
        if (q.chapterExternalId) {
          try {
            bookCtx = await resolveBookCtx(q.chapterExternalId, q.embeddedBook);
          } catch (err) {
            logger.warn(`[question-sync] fallback chapter map failed: ${(err as Error).message}`);
          }
        }

        const opts = q.options.slice(0, 4);
        const [optionA, optionB, optionC, optionD] = [opts[0]?.text ?? null, opts[1]?.text ?? null, opts[2]?.text ?? null, opts[3]?.text ?? null];
        const usableCorrectIdxs = correctIdxs.filter((i) => i < 4);
        if (usableCorrectIdxs.length === 0) { bumpSkip(stats, 'correct option truncated (>4 options)'); continue; }

        const type = usableCorrectIdxs.length > 1 ? QuestionType.MCQ_MULTIPLE : QuestionType.MCQ_SINGLE;
        const correctAnswer = type === QuestionType.MCQ_SINGLE ? LETTERS[usableCorrectIdxs[0]] : null;
        const correctOptions = type === QuestionType.MCQ_MULTIPLE ? toJson(usableCorrectIdxs.map((i) => LETTERS[i])) : '[]';

        const educationBoard = bookCtx?.boardId != null ? boardsMap.get(String(bookCtx.boardId)) ?? null : null;

        const data = {
          type,
          prompt: q.prompt.trim(),
          optionA, optionB, optionC, optionD,
          correctAnswer,
          correctOptions,
          explanation: q.explanation,
          difficulty: toDifficulty(q.level),
          language: DEFAULT_LANGUAGE,
          tags: '[]',
          status: 'ACTIVE' as const,
          bookExternalId: bookCtx?.bookExternalId ?? null,
          chapterExternalId: q.chapterExternalId,
          subjectExternalId: bookCtx?.subjectId != null ? String(bookCtx.subjectId) : null,
          classExternalId: bookCtx?.standardId != null ? String(bookCtx.standardId) : null,
          educationBoard,
        };

        try {
          const existing = await prisma.question.findUnique({ where: { externalId: q.externalId }, select: { id: true } });
          if (existing) {
            await prisma.question.update({ where: { id: existing.id }, data });
            stats.updated++;
          } else {
            await prisma.question.create({
              data: { ...data, externalId: q.externalId, marks: 1, negativeMarks: 0, createdById: creator.id },
            });
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
          logger.error(`[question-sync] question ${q.externalId} failed: ${(err as Error).message}`);
        }
      }

      logger.info(`[question-sync] progress: fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed}`);

      offset += rows.length;
      if (page.pagination && offset >= page.pagination.total) break;
      if (rows.length < pageSize) break;
    }

    stats.durationMs = Date.now() - started;
    return stats;
  },
};
