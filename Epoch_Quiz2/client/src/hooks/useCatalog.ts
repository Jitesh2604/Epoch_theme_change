import { api } from '../lib/api';
import { useAsync } from './useApi';
import { sortByClassName } from '../lib/classOrder';

export interface CatalogItem { id: string; name: string; serial?: string }
export interface CatalogBook { id: string; name: string }

/** Server (/catalog/classes) already returns classes in academic order
 *  (see catalog.service.ts / lib/classOrder.ts) — re-sorted here too so
 *  every consumer of this hook stays correct even if that ever changes,
 *  without every caller having to remember to sort it themselves. */
export function useClasses() {
  const result = useAsync<CatalogItem[]>(() => api.get('/catalog/classes'), []);
  return { ...result, data: result.data ? sortByClassName(result.data, c => c.name) : result.data };
}

export function useBoards() {
  return useAsync<CatalogItem[]>(() => api.get('/catalog/boards'), []);
}

export function useCatalogSeries() {
  return useAsync<CatalogItem[]>(() => api.get('/catalog/series'), []);
}

export function useBooks(params: { boardId?: string; classId?: string; seriesId?: string }) {
  return useAsync<CatalogBook[]>(
    () => api.getWithQuery('/catalog/books', params),
    [JSON.stringify(params)],
  );
}

export const catalogPresets = {
  countries: [
    'India',
    'United States',
    'United Kingdom',
    'Australia',
    'Canada',
    'Singapore',
    'UAE',
    'South Africa',
    'Bangladesh',
    'Nepal',
    'Sri Lanka',
    'Pakistan',
    'Other',
  ],
};
