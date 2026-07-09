/**
 * Catalogue / filter service.
 *
 * The Epoch Content API is the SINGLE SOURCE OF TRUTH for the filter attributes
 * (boards, classes/standards, series, books). We fetch them live (through the
 * cached ContentService) and return the API's EXTERNAL IDs directly — nothing
 * is written to or read back from MySQL. The ids returned here are the external
 * ids that the rest of the app stores (boardExternalId, classExternalId, …).
 *
 * When the Content API is not configured or is unreachable, catalog lists come
 * back empty (the endpoints never fail hard — the logged-out home page uses
 * some of them). Teacher-code resolution is a local lookup of app-owned profile
 * rows whose stored external ids are resolved to names via the cached API.
 */
import type { BookFilters } from '@epochstudio/content-client';
import { prisma } from '../lib/prisma';
import { ContentService, ContentMeta } from './content.service';
import { logger } from '../utils/logger';

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!ContentService.isConfigured()) return fallback;
  try { return await fn(); }
  catch (err) { logger.warn(`[catalog] ${label} unavailable: ${(err as Error).message}`); return fallback; }
}

export const CatalogService = {
  async listBoards(): Promise<{ id: string; name: string }[]> {
    return safe('boards', async () => {
      const boards = await ContentService.getBoards();
      return boards
        .map(b => ({ id: String(b.id), name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, []);
  },

  async listClasses(): Promise<{ id: string; name: string; serial: string | null }[]> {
    return safe('classes', async () => {
      const standards = await ContentService.getStandards();
      return standards
        .map(s => ({ id: String(s.id), name: s.name, serial: String(s.order ?? '') }))
        .sort((a, b) => (a.serial ?? '').localeCompare(b.serial ?? '') || a.name.localeCompare(b.name));
    }, []);
  },

  async listSeries(): Promise<{ id: string; name: string }[]> {
    return safe('series', async () => {
      const series = await ContentService.getSeries();
      return series
        .map(s => ({ id: String(s.id), name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, []);
  },

  async listBooks(params: { boardId?: string; classId?: string; seriesId?: string }): Promise<{ id: string; name: string }[]> {
    // `params.*` are Content API external ids (strings). Translate straight to
    // the API's numeric filter ids — no local mapping, no DB.
    return safe('books', async () => {
      const filters: BookFilters = {};
      if (params.boardId  && Number.isFinite(Number(params.boardId)))  filters.boardId    = Number(params.boardId);
      if (params.classId  && Number.isFinite(Number(params.classId)))  filters.standardId = Number(params.classId);
      if (params.seriesId && Number.isFinite(Number(params.seriesId))) filters.seriesId   = Number(params.seriesId);

      const books = await ContentService.getBooks(filters);
      return books
        .map(b => ({ id: String(b.id), name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }, []);
  },

  async resolveTeacherCode(code: string) {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { teacherCode: code },
      select: {
        id: true,
        boardExternalId: true,
        user: { select: { name: true } },
        classes: { select: { classExternalId: true } },
        teacherSeries: { select: { seriesExternalId: true } },
        books: { select: { bookExternalId: true } },
      },
    });
    if (!teacher) return null;

    // Resolve the stored external ids to display names via the cached API.
    const [boardMap, classMap, seriesMap, books] = await Promise.all([
      ContentMeta.boards(),
      ContentMeta.classes(),
      ContentMeta.seriesMap(),
      ContentMeta.books(teacher.books.map(b => b.bookExternalId).filter((v): v is string => !!v)),
    ]);

    const boardName = teacher.boardExternalId ? boardMap.get(String(teacher.boardExternalId)) ?? null : null;

    return {
      teacherCode: code,
      teacherName: teacher.user.name,
      board:       teacher.boardExternalId ? { id: teacher.boardExternalId, name: boardName } : null,
      classes:     teacher.classes.map(c => classMap.get(String(c.classExternalId)) ?? c.classExternalId).filter(Boolean),
      series:      teacher.teacherSeries.map(s => seriesMap.get(String(s.seriesExternalId)) ?? s.seriesExternalId).filter(Boolean),
      books:       books.map(b => b.name),
    };
  },
};
