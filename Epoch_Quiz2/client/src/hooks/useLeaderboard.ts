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
}

export function useGlobalLeaderboard(params: { page?: number; limit?: number } = {}) {
  return useAsync<LeaderboardEntry[]>(
    () => api.getWithQuery('/leaderboard', { page: 1, limit: 10, ...params }),
    [JSON.stringify(params)],
  );
}

// Per-assessment leaderboard (GET /assessments/:id/leaderboard) is fully
// implemented server-side but intentionally not surfaced in the UI yet —
// ranking/leaderboards for a single assessment are out of scope for this
// release. Re-add a hook here (mirroring useGlobalLeaderboard) when that
// feature is scheduled; don't wire up a partial version before then.

export function useMyStats() {
  return useAsync(() => api.get('/users/me/stats'), []);
}
