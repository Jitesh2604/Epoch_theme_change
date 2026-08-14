import { api } from '../lib/api';

export interface TeacherCodeItem {
  id: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Admin-only catalog CRUD — mirrors schoolApi's shape/conventions
// (useSchools.ts). Deliberately no public list endpoint: a student who
// could browse valid codes could bypass the Assessment gate.
export const teacherCodeApi = {
  list:       (includeInactive = false) => api.getWithQuery<TeacherCodeItem[]>('/teacher-codes', { includeInactive }),
  create:     (data: { code: string; isActive?: boolean }) => api.post<TeacherCodeItem>('/teacher-codes', data),
  update:     (id: string, data: { code?: string; isActive?: boolean }) => api.patch<TeacherCodeItem>(`/teacher-codes/${id}`, data),
  deactivate: (id: string) => api.delete<TeacherCodeItem>(`/teacher-codes/${id}`),
};
