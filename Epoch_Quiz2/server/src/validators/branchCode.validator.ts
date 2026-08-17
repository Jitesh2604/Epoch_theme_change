import { z } from 'zod';

export const branchIdParamsSchema = z.object({
  branchId: z.string().min(1),
});

export const branchCodeIdParamsSchema = z.object({
  codeId: z.string().min(1),
});

// The code students type — normalized (trim + uppercase) at the boundary,
// case-insensitive lookups without a DB collation trick.
export const verifyBranchCodeSchema = z.object({
  code: z.string().trim().min(1, 'Branch code is required').max(40),
});

// School Admin's own "Create Branch" form (School Panel). No schoolId
// field — that's never accepted from the client; branchCode.service.ts's
// createBranch() always resolves it server-side from the authenticated
// School Admin's own SchoolRegistration, so one school's admin can never
// create a branch under another school.
export const createOwnBranchSchema = z.object({
  name:    z.string().trim().min(1, 'Branch name is required').max(120),
  stateId: z.string().min(1, 'Select a state'),
  city:    z.string().trim().min(1, 'City is required').max(80),
  address: z.string().trim().min(1, 'Address is required').max(500),
});

export type VerifyBranchCodeInput   = z.infer<typeof verifyBranchCodeSchema>;
export type CreateOwnBranchInput    = z.infer<typeof createOwnBranchSchema>;
