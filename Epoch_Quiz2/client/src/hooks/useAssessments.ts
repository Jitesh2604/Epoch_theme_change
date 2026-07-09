import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Assessment {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  totalMarks: number;
  passingMarks: number;
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
  create:    (data: { title: string; description?: string; duration: number; subjectExternalId?: string; classExternalId?: string; passingMarks?: number; assignedClassIds?: string[]; assignedStudentIds?: string[] }) =>
               api.post<Assessment>('/assessments', data),
  update:    (id: string, data: Partial<{ title: string; description: string; duration: number; subjectExternalId: string; classExternalId: string; passingMarks: number }>) =>
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
