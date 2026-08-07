import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface DashboardStats {
  counts: { students: number; assessments: number; submissions: number; practiceAttempts: number };
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

// ── Feature A1: Admin Dashboard ──────────────────────────────────────────
// Everything NOT already covered by DashboardStats above (recent
// assessments/submissions come from there; recent practice activity comes
// from useQuizAttempts; recent student registrations come from useStudents
// — all reused directly, not duplicated here).

export interface AdminOverview {
  contentCatalog: { totalSubjects: number; totalBoards: number; totalClasses: number };
  questionBank: {
    total: number; active: number; draft: number;
    subjectsCovered: number; chaptersCovered: number;
    byType: Record<string, number>;
    gradableActiveCount: number;
  };
  todaysActivity: {
    studentsLoggedIn: number; practiceStarted: number; practiceCompleted: number;
    assessmentsStarted: number; assessmentsCompleted: number;
  };
  activeStudentsToday: number;
  charts: {
    studentGrowth: { date: string; count: number }[];
    practiceActivity: { date: string; count: number }[];
    subjectPopularity: { subjectId: string; subjectName: string; count: number }[];
    accuracyDistribution: { band: string; count: number; percentage: number }[];
    dailyActiveStudents: { date: string; count: number }[];
  };
  performanceIndicators: {
    avgAccuracy: number;
    /** Simplified platform-wide proxy, not the exact per-student Feature 8
     *  confidence formula — see adminDashboard.service.ts for why. */
    avgConfidenceScoreApprox: number;
    avgPracticeTimeSec: number;
    avgQuestionsPerSession: number;
  };
}

export function useAdminOverview() {
  return useAsync<AdminOverview>(() => api.get('/dashboard/admin-overview'), []);
}
