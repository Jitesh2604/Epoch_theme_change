import { api } from '../lib/api';
import { useAsync } from './useApi';
import type { SubmissionResult } from './useSubmissionApi';
import type { OlympiadAttemptSummary } from './usePracticeQuiz';
import type { StudentDetail as StudentAnalyticsDetail } from './useStudentPerformance';
import type { Certificate } from './useCertificates';
import type { MyAssessmentRanking } from './useLeaderboard';

// School Panel — every call below hits a SCHOOL_ADMIN-only endpoint that
// resolves the caller's own school server-side (see
// server/src/services/schoolPanel.service.ts's resolveAdminSchool) and
// never trusts a client-supplied schoolId. branchId here is purely an
// optional narrowing filter within that already-resolved school.

export interface SchoolDashboardActivity {
  id: string;
  studentName: string;
  assessmentTitle: string;
  submittedAt: string;
}

export interface SchoolDashboardResult extends SchoolDashboardActivity {
  subjectName: string | null;
  score: number;
  totalMarks: number;
  percent: number;
}

export interface SchoolDashboard {
  totalStudents: number;
  activeStudents: number;
  assessmentsAttempted: number;
  averageScore: number;
  averagePercentage: number;
  recentActivity: SchoolDashboardActivity[];
  recentResults: SchoolDashboardResult[];
}

export function useSchoolDashboard() {
  return useAsync<SchoolDashboard>(() => api.get('/school-panel/dashboard'), []);
}

export interface PageMeta { page: number; limit: number; total: number; totalPages: number }

export interface SchoolStudentRow {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  status: string;
  verified: boolean;
  className: string | null;
  branchName: string | null;
  assessmentsAttempted: number;
  averageScore: number;
  averagePercentage: number;
}

export interface SchoolStudentsParams {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  classExternalId?: string;
  verified?: 'true' | 'false';
}

export function useSchoolStudents(params: SchoolStudentsParams) {
  return useAsync<{ items: SchoolStudentRow[]; meta: PageMeta }>(
    () => api.getWithQuery('/school-panel/students', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export interface SchoolStudentProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
  branchId: string | null;
  schoolName: string | null;
  branchName: string | null;
  verified: boolean;
  joinedAt: string;
  lastLoginAt: string | null;
  dob: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  educationBoard: string | null;
}

export interface SchoolStudentPerformance {
  assessmentsAttempted: number;
  overallScore: number;
  overallTotalMarks: number;
  averagePercentage: number;
  bestPercent: number;
}

export interface SchoolStudentSubjectStat {
  subjectId: string;
  subjectName: string;
  attempted: number;
  averageScore: number;
  averagePercentage: number;
}

export interface SchoolStudentHistoryEntry {
  submissionId: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectName: string;
  score: number;
  totalMarks: number;
  percent: number;
  rank: number | null;
  submittedAt: string;
  status: string;
  correctAnswers: number;
  wrongAnswers: number;
  skippedAnswers: number;
}

export interface SchoolStudentDetail {
  profile: SchoolStudentProfile;
  performance: SchoolStudentPerformance;
  subjectWise: SchoolStudentSubjectStat[];
  assessmentHistory: SchoolStudentHistoryEntry[];
}

export function useSchoolStudentDetail(studentId: string | undefined) {
  return useAsync<SchoolStudentDetail>(
    () => api.get(`/school-panel/students/${studentId}`),
    [studentId],
  );
}

/** Student Details → Edit Profile. schoolId is never a field here — the
 *  backend resolves/enforces it server-side (see schoolPanel.service.ts's
 *  updateStudentProfile) and rejects any attempt to move a student to
 *  another school; branchId, if changed, is only ever validated against
 *  the caller's OWN school's branches. */
export interface SchoolUpdateStudentProfilePayload {
  name?: string;
  email?: string;
  phone?: string | null;
  dob?: string | null;
  branchId?: string | null;
  classExternalId?: string | null;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  zip?: string | null;
  educationBoard?: string | null;
}

export const schoolPanelApi = {
  updateStudentProfile: (studentId: string, data: SchoolUpdateStudentProfilePayload) =>
    api.patch<SchoolStudentDetail>(`/school-panel/students/${studentId}`, data),
};

export interface SchoolResultRow {
  submissionId: string;
  studentId: string;
  studentName: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectName: string;
  className: string | null;
  branchName: string | null;
  score: number;
  totalMarks: number;
  percent: number;
  passed: boolean;
  rank: number | null;
  submittedAt: string;
}

export interface SchoolResultsParams {
  page?: number;
  limit?: number;
  studentId?: string;
  subjectExternalId?: string;
  classExternalId?: string;
  branchId?: string;
  assessmentId?: string;
  session?: string;
}

export function useSchoolResults(params: SchoolResultsParams) {
  return useAsync<{ items: SchoolResultRow[]; meta: PageMeta }>(
    () => api.getWithQuery('/school-panel/results', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export interface SchoolFilterOptions {
  branches: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  sessions: string[];
}

export function useSchoolFilterOptions() {
  return useAsync<SchoolFilterOptions>(() => api.get('/school-panel/filter-options'), []);
}

// ── School Leaderboard — reuses LeaderboardService.rankRows via
// LeaderboardService.forSchoolPanel; no second ranking algorithm. ─────────

export interface SchoolLeaderboardRow {
  rank: number;
  studentId: string;
  studentName: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
  branchName: string | null;
  subjectName: string;
  score: number;
  totalMarks: number;
  percent: number;
  timeTakenSec: number;
  submissionId: string;
}

export interface SchoolLeaderboardParams {
  page?: number;
  limit?: number;
  session?: string;
  subjectExternalId?: string;
  classExternalId?: string;
  branchId?: string;
}

export interface SchoolLeaderboardResponse {
  items: SchoolLeaderboardRow[];
  meta: PageMeta;
  reason?: 'NO_SESSION';
}

export function useSchoolLeaderboard(params: SchoolLeaderboardParams) {
  return useAsync<SchoolLeaderboardResponse>(
    () => api.getWithQuery('/school-panel/leaderboard', { page: 1, limit: 50, ...params }),
    [JSON.stringify(params)],
  );
}

// ── Student Details tabs — each independently school-scoped server-side
// (see schoolPanel.service.ts's requireStudentInSchool / the sibling
// checks in submission.service.ts's getForSchoolAdmin and
// leaderboard.service.ts's studentRanking) — every hook below 404s if the
// studentId doesn't belong to the caller's own school. ────────────────────

/** Answer Sheet tab — same shape a student sees for their own completed
 *  submission (SubmissionResult), reused verbatim server-side. */
export function useSchoolStudentSubmission(studentId: string | undefined, submissionId: string | undefined) {
  return useAsync<SubmissionResult>(
    () => api.get(`/school-panel/students/${studentId}/submissions/${submissionId}`),
    [studentId, submissionId],
  );
}

/** Practice tab — same list shape a student's own Practice/Olympiad
 *  attempt history uses (OlympiadAttemptSummary[]). */
export function useSchoolStudentPractice(studentId: string | undefined) {
  return useAsync<OlympiadAttemptSummary[]>(
    () => api.get(`/school-panel/students/${studentId}/practice`),
    [studentId],
  );
}

/** Analytics tab — the same Practice-based analytics (overview/subjects/
 *  difficulties/topics/revision/assessment stats) Admin Analytics'
 *  Student Performance detail view already computes for an admin-chosen
 *  studentId (useStudentPerformance.ts's StudentDetail), reused here under
 *  a school-scoped route instead of the platform-Admin-only one. */
export function useSchoolStudentAnalytics(studentId: string | undefined) {
  return useAsync<StudentAnalyticsDetail>(
    () => api.get(`/school-panel/students/${studentId}/analytics`),
    [studentId],
  );
}

/** Certificates tab — same Certificate[] shape a student sees for their
 *  own certificates (useCertificates.ts's Certificate). */
export function useSchoolStudentCertificates(studentId: string | undefined) {
  return useAsync<Certificate[]>(
    () => api.get(`/school-panel/students/${studentId}/certificates`),
    [studentId],
  );
}

export interface SchoolStudentRankingParams {
  session?: string;
  subjectExternalId?: string;
  classExternalId?: string;
}

/** Leaderboard tab — same School/State/Global ranking + badges shape a
 *  student sees for themselves (useLeaderboard.ts's MyAssessmentRanking). */
export function useSchoolStudentRanking(studentId: string | undefined, params: SchoolStudentRankingParams) {
  return useAsync<MyAssessmentRanking>(
    () => api.getWithQuery(`/school-panel/students/${studentId}/ranking`, { ...params }),
    [studentId, JSON.stringify(params)],
  );
}
