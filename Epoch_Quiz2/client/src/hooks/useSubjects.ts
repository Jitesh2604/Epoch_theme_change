import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Subject {
  id: string;
  name: string;
  slug: string;
}

export function useSubjects() {
  return useAsync<Subject[]>(() => api.get('/subjects'), []);
}
