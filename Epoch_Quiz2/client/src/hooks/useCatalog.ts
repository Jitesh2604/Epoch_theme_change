import { api, ApiError } from '../lib/api';
import { useAsync } from './useApi';

export interface CatalogItem { id: string; name: string; serial?: string }
export interface CatalogBook { id: string; name: string }

export function useBoards() {
  return useAsync<CatalogItem[]>(() => api.get('/catalog/boards'), []);
}

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

// ── Teacher-code lookup (students inherit the teacher's academic context) ──
export interface TeacherCodeInfo {
  teacherCode: string;
  teacherName: string;
  board: { id: string; name: string } | null;
  classes: string[];
  series: string[];
  books: string[];
}

/**
 * Resolve a teacher code → linked teacher + inherited context. Resolves to
 * null until a full 6-char code is entered, or when the code genuinely
 * matches no teacher (404). Any other failure (network drop, 5xx) is
 * rethrown so `useAsync` surfaces a real error instead of masquerading as
 * "no teacher found" — those are different situations for the user.
 */
export function useTeacherByCode(code: string) {
  const trimmed = code.trim().toUpperCase();
  return useAsync<TeacherCodeInfo | null>(
    () =>
      trimmed.length >= 6
        ? api
            .get<TeacherCodeInfo>(`/catalog/teacher/${encodeURIComponent(trimmed)}`)
            .catch((e) => {
              if (e instanceof ApiError && e.status === 404) return null;
              throw e;
            })
        : Promise.resolve(null),
    [trimmed],
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
