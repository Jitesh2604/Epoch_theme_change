import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface SubmissionListItem {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';
  score: number;
  totalMarks: number;
  percent: number;
  startedAt: string;
  submittedAt: string | null;
  timeTakenSec: number;
  assessment: { id: string; title: string; subject: { id: string; name: string } | null };
  student?: { id: string; name: string; email: string };
}

export interface SubmissionsPage {
  items: SubmissionListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useMySubmissions(params: { page?: number; limit?: number; status?: string } = {}) {
  return useAsync<SubmissionsPage>(
    () => api.getWithQuery('/submissions/me', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export function useSubmissions(params: { page?: number; limit?: number; assessmentId?: string; studentId?: string } = {}) {
  return useAsync<SubmissionsPage>(
    () => api.getWithQuery('/submissions', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}
