import { api } from '../lib/api';
import { useAsync } from './useApi';
import type { PracticeOverview, SubjectStat, QuestionTypeStat, DifficultyStat, TopicStat } from './useStudentAnalytics';
import type { RevisionDashboard } from './useRevision';

// Admin Analytics — Feature 2: Student Performance Analytics (Practice
// Olympiad, via analytics.service.ts) — extended by Feature 6 to merge in
// Assessment/Submission stats (via assessmentAnalyticsShared.service.ts /
// assessmentOverview.service.ts's computeSubmissionStats, grouped
// per-student server-side). The two schemas are never joined in a query —
// only merged in this response shape.

export interface StudentCandidate {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
  /** Written on every login (auth.service.ts) — used for Active/Inactive
   *  KPI and DAU/WAU/MAU activity analytics. */
  lastLoginAt: string | null;
}

export interface RevisionStreakSummary {
  currentStreak: number;
  bestStreak: number;
  totalSessions: number;
  lastSessionDate: string | null;
}

/** Mirrors server's SubmissionStats (assessmentOverview.service.ts) —
 *  identical reducer, just grouped per-student (or, for the detail view,
 *  scoped to one student) instead of per-assessment. */
export interface SubmissionStats {
  totalAttempts: number;
  completedAttempts: number;
  incompleteAttempts: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  lowestScore: number;
  medianScore: number;
  stdDeviationScore: number;
  passRate: number;
  failRate: number;
  averageCompletionTimeSec: number;
}

/** The bulk-table row shape — SubmissionStats plus the two extra fields
 *  getBulkAssessmentStats derives alongside the reducer. */
export interface AssessmentStudentStats extends SubmissionStats {
  lastAssessmentDate: string | null;
  subjectIds: string[];
}

export interface AssessmentHistoryEntry {
  assessmentId: string;
  title: string;
  score: number;
  totalMarks: number;
  percent: number | null;
  passed: boolean | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';
  startedAt: string;
  submittedAt: string | null;
}

export interface StudentBulkInsight {
  studentId: string;
  overview: PracticeOverview;
  subjects: SubjectStat[];
  questionTypes: QuestionTypeStat[];
  revisionStreak: RevisionStreakSummary;
  assessment: AssessmentStudentStats | null;
}

export interface StudentDetail {
  overview: PracticeOverview;
  subjects: SubjectStat[];
  questionTypes: QuestionTypeStat[];
  difficulties: DifficultyStat[];
  topics: TopicStat[];
  revisionDashboard: RevisionDashboard;
  assessmentStats: SubmissionStats;
  assessmentHistory: AssessmentHistoryEntry[];
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
