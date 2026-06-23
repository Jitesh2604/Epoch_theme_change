import { api } from '../lib/api';
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

/** Resolve a teacher code → linked teacher + inherited context. Returns null until a full 6-char code is entered, or when the code matches no teacher. */
export function useTeacherByCode(code: string) {
  const trimmed = code.trim().toUpperCase();
  return useAsync<TeacherCodeInfo | null>(
    () =>
      trimmed.length >= 6
        ? api
            .get<TeacherCodeInfo>(`/catalog/teacher/${encodeURIComponent(trimmed)}`)
            .catch(() => null)
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
