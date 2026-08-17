import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface BranchCodeSummary {
  id: string;
  code: string;
  createdAt: string;
}

export interface SchoolBranchItem {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  verifiedStudentCount: number;
  activeCode: BranchCodeSummary | null;
}

export interface CreateBranchPayload {
  name: string;
  stateId: string;
  city: string;
  address: string;
}

export interface MyBranchStatus {
  schoolName: string | null;
  branchName: string | null;
  verified: boolean;
  verifiedAt: string | null;
}

export interface VerifyResult {
  alreadyVerified: boolean;
}

// ── School Admin — Branch Code management (School Panel) ───────────────────
// Every call is auto-scoped server-side to the caller's own SchoolRegistration
// (school) — an admin manages every branch of their own school (see
// server/src/services/branchCode.service.ts's requireAdminSchool), never
// another school's.
export const branchCodeAdminApi = {
  myBranches:   () => api.get<SchoolBranchItem[]>('/branch-codes/my-branches'),
  // schoolId is never sent — the backend always resolves it from the
  // logged-in School Admin's own SchoolRegistration (see
  // BranchCodeService.createBranch).
  createBranch: (data: CreateBranchPayload) => api.post<SchoolBranchItem>('/branch-codes/branches', data),
  generateCode: (branchId: string) => api.post<BranchCodeSummary>(`/branch-codes/branches/${branchId}/generate`),
  deactivateCode: (codeId: string) => api.post(`/branch-codes/${codeId}/deactivate`),
};

export function useMyBranches() {
  return useAsync<SchoolBranchItem[]>(() => branchCodeAdminApi.myBranches(), []);
}

// ── Student — verify the School+Branch they already selected at registration ──
export const branchCodeApi = {
  verify: (code: string) => api.post<VerifyResult>('/branch-codes/verify', { code }),
  mine:   () => api.get<MyBranchStatus | null>('/branch-codes/mine'),
};

export function useMyBranchStatus() {
  return useAsync<MyBranchStatus | null>(() => branchCodeApi.mine(), []);
}
