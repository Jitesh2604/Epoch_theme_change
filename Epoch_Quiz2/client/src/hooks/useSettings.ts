import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Setting {
  key:      string;
  value:    string;
  category: string;
  label:    string;
  type:     string;
}

export function useSettings() {
  return useAsync<Setting[]>(() => api.get('/settings'), []);
}

export const settingsApi = {
  getAll:     () => api.get<Setting[]>('/settings'),
  getCategory:(category: string) => api.get<Setting[]>(`/settings/${category}`),
  updateMany: (updates: Record<string, string>) => api.patch<Setting[]>('/settings', updates),
};
