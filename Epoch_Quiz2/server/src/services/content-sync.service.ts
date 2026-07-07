/**
 * Content Synchronisation Service.
 *
 * Imports the academic hierarchy from the Epoch Content SDK into the local DB
 * and keeps it up to date. Idempotent (matched by the SDK's stable `externalId`),
 * safe to re-run, and resilient to per-record failures.
 *
 *  Hierarchy:  Board / Standard(Class) / Subject / Series → Book → Chapter → Question
 *
 * IMPORTANT: the SDK's TypeScript types do NOT match the live API for questions.
 * We treat the RUNTIME JSON as the source of truth (verified against the API):
 *   question.options              (NOT questionOptions)
 *   question.chapter.{id,name}    (NOT chapterId)
 *   question.chapter.book.{standardId, boardId, subjectId, seriesId}
 * Chapters are therefore derived from each question's embedded `chapter` object
 * (the /books/chapters endpoint requires a session token we don't have).
 */
import { prisma } from '../lib/prisma';
import { Difficulty } from '../lib/enums';
import { logger } from '../utils/logger';
import { env } from '../config';
import { toJson } from '../utils/json';
import { ContentService } from './content.service';
import type { Book } from './content.service';

// ── Runtime shapes (verified from the live API, not the .d.ts) ───────────────

interface RtOption { id: string; text: string; isCorrect: boolean }
interface RtBook {
  id: string; name: string;
  standardId: number | null; boardId: number | null; subjectId: number | null; seriesId: number | null;
}
interface RtChapter { id: string; name: string; book: RtBook | null }
interface RtQuestion {
  id: string; questionType: string; level: string; text: string;
  correctAnswer: string | null; explanation: string | null;
  chapter: RtChapter | null; options: RtOption[] | null;
}

// ── Counts ──────────────────────────────────────────────────────────────────

interface EntityCounts { inserted: number; updated: number; skipped: number; failed: number }
const zero = (): EntityCounts => ({ inserted: 0, updated: 0, skipped: 0, failed: 0 });

export interface SyncStats {
  boards: EntityCounts; classes: EntityCounts; subjects: EntityCounts; series: EntityCounts;
  books: EntityCounts; chapters: EntityCounts; questions: EntityCounts;
  optionsImported: number;
}
export interface SyncResult {
  logId: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  totals: EntityCounts;
  stats: SyncStats;
  error?: string;
}

interface RefRow { id: string; name: string }
interface BookInfo { localId: string; classId: string | null; subjectId: string | null; educationBoard: string | null }

const LETTERS = ['A', 'B', 'C', 'D'] as const;
let _syncing = false;

// ── helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `subject-${Date.now()}`;
}

/** Coerce the API's free-form difficulty into the Difficulty enum (default MEDIUM). */
function toDifficulty(level: string | null | undefined): Difficulty {
  const v = String(level ?? '').toUpperCase().trim();
  return v === 'EASY' || v === 'MEDIUM' || v === 'HARD' ? (v as Difficulty) : Difficulty.MEDIUM;
}

async function systemUserId(): Promise<string> {
  const u = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN', 'CONTENT_MANAGER'] } },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  if (!u) throw new Error('No admin/content-manager user exists to own imported questions.');
  return u.id;
}

/** Minimal Prisma delegate surface used by the generic reference-entity upsert. */
interface RefDelegate {
  findUnique(args: { where: { externalId: string }; select: { id: true; name: true } }): Promise<{ id: string; name: string } | null>;
  findFirst(args: { where: { name: string; externalId: null }; select: { id: true } }): Promise<{ id: string } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

/** Upsert a small reference entity by externalId, adopting an existing same-named row. */
async function upsertRef(
  model: RefDelegate,
  extId: string, name: string, extraCreate: Record<string, unknown>, counts: EntityCounts,
): Promise<string | null> {
  try {
    const existing = await model.findUnique({ where: { externalId: extId }, select: { id: true, name: true } });
    if (existing) {
      if (existing.name !== name) { await model.update({ where: { id: existing.id }, data: { name } }); counts.updated++; }
      else counts.skipped++;
      return existing.id;
    }
    const byName = await model.findFirst({ where: { name, externalId: null }, select: { id: true } });
    if (byName) { await model.update({ where: { id: byName.id }, data: { externalId: extId } }); counts.updated++; return byName.id; }
    const created = await model.create({ data: { name, externalId: extId, status: 'ACTIVE', ...extraCreate } });
    counts.inserted++;
    return created.id;
  } catch (err) {
    counts.failed++;
    logger.error(`[content-sync] ref ${extId} failed: ${(err as Error).message}`);
    return null;
  }
}

// ── reference entity syncs ──────────────────────────────────────────────────

async function syncBoards(counts: EntityCounts): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  for (const b of await ContentService.getBoards()) {
    const id = await upsertRef(prisma.board as unknown as RefDelegate, String(b.id), b.name, {}, counts);
    if (id) map.set(String(b.id), { id, name: b.name });
  }
  return map;
}

async function syncStandards(counts: EntityCounts): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  for (const s of await ContentService.getStandards()) {
    const id = await upsertRef(prisma.class as unknown as RefDelegate, String(s.id), s.name, { serial: String(s.order ?? '') }, counts);
    if (id) map.set(String(s.id), { id, name: s.name });
  }
  return map;
}

async function syncSubjects(counts: EntityCounts): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  for (const s of await ContentService.getSubjects()) {
    const extId = String(s.id);
    try {
      const existing = await prisma.subject.findUnique({ where: { externalId: extId }, select: { id: true, name: true } });
      if (existing) {
        if (existing.name !== s.name) { await prisma.subject.update({ where: { id: existing.id }, data: { name: s.name } }); counts.updated++; }
        else counts.skipped++;
        map.set(extId, { id: existing.id, name: s.name });
        continue;
      }
      const byName = await prisma.subject.findFirst({ where: { name: s.name, externalId: null }, select: { id: true } });
      if (byName) {
        await prisma.subject.update({ where: { id: byName.id }, data: { externalId: extId } });
        counts.updated++; map.set(extId, { id: byName.id, name: s.name }); continue;
      }
      const created = await prisma.subject.create({
        data: { name: s.name, slug: slugify(s.name), kind: 'SUBJECT', externalId: extId, status: 'ACTIVE' },
        select: { id: true },
      });
      counts.inserted++; map.set(extId, { id: created.id, name: s.name });
    } catch (err) {
      counts.failed++;
      logger.error(`[content-sync] subject ${extId} failed: ${(err as Error).message}`);
    }
  }
  return map;
}

async function syncSeries(counts: EntityCounts): Promise<Map<string, RefRow>> {
  const map = new Map<string, RefRow>();
  for (const s of await ContentService.getSeries()) {
    const id = await upsertRef(prisma.series as unknown as RefDelegate, String(s.id), s.name, {}, counts);
    if (id) map.set(String(s.id), { id, name: s.name });
  }
  return map;
}

// ── books & chapters ────────────────────────────────────────────────────────

/** Upsert a book (from either the books.list() row or a question's embedded book). */
async function upsertBook(
  extId: string, name: string,
  standardId: number | null, boardId: number | null, subjectId: number | null, seriesId: number | null,
  boards: Map<string, RefRow>, classes: Map<string, RefRow>, subjects: Map<string, RefRow>, series: Map<string, RefRow>,
  counts: EntityCounts,
): Promise<BookInfo> {
  const classId    = standardId != null ? classes.get(String(standardId))?.id  ?? null : null;
  const subjectId2 = subjectId  != null ? subjects.get(String(subjectId))?.id  ?? null : null;
  const boardLocal = boardId    != null ? boards.get(String(boardId))          ?? null : null;
  const seriesLocalId = seriesId != null ? series.get(String(seriesId))?.id    ?? null : null;
  const educationBoard = boardLocal?.name ?? null;

  const existing = await prisma.book.findUnique({ where: { externalId: extId }, select: { id: true } });
  if (existing) {
    await prisma.book.update({
      where: { id: existing.id },
      data: { name, classId, subjectId: subjectId2, boardId: boardLocal?.id ?? null, seriesId: seriesLocalId },
    });
    counts.updated++;
    return { localId: existing.id, classId, subjectId: subjectId2, educationBoard };
  }
  const created = await prisma.book.create({
    data: { name, classId, subjectId: subjectId2, boardId: boardLocal?.id ?? null, seriesId: seriesLocalId, externalId: extId, status: 'ACTIVE' },
    select: { id: true },
  });
  counts.inserted++;
  return { localId: created.id, classId, subjectId: subjectId2, educationBoard };
}

async function syncBooks(
  counts: EntityCounts,
  boards: Map<string, RefRow>, classes: Map<string, RefRow>, subjects: Map<string, RefRow>, series: Map<string, RefRow>,
): Promise<Map<string, BookInfo>> {
  const map = new Map<string, BookInfo>();
  let books: Book[] = [];
  try { books = await ContentService.getBooks(); }
  catch (err) { logger.error(`[content-sync] books.list failed: ${(err as Error).message}`); return map; }
  for (const b of books) {
    try {
      const info = await upsertBook(String(b.id), b.name, b.standardId, b.boardId, b.subjectId, b.seriesId, boards, classes, subjects, series, counts);
      map.set(String(b.id), info);
    } catch (err) {
      counts.failed++;
      logger.error(`[content-sync] book ${b.id} failed: ${(err as Error).message}`);
    }
  }
  return map;
}

/** Upsert a chapter (derived from a question's embedded chapter object). */
async function upsertChapter(extId: string, name: string, localBookId: string, counts: EntityCounts): Promise<string> {
  const existing = await prisma.chapter.findUnique({ where: { externalId: extId }, select: { id: true } });
  if (existing) {
    await prisma.chapter.update({ where: { id: existing.id }, data: { name, bookId: localBookId } });
    counts.updated++;
    return existing.id;
  }
  const created = await prisma.chapter.create({
    data: { name, bookId: localBookId, externalId: extId, status: 'ACTIVE' }, select: { id: true },
  });
  counts.inserted++;
  return created.id;
}

// ── questions (runtime shape) ───────────────────────────────────────────────

async function syncQuestions(
  stats: SyncStats,
  boards: Map<string, RefRow>, classes: Map<string, RefRow>, subjects: Map<string, RefRow>, series: Map<string, RefRow>,
  bookMap: Map<string, BookInfo>, createdById: string,
): Promise<number> {
  const pageSize = env.CONTENT_SYNC_PAGE_SIZE;
  const chapterCache = new Map<string, string>(); // extChapterId -> localChapterId
  let optionsImported = 0;
  let offset = 0;

  for (;;) {
    const page = await ContentService.getQuestions({ limit: pageSize, offset });
    // Treat the RUNTIME shape as truth (SDK types are inaccurate).
    const rows = ((page.questions ?? []) as unknown) as RtQuestion[];
    if (rows.length === 0) break;

    for (const qn of rows) {
      const extId = String(qn.id);
      try {
        const chap = qn.chapter;
        if (!chap || !chap.book) { stats.questions.skipped++; continue; }

        // Ensure the book exists (usually already imported by syncBooks).
        let binfo = bookMap.get(String(chap.book.id));
        if (!binfo) {
          binfo = await upsertBook(
            String(chap.book.id), chap.book.name,
            chap.book.standardId, chap.book.boardId, chap.book.subjectId, chap.book.seriesId,
            boards, classes, subjects, series, stats.books,
          );
          bookMap.set(String(chap.book.id), binfo);
        }

        // Ensure the chapter exists (derived from the question payload).
        let localChapterId = chapterCache.get(String(chap.id));
        if (!localChapterId) {
          localChapterId = await upsertChapter(String(chap.id), chap.name, binfo.localId, stats.chapters);
          chapterCache.set(String(chap.id), localChapterId);
        }

        // Options → optionA..D + correct letter.
        const opts = (qn.options ?? []).slice(0, 4);
        const optionA = opts[0]?.text ?? null;
        const optionB = opts[1]?.text ?? null;
        const optionC = opts[2]?.text ?? null;
        const optionD = opts[3]?.text ?? null;
        const correctIdx = opts.findIndex((o) => o.isCorrect);
        const correctLetter = correctIdx >= 0 ? LETTERS[correctIdx] ?? null : null;
        const correctOptions = correctLetter ? toJson([correctLetter]) : '[]';
        optionsImported += opts.filter((o) => o.text).length;

        const existing = await prisma.question.findUnique({ where: { externalId: extId }, select: { id: true } });
        if (existing) {
          await prisma.question.update({
            where: { id: existing.id },
            data: {
              prompt: qn.text, optionA, optionB, optionC, optionD,
              correctAnswer: correctLetter, correctOptions, explanation: qn.explanation ?? null,
              difficulty: toDifficulty(qn.level),
              subjectId: binfo.subjectId, classId: binfo.classId, chapterId: localChapterId, bookId: binfo.localId,
              educationBoard: binfo.educationBoard,
            },
          });
          stats.questions.updated++;
        } else {
          await prisma.question.create({
            data: {
              type: 'MCQ_SINGLE', prompt: qn.text, optionA, optionB, optionC, optionD,
              correctAnswer: correctLetter, correctOptions, correctBoolean: null,
              explanation: qn.explanation ?? null, marks: 1, negativeMarks: 0,
              difficulty: toDifficulty(qn.level), language: 'English', tags: '[]', status: 'ACTIVE',
              subjectId: binfo.subjectId, classId: binfo.classId, chapterId: localChapterId, bookId: binfo.localId,
              educationBoard: binfo.educationBoard, createdById, externalId: extId,
            },
          });
          stats.questions.inserted++;
        }
      } catch (err) {
        stats.questions.failed++;
        logger.error(`[content-sync] question ${extId} failed: ${(err as Error).message}`);
      }
    }

    offset += rows.length;
    if (page.pagination && offset >= page.pagination.total) break;
    if (rows.length < pageSize) break;
  }

  return optionsImported;
}

// ── orchestration ───────────────────────────────────────────────────────────

export const ContentSyncService = {
  isRunning(): boolean { return _syncing; },

  async run(trigger: 'MANUAL' | 'SCHEDULED' = 'MANUAL'): Promise<SyncResult> {
    if (_syncing) throw new Error('A content sync is already in progress.');
    _syncing = true;

    const started = Date.now();
    const stats: SyncStats = {
      boards: zero(), classes: zero(), subjects: zero(), series: zero(),
      books: zero(), chapters: zero(), questions: zero(), optionsImported: 0,
    };

    const log = await prisma.contentSyncLog.create({
      data: { status: 'RUNNING', trigger, stats: '{}' }, select: { id: true },
    });
    const logId = log.id;
    logger.info(`[content-sync] started (${trigger}) log=${logId}`);

    try {
      const createdById = await systemUserId();

      const boards   = await syncBoards(stats.boards);
      const classes  = await syncStandards(stats.classes);
      const subjects = await syncSubjects(stats.subjects);
      const series   = await syncSeries(stats.series);
      const bookMap  = await syncBooks(stats.books, boards, classes, subjects, series);

      // Chapters + questions come from the paginated questions endpoint.
      stats.optionsImported = await syncQuestions(stats, boards, classes, subjects, series, bookMap, createdById);

      const totals = sumCounts(stats);
      const durationMs = Date.now() - started;
      await prisma.contentSyncLog.update({
        where: { id: logId },
        data: {
          status: 'SUCCESS', finishedAt: new Date(), durationMs,
          inserted: totals.inserted, updated: totals.updated, skipped: totals.skipped, failed: totals.failed,
          stats: toJson(stats),
        },
      });
      logger.info(`[content-sync] done in ${durationMs}ms — +${totals.inserted} ~${totals.updated} =${totals.skipped} !${totals.failed}, options=${stats.optionsImported}`);
      return { logId, status: 'SUCCESS', durationMs, totals, stats };
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = (err as Error).message;
      const totals = sumCounts(stats);
      await prisma.contentSyncLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED', finishedAt: new Date(), durationMs,
          inserted: totals.inserted, updated: totals.updated, skipped: totals.skipped, failed: totals.failed,
          stats: toJson(stats), error: message,
        },
      }).catch(() => { /* never mask the original error */ });
      logger.error(`[content-sync] FAILED after ${durationMs}ms: ${message}`);
      return { logId, status: 'FAILED', durationMs, totals, stats, error: message };
    } finally {
      _syncing = false;
    }
  },

  async recentLogs(limit = 20) {
    return prisma.contentSyncLog.findMany({
      orderBy: { startedAt: 'desc' }, take: limit,
      select: {
        id: true, status: true, trigger: true, startedAt: true, finishedAt: true,
        durationMs: true, inserted: true, updated: true, skipped: true, failed: true, error: true,
      },
    });
  },
};

function sumCounts(stats: SyncStats): EntityCounts {
  const total = zero();
  for (const [k, c] of Object.entries(stats)) {
    if (k === 'optionsImported') continue;
    const e = c as EntityCounts;
    total.inserted += e.inserted; total.updated += e.updated; total.skipped += e.skipped; total.failed += e.failed;
  }
  return total;
}
