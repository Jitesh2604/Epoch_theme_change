import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface DashboardStats {
  counts: { teachers: number; students: number; assessments: number; submissions: number };
  completionRate: number;
  recentAssessments: Array<{
    id: string; title: string; subject: { id: string; name: string } | null;
    status: string; createdBy: { id: string; name: string };
    questionCount: number; attempts: number; createdAt: string;
  }>;
  recentSubmissions: Array<{
    id: string;
    student: { id: string; name: string; avatarHue: number };
    assessment: { id: string; title: string; subject: { name: string } | null };
    score: number; totalMarks: number; percent: number; status: string; submittedAt: string | null;
  }>;
}

export function useDashboardStats() {
  return useAsync<DashboardStats>(() => api.get('/dashboard/stats'), []);
}
