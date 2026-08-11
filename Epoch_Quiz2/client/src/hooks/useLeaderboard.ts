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

export function useMyStats() {
  return useAsync(() => api.get('/users/me/stats'), []);
}

// ── Assessment Leaderboard (School / State / Global) ───────────────────────
// Built on the per-assessment ranking above (GET /assessments/:id/leaderboard
// was the "not surfaced yet" building block) — see leaderboard.service.ts's
// listAssessmentSessions/assessmentLeaderboard/myAssessmentRanking.

export interface CatalogOption { id: string; name: string }

export interface LeaderboardSession {
  title: string;
  subjectExternalIds: string[];
  classExternalIds: string[];
}

export interface LeaderboardSessionsResponse {
  sessions: LeaderboardSession[];
  subjects: CatalogOption[];
  classes: CatalogOption[];
  /** true only for the server's DEV-only dummy fallback (see
   *  server/src/services/leaderboardDevFallback.ts) — always false/absent
   *  once real published-results Assessments exist, and never true in a
   *  production build regardless of what the DB contains. */
  devFallback?: boolean;
}

export function useLeaderboardSessions() {
  return useAsync<LeaderboardSessionsResponse>(() => api.get('/leaderboard/sessions'), []);
}

export type LeaderboardScope = 'school' | 'state' | 'global';

export interface AssessmentLeaderboardRow {
  rank: number;
  studentId: string;
  studentName: string;
  avatarHue: number;
  schoolName: string | null;
  state: string | null;
  classExternalId: string | null;
  className: string | null;
  score: number;
  totalMarks: number;
  percent: number;
  timeTakenSec: number;
  submissionId: string;
}

export interface AssessmentLeaderboardParams {
  scope: LeaderboardScope;
  session?: string;
  subjectExternalId?: string;
  classExternalId?: string;
  school?: string;
  page?: number;
  limit?: number;
}

export interface AssessmentLeaderboardResponse {
  items: AssessmentLeaderboardRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  reason?: 'NO_SCHOOL' | 'NO_STATE' | 'NO_SESSION';
  /** See LeaderboardSessionsResponse.devFallback. */
  devFallback?: boolean;
}

export function useAssessmentLeaderboard(params: AssessmentLeaderboardParams) {
  return useAsync<AssessmentLeaderboardResponse>(
    () => api.getWithQuery('/leaderboard/assessment', { page: 1, limit: 50, ...params }),
    [JSON.stringify(params)],
  );
}

export interface MyRankingParams {
  session?: string;
  subjectExternalId?: string;
  classExternalId?: string;
}

export interface MyAssessmentRanking {
  hasResult: boolean;
  reason?: 'NO_SESSION' | 'NO_RESULT';
  assessmentId?: string | null;
  assessmentTitle?: string | null;
  submissionId?: string;
  schoolRank?: number | null;
  stateRank?: number | null;
  globalRank?: number;
  score?: number;
  totalMarks?: number;
  percent?: number;
  timeTakenSec?: number;
  classExternalId?: string | null;
  className?: string | null;
  badges?: string[];
  /** See LeaderboardSessionsResponse.devFallback. */
  devFallback?: boolean;
}

export function useMyAssessmentRanking(params: MyRankingParams) {
  return useAsync<MyAssessmentRanking>(
    () => api.getWithQuery('/leaderboard/assessment/me', { ...params }),
    [JSON.stringify(params)],
  );
}
