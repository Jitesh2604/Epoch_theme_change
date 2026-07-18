import { api } from '../lib/api';
import { useAsync } from './useApi';

interface NestedProfile {
  id?: string;
  mobileNo?: string | null;
  dob?: string | null;
  schoolName?: string | null;
  teacherCode?: string | null;
  bio?: string | null;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  zip?: string | null;
  educationBoard?: string | null;
  stateBoard?: string | null;
  imageUrl?: string | null;
  classExternalId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FullProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatarHue: number;
  profileComplete: boolean;
  createdAt: string;
  updatedAt?: string | null;
  mobileNo?: string | null;
  teacherProfile?: NestedProfile | null;
  studentProfile?: NestedProfile | null;
}

export function useMyProfile() {
  return useAsync<FullProfile>(() => api.get('/users/me'), []);
}

export interface TeacherRow {
  id: string;
  name: string;
  email: string;
  schoolName: string | null;
  bio: string | null;
  assessments: number;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  joinedAt: string;
  avatarHue: number;
}

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  schoolName: string | null;
  teacherCode: string | null;
  attempted: number;
  avgScore: number;
  rank: number;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  joinedAt: string;
  avatarHue: number;
}

interface UsersPage<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useTeachers(params: { page?: number; limit?: number; search?: string; status?: string } = {}) {
  return useAsync<UsersPage<TeacherRow>>(
    () => api.getWithQuery('/users/teachers', { page: 1, limit: 30, ...params }),
    [JSON.stringify(params)],
  );
}

export function useStudents(params: { page?: number; limit?: number; search?: string; status?: string } = {}) {
  return useAsync<UsersPage<StudentRow>>(
    () => api.getWithQuery('/users/students', { page: 1, limit: 30, ...params }),
    [JSON.stringify(params)],
  );
}

export const userApi = {
  create: (data: { name: string; email: string; password: string; role: string; schoolName?: string }) =>
    api.post('/users', data),
  // Backend (PATCH/DELETE /users/:id) is fully implemented — admin-only,
  // covers name/email/status/avatarHue edits and a soft "deactivate" (not a
  // hard delete). There is no admin "Edit user" / "Deactivate user" UI yet.
  // Keep these wrappers for when that screen is built; they are not dead code.
  update: (id: string, data: { name?: string; status?: string; schoolName?: string }) =>
    api.patch(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
  updateMe: (data: { name?: string; avatarHue?: number; schoolName?: string; bio?: string; teacherCode?: string; classExternalId?: string | null }) =>
    api.patch('/users/me', data),
  // Backend (PATCH /users/me/password) is fully implemented (self-service
  // password change). No "Change password" UI exists on the Profile pages
  // yet. Keep this wrapper for when that form is built.
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.patch('/users/me/password', data),
};
