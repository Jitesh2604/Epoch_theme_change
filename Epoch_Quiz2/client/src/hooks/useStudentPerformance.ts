import { api } from '../lib/api';
import { useAsync } from './useApi';
import type { PracticeOverview, SubjectStat, QuestionTypeStat, TopicStat } from './useStudentAnalytics';
import type { RevisionDashboard } from './useRevision';

// Admin Analytics — Feature 2: Student Performance Analytics. Practice
// Olympiad only, same scope as Student Analytics (see
// server/src/services/analytics.service.ts) — never touches Assessment/
// Submission/leaderboard data.

export interface StudentCandidate {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
}

export interface RevisionStreakSummary {
  currentStreak: number;
  bestStreak: number;
  totalSessions: number;
  lastSessionDate: string | null;
}

export interface StudentBulkInsight {
  studentId: string;
  overview: PracticeOverview;
  subjects: SubjectStat[];
  questionTypes: QuestionTypeStat[];
  revisionStreak: RevisionStreakSummary;
}

export interface StudentDetail {
  overview: PracticeOverview;
  subjects: SubjectStat[];
  questionTypes: QuestionTypeStat[];
  topics: TopicStat[];
  revisionDashboard: RevisionDashboard;
}

/** Roster narrowing step — optionally scoped to one class. Search and every
 *  numeric/derived filter happen client-side over the assembled rows, same
 *  convention as ReportsPage.tsx. */
export function useStudentCandidates(classExternalId?: string) {
  return useAsync<StudentCandidate[]>(
    () => api.getWithQuery('/admin-analytics/students', { classExternalId }),
    [classExternalId],
  );
}

export const studentPerformanceApi = {
  getBulkInsights: (studentIds: string[]) =>
    api.post<StudentBulkInsight[]>('/admin-analytics/students/bulk-insights', { studentIds }),

  getStudentDetail: (studentId: string) =>
    api.get<StudentDetail>(`/admin-analytics/students/${studentId}/detail`),
};
