/**
 * Catalogue / filter service.
 *
 * The Epoch Content API is the single source of truth for the filter attributes
 * (boards, classes/standards, series, books). We fetch them live and resolve
 * each item to its LOCAL row id (keyed by `externalId`, creating the row on
 * first sight) so the ids we return are always valid foreign keys for the
 * profile/assessment/quiz writes that consume them.
 *
 * When the Content API is not configured or is unreachable, we fall back to the
 * locally-synced rows so the app keeps working offline. Teacher-code resolution
 * is a pure local lookup and never touches the API.
 */
import type { BookFilters } from '@epochstudio/content-client';
import { prisma } from '../lib/prisma';
import { isContentConfigured } from '../lib/contentClient';
import { ContentService } from './content.service';
import { logger } from '../utils/logger';

/** Minimal Prisma delegate surface for the generic reference resolver. */
interface RefDelegate {
  findUnique(args: { where: { externalId: string }; select: { id: true; name: true } }): Promise<{ id: string; name: string } | null>;
  findFirst(args: { where: { name: string; externalId: null }; select: { id: true } }): Promise<{ id: string } | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  create(args: { data: Record<string, unknown>; select: { id: true } }): Promise<{ id: string }>;
}

/** Resolve an API reference item to its local id (adopt same-named row, else create). */
async function resolveRef(model: RefDelegate, extId: string, name: string, extraCreate: Record<string, unknown> = {}): Promise<string> {
  const existing = await model.findUnique({ where: { externalId: extId }, select: { id: true, name: true } });
  if (existing) {
    if (existing.name !== name) await model.update({ where: { id: existing.id }, data: { name } });
    return existing.id;
  }
  const byName = await model.findFirst({ where: { name, externalId: null }, select: { id: true } });
  if (byName) { await model.update({ where: { id: byName.id }, data: { externalId: extId } }); return byName.id; }
  const created = await model.create({ data: { name, externalId: extId, status: 'ACTIVE', ...extraCreate }, select: { id: true } });
  return created.id;
}

/** External id for a local reference row (null when it was never synced). */
async function externalIdOf(model: { findUnique(args: { where: { id: string }; select: { externalId: true } }): Promise<{ externalId: string | null } | null> }, localId: string): Promise<string | null> {
  const row = await model.findUnique({ where: { id: localId }, select: { externalId: true } });
  return row?.externalId ?? null;
}

export const CatalogService = {
  async listBoards(): Promise<{ id: string; name: string }[]> {
    if (isContentConfigured()) {
      try {
        const boards = await ContentService.getBoards();
        const items = await Promise.all(boards.map(async b => ({ id: await resolveRef(prisma.board as unknown as RefDelegate, String(b.id), b.name), name: b.name })));
        return items.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        logger.warn(`[catalog] boards from API failed, using local rows: ${(err as Error).message}`);
      }
    }
    return prisma.board.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  },

  async listClasses(): Promise<{ id: string; name: string; serial: string | null }[]> {
    if (isContentConfigured()) {
      try {
        const standards = await ContentService.getStandards();
        const items = await Promise.all(standards.map(async s => ({
          id: await resolveRef(prisma.class as unknown as RefDelegate, String(s.id), s.name, { serial: String(s.order ?? '') }),
          name: s.name, serial: String(s.order ?? ''),
        })));
        return items.sort((a, b) => (a.serial ?? '').localeCompare(b.serial ?? '') || a.name.localeCompare(b.name));
      } catch (err) {
        logger.warn(`[catalog] classes from API failed, using local rows: ${(err as Error).message}`);
      }
    }
    return prisma.class.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, serial: true }, orderBy: [{ serial: 'asc' }, { name: 'asc' }] });
  },

  async listSeries(): Promise<{ id: string; name: string }[]> {
    if (isContentConfigured()) {
      try {
        const series = await ContentService.getSeries();
        const items = await Promise.all(series.map(async s => ({ id: await resolveRef(prisma.series as unknown as RefDelegate, String(s.id), s.name), name: s.name })));
        return items.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        logger.warn(`[catalog] series from API failed, using local rows: ${(err as Error).message}`);
      }
    }
    return prisma.series.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  },

  async listBooks(params: { boardId?: string; classId?: string; seriesId?: string }): Promise<{ id: string; name: string }[]> {
    if (isContentConfigured()) {
      try {
        // Translate the incoming LOCAL filter ids back to the API's external ids.
        const [extBoard, extClass, extSeries] = await Promise.all([
          params.boardId  ? externalIdOf(prisma.board, params.boardId)   : Promise.resolve(null),
          params.classId  ? externalIdOf(prisma.class, params.classId)   : Promise.resolve(null),
          params.seriesId ? externalIdOf(prisma.series, params.seriesId) : Promise.resolve(null),
        ]);
        // A filter whose local row was never synced can't be expressed to the API — fall back.
        if ((params.boardId && !extBoard) || (params.classId && !extClass) || (params.seriesId && !extSeries)) {
          throw new Error('filter id has no external mapping');
        }
        const filters: BookFilters = {};
        if (extBoard)  filters.boardId    = Number(extBoard);
        if (extClass)  filters.standardId = Number(extClass);
        if (extSeries) filters.seriesId   = Number(extSeries);

        const books = await ContentService.getBooks(filters);
        const items = await Promise.all(books.map(async b => ({ id: await resolveBookId(String(b.id), b.name), name: b.name })));
        return items.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        logger.warn(`[catalog] books from API failed, using local rows: ${(err as Error).message}`);
      }
    }
    return prisma.book.findMany({
      where: {
        status: 'ACTIVE',
        ...(params.boardId && { boardId: params.boardId }),
        ...(params.classId && { classId: params.classId }),
        ...(params.seriesId && { seriesId: params.seriesId }),
      },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    });
  },

  async resolveTeacherCode(code: string) {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { teacherCode: code },
      select: {
        id: true, boardId: true,
        board: { select: { id: true, name: true } },
        user: { select: { name: true } },
        classes: { select: { class: { select: { name: true } } } },
        teacherSeries: { select: { series: { select: { name: true } } } },
        books: { select: { book: { select: { name: true } } } },
      },
    });
    if (!teacher) return null;

    return {
      teacherCode: code,
      teacherName: teacher.user.name,
      board:       teacher.board ? { id: teacher.board.id, name: teacher.board.name } : null,
      classes:     teacher.classes.map(c => c.class.name),
      series:      teacher.teacherSeries.map(s => s.series.name),
      books:       teacher.books.map(b => b.book.name),
    };
  },
};

/** Resolve a Content-API book id to its local id (create a stub row on first sight). */
async function resolveBookId(extId: string, name: string): Promise<string> {
  const existing = await prisma.book.findUnique({ where: { externalId: extId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.book.create({ data: { name, externalId: extId, status: 'ACTIVE' }, select: { id: true } });
  return created.id;
}
