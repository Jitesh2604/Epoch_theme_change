import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface CatalogItem { id: string; name: string; serial?: string }
export interface CatalogBook { id: string; name: string }

export function useClasses() {
  return useAsync<CatalogItem[]>(() => api.get('/catalog/classes'), []);
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
