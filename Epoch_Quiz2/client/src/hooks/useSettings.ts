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
  updateMany: (updates: Record<string, string>) => api.patch<Setting[]>('/settings', updates),
};
