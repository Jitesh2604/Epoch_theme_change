import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Assessment {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  // Enforced end-to-end: a wrong, attempted answer is docked
  // negativeMarksValue marks during grading (or a per-question override —
  // see AssessmentQuestion.negMarksOverride); skipped questions are never
  // penalized; a submission's total score floors at 0.
  negativeMarking: boolean;
  negativeMarksValue: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  resultsPublished: boolean;
  resultPublishAt: string | null;
  resultsVisible: boolean;
  subject: { id: string; name: string; slug: string } | null;
  createdBy: { id: string; name: string; email: string };
  questionCount: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentsPage {
  items: Assessment[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useAssessments(params: {
  page?: number;
  limit?: number;
  status?: string;
  subjectExternalId?: string;
  search?: string;
} = {}) {
  return useAsync<AssessmentsPage>(
    () => api.getWithQuery('/assessments', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export function useAssessment(id: string) {
  return useAsync<Assessment>(() => api.get(`/assessments/${id}`), [id]);
}

/** The backend's ASSESSMENT_CONFIG (server/src/config/assessmentConfig.ts)
 *  — the admin "Auto-Generate" UI reads this instead of hardcoding the
 *  question count/marks/duration/difficulty mix. */
export interface AssessmentGenerationConfig {
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  difficultyDistribution: Record<'EASY' | 'MEDIUM' | 'HARD', number>;
}

export function useAssessmentGenerationConfig() {
  return useAsync<AssessmentGenerationConfig>(() => api.get('/assessments/generate-config'), []);
}

// Has the logged-in student verified their Branch Code yet? Checked live
// server-side (server/src/middlewares/requireBranchVerification.ts is the
// actual security gate on /assessments/:id/start) — this is only used to
// decide whether the frontend shows the "Enter your Branch Code" popup
// instead of the assessment list/overview.
export function useAssessmentAccess() {
  return useAsync<{ hasAccess: boolean }>(() => api.get('/assessments/access'), []);
}

export interface AssessmentAssignments {
  classes:  Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string; email: string }>;
}

export const assessmentApi = {
  create:    (data: { title: string; description?: string; instructions?: string | null; duration: number; subjectExternalId?: string; classExternalId?: string; passingMarks?: number; negativeMarking?: boolean; negativeMarksValue?: number; resultsPublished?: boolean; resultPublishAt?: string | null; assignedClassIds?: string[]; assignedStudentIds?: string[] }) =>
               api.post<Assessment>('/assessments', data),
  // Auto-generate: question count/marks/duration/difficulty mix all come
  // from the backend's ASSESSMENT_CONFIG (see useAssessmentGenerationConfig
  // below) — no duration/totalMarks field to pass here, unlike create().
  generate:  (data: { title: string; description?: string; instructions?: string | null; subjectExternalId: string; classExternalId?: string; passingMarks?: number; negativeMarking?: boolean; negativeMarksValue?: number; resultsPublished?: boolean; resultPublishAt?: string | null; assignedClassIds?: string[]; assignedStudentIds?: string[] }) =>
               api.post<Assessment>('/assessments/generate', data),
  update:    (id: string, data: Partial<{ title: string; description: string; instructions: string | null; duration: number; subjectExternalId: string; classExternalId: string; passingMarks: number; negativeMarking: boolean; negativeMarksValue: number; resultsPublished: boolean; resultPublishAt: string | null }>) =>
               api.patch<Assessment>(`/assessments/${id}`, data),
  remove:    (id: string) => api.delete(`/assessments/${id}`),
  publish:   (id: string) => api.post<Assessment>(`/assessments/${id}/publish`),
  unpublish: (id: string) => api.post<Assessment>(`/assessments/${id}/unpublish`),
  archive:   (id: string) => api.post<Assessment>(`/assessments/${id}/archive`),
  publishResults:   (id: string) => api.post<Assessment>(`/assessments/${id}/publish-results`),
  unpublishResults: (id: string) => api.post<Assessment>(`/assessments/${id}/unpublish-results`),
  // Assignment (replace-set): pass classIds and/or studentIds
  assign:         (id: string, data: { classIds?: string[]; studentIds?: string[] }) =>
                    api.post<AssessmentAssignments>(`/assessments/${id}/assign`, data),
  getAssignments: (id: string) => api.get<AssessmentAssignments>(`/assessments/${id}/assignments`),
};
