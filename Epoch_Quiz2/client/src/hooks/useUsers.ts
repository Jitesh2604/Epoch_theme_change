import { api } from '../lib/api';
import { useAsync } from './useApi';

interface NestedProfile {
  id?: string;
  mobileNo?: string | null;
  dob?: string | null;
  schoolName?: string | null;
  teacherCode?: string | null;
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

interface NestedSchoolRegistration {
  id?: string;
  schoolId: string;
  stateId: string;
  branchId: string;
  schoolName: string;
  stateName: string;
  branchName: string;
  contactPersonName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  createdAt?: string;
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
  studentProfile?: NestedProfile | null;
  schoolRegistration?: NestedSchoolRegistration | null;
}

export function useMyProfile() {
  return useAsync<FullProfile>(() => api.get('/users/me'), []);
}

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  schoolName: string | null;
  /** Feature A1 (Admin Dashboard) — "Recent Student Registrations" needs
   *  Class/Board per student; resolved server-side via ContentMeta. */
  className: string | null;
  educationBoard: string | null;
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

export function useStudents(params: { page?: number; limit?: number; search?: string; status?: string } = {}) {
  return useAsync<UsersPage<StudentRow>>(
    () => api.getWithQuery('/users/students', { page: 1, limit: 30, ...params }),
    [JSON.stringify(params)],
  );
}

// Generic admin user listing (GET /users) — role/status filters already
// supported server-side (see listUsersQuerySchema); used for the Schools
// Panel's "Pending School Approvals" list (role=SCHOOL_ADMIN&status=PENDING).
export function useAdminUsers(params: { page?: number; limit?: number; role?: string; status?: string; search?: string } = {}) {
  return useAsync<UsersPage<FullProfile>>(
    () => api.getWithQuery('/users', { page: 1, limit: 50, ...params }),
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
  updateMe: (data: { name?: string; avatarHue?: number; schoolName?: string; classExternalId?: string | null; teacherCode?: string | null }) =>
    api.patch('/users/me', data),
  // Backend (PATCH /users/me/password) is fully implemented (self-service
  // password change). No "Change password" UI exists on the Profile pages
  // yet. Keep this wrapper for when that form is built.
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.patch('/users/me/password', data),
};
