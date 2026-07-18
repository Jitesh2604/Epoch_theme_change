import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Assessment {
  id: string;
  title: string;
  description: string | null;
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

export interface AssessmentAssignments {
  classes:  Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string; email: string }>;
}

export const assessmentApi = {
  create:    (data: { title: string; description?: string; duration: number; subjectExternalId?: string; classExternalId?: string; passingMarks?: number; negativeMarking?: boolean; negativeMarksValue?: number; assignedClassIds?: string[]; assignedStudentIds?: string[] }) =>
               api.post<Assessment>('/assessments', data),
  // Backend (PATCH/DELETE /assessments/:id) is fully implemented — including
  // the "archived assessments can't be edited" and "can't delete an
  // assessment with submissions" business rules — but there is no "Edit
  // assessment" or "Delete assessment" UI yet. Keep these wrappers for when
  // those screens are built; they are not dead code.
  update:    (id: string, data: Partial<{ title: string; description: string; duration: number; subjectExternalId: string; classExternalId: string; passingMarks: number; negativeMarking: boolean; negativeMarksValue: number }>) =>
               api.patch<Assessment>(`/assessments/${id}`, data),
  remove:    (id: string) => api.delete(`/assessments/${id}`),
  publish:   (id: string) => api.post<Assessment>(`/assessments/${id}/publish`),
  unpublish: (id: string) => api.post<Assessment>(`/assessments/${id}/unpublish`),
  archive:   (id: string) => api.post<Assessment>(`/assessments/${id}/archive`),
  // Assignment (replace-set): pass classIds and/or studentIds
  assign:         (id: string, data: { classIds?: string[]; studentIds?: string[] }) =>
                    api.post<AssessmentAssignments>(`/assessments/${id}/assign`, data),
  getAssignments: (id: string) => api.get<AssessmentAssignments>(`/assessments/${id}/assignments`),
};
