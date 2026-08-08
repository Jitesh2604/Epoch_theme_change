import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt limit

const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();
const nameSchema  = z.string().min(2, 'Name must be at least 2 characters').max(80).trim();
const catalogNameSchema = z.string().trim().min(1, 'Name is required').max(120);

// ── Public: School self-registration ──────────────────────────────────────
// Creates a SCHOOL_ADMIN User + a SchoolRegistration row, pending admin
// approval — see school.service.ts's register(). Deliberately separate from
// auth.validator.ts's registerSchema (STUDENT-only public signup).
export const schoolRegisterSchema = z.object({
  name:              nameSchema,
  email:             emailSchema,
  password:          passwordSchema,
  mobileNo:          z.string().trim().min(7, 'Mobile number must be at least 7 digits').max(20),
  schoolId:          z.string().min(1, 'Select a school'),
  stateId:           z.string().min(1, 'Select a state'),
  branchId:          z.string().min(1, 'Select a branch'),
  contactPersonName: z.string().trim().min(2, 'Contact person name is required').max(120),
  contactPhone:      z.string().trim().min(7, 'Contact phone must be at least 7 digits').max(20),
  address:           z.string().trim().min(1, 'Address is required').max(500),
  city:              z.string().trim().min(1, 'City is required').max(80),
  pincode:           z.string().trim().min(1, 'Pincode is required').max(20),
});

// ── Admin: School catalog CRUD ─────────────────────────────────────────────
export const adminCreateSchoolSchema = z.object({
  name:     catalogNameSchema,
  isActive: z.boolean().optional(),
});

export const adminUpdateSchoolSchema = z.object({
  name:     catalogNameSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

// ── Admin: SchoolState catalog CRUD ────────────────────────────────────────
export const adminCreateSchoolStateSchema = z.object({
  name:     catalogNameSchema,
  isActive: z.boolean().optional(),
});

export const adminUpdateSchoolStateSchema = z.object({
  name:     catalogNameSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const listSchoolStatesQuerySchema = z.object({
  schoolId: z.string().min(1).optional(),
});

// ── Admin: SchoolBranch catalog CRUD ───────────────────────────────────────
export const adminCreateSchoolBranchSchema = z.object({
  schoolId: z.string().min(1, 'schoolId is required'),
  stateId:  z.string().min(1, 'stateId is required'),
  name:     catalogNameSchema,
  isActive: z.boolean().optional(),
});

export const adminUpdateSchoolBranchSchema = z.object({
  name:     catalogNameSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const listSchoolBranchesQuerySchema = z.object({
  schoolId: z.string().min(1, 'schoolId is required'),
  stateId:  z.string().min(1).optional(),
});

export const catalogIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type SchoolRegisterInput          = z.infer<typeof schoolRegisterSchema>;
export type AdminCreateSchoolInput       = z.infer<typeof adminCreateSchoolSchema>;
export type AdminUpdateSchoolInput       = z.infer<typeof adminUpdateSchoolSchema>;
export type AdminCreateSchoolStateInput  = z.infer<typeof adminCreateSchoolStateSchema>;
export type AdminUpdateSchoolStateInput  = z.infer<typeof adminUpdateSchoolStateSchema>;
export type ListSchoolStatesQuery        = z.infer<typeof listSchoolStatesQuerySchema>;
export type AdminCreateSchoolBranchInput = z.infer<typeof adminCreateSchoolBranchSchema>;
export type AdminUpdateSchoolBranchInput = z.infer<typeof adminUpdateSchoolBranchSchema>;
export type ListSchoolBranchesQuery      = z.infer<typeof listSchoolBranchesQuerySchema>;
