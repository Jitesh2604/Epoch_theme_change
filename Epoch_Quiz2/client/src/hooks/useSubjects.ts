import { api } from '../lib/api';
import { useAsync } from './useApi';

export type SubjectKind = 'SUBJECT' | 'PRACTICE_OLYMPIAD' | 'ATTEMPTED_OLYMPIAD';

export interface Subject {
  id: string;
  name: string;
  slug: string;
  kind: SubjectKind;
}

export function useSubjects() {
  return useAsync<Subject[]>(() => api.get('/subjects'), []);
}

/** Only real, studiable subjects (excludes the Olympiad "mode" rows). */
export function useRealSubjects() {
  return useAsync<Subject[]>(
    () => api.get<Subject[]>('/subjects').then(list => list.filter(s => s.kind === 'SUBJECT')),
    [],
  );
}
