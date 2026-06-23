import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  avatarHue: number;
  schoolName?: string | null;
  attempted?: number;
  totalScore?: number;
  totalPossible?: number;
  avgPercent: number;
  score?: number;
  totalMarks?: number;
  percent?: number;
  timeTakenSec?: number;
  submittedAt?: string | null;
}

export function useGlobalLeaderboard(params: { page?: number; limit?: number } = {}) {
  return useAsync<LeaderboardEntry[]>(
    () => api.getWithQuery('/leaderboard', { page: 1, limit: 10, ...params }),
    [JSON.stringify(params)],
  );
}

export function useAssessmentLeaderboard(assessmentId: string) {
  return useAsync<LeaderboardEntry[]>(
    () => api.get(`/assessments/${assessmentId}/leaderboard`),
    [assessmentId],
  );
}

export function useMyStats() {
  return useAsync(() => api.get('/users/me/stats'), []);
}
