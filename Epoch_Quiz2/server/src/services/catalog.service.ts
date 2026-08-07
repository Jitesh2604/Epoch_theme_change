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
 * some of them).
 */
import type { BookFilters } from '@epochstudio/content-client';
import { ContentService, ContentMeta } from './content.service';
import { logger } from '../utils/logger';
import { sortByClassName } from '../lib/classOrder';

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
      // Sorted by the app's own curated academic order (Nursery..Class 12),
      // not the Content API's `order` field — that field was previously
      // compared as a STRING ("10" sorts before "2" lexicographically),
      // which is exactly the bug this fixes. See lib/classOrder.ts.
      const mapped = standards.map(s => ({ id: String(s.id), name: s.name, serial: String(s.order ?? '') }));
      return sortByClassName(mapped, s => s.name);
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

};
