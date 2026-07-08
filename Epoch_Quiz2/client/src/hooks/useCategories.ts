import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export function useCategories() {
  return useAsync<Category[]>(() => api.get('/categories'), []);
}
