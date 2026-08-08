import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SchoolBranchItem extends CatalogItem {
  schoolId: string;
  stateId: string;
}

export interface SchoolRegisterPayload {
  name: string;
  email: string;
  password: string;
  mobileNo: string;
  schoolId: string;
  stateId: string;
  branchId: string;
  contactPersonName: string;
  contactPhone: string;
  address: string;
  city: string;
  pincode: string;
}

// Public catalog reads + the self-registration submit — used by the
// (logged-out) School registration form. Mirrors useUsers.ts/useSubjects.ts.
export const schoolApi = {
  listSchools: (includeInactive = false) =>
    api.getWithQuery<CatalogItem[]>('/schools', { includeInactive }),

  // No schoolId -> full state catalog (admin use). With schoolId -> only
  // states that school actually has a branch in (registration cascade).
  listStates: (schoolId?: string, includeInactive = false) =>
    api.getWithQuery<CatalogItem[]>('/school-states', { schoolId, includeInactive }),

  listBranches: (schoolId: string, stateId?: string, includeInactive = false) =>
    api.getWithQuery<SchoolBranchItem[]>('/school-branches', { schoolId, stateId, includeInactive }),

  register: (payload: SchoolRegisterPayload) =>
    api.post<{ email: string }>('/schools/register', payload, { skipAuth: true }),

  // ── Admin catalog management ─────────────────────────────────────────
  createSchool: (data: { name: string }) => api.post<CatalogItem>('/schools', data),
  updateSchool: (id: string, data: { name?: string; isActive?: boolean }) => api.patch<CatalogItem>(`/schools/${id}`, data),
  deactivateSchool: (id: string) => api.delete<CatalogItem>(`/schools/${id}`),

  createState: (data: { name: string }) => api.post<CatalogItem>('/school-states', data),
  updateState: (id: string, data: { name?: string; isActive?: boolean }) => api.patch<CatalogItem>(`/school-states/${id}`, data),
  deactivateState: (id: string) => api.delete<CatalogItem>(`/school-states/${id}`),

  createBranch: (data: { schoolId: string; stateId: string; name: string }) => api.post<SchoolBranchItem>('/school-branches', data),
  updateBranch: (id: string, data: { name?: string; isActive?: boolean }) => api.patch<SchoolBranchItem>(`/school-branches/${id}`, data),
  deactivateBranch: (id: string) => api.delete<SchoolBranchItem>(`/school-branches/${id}`),
};

export function useSchoolCatalog(includeInactive = false) {
  return useAsync<CatalogItem[]>(() => schoolApi.listSchools(includeInactive), [includeInactive]);
}

export function useSchoolStates(includeInactive = false) {
  return useAsync<CatalogItem[]>(() => schoolApi.listStates(undefined, includeInactive), [includeInactive]);
}

export function useSchoolBranches(schoolId: string | null, stateId: string | null, includeInactive = false) {
  return useAsync<SchoolBranchItem[]>(
    () => (schoolId ? schoolApi.listBranches(schoolId, stateId ?? undefined, includeInactive) : Promise.resolve([])),
    [schoolId, stateId, includeInactive],
  );
}
