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
//
// schoolName is free text (no catalog dropdown on the registration form
// anymore) — school.service.ts's register() finds-or-creates a matching
// School row by exact name. There is no branch selection/creation at
// registration at all anymore — SchoolRegistration.branchId is now
// nullable and simply left unset; the School Admin creates their own
// branch(es) afterward from the School Panel (see branchCode.validator.ts's
// createOwnBranchSchema / branchCode.service.ts's createBranch()).
// stateId is unchanged (still a dropdown over the full SchoolState catalog).
export const schoolRegisterSchema = z.object({
  name:              nameSchema,
  email:             emailSchema,
  password:          passwordSchema,
  mobileNo:          z.string().trim().min(7, 'Mobile number must be at least 7 digits').max(20),
  schoolName:        z.string().trim().min(2, 'School name is required').max(160),
  stateId:           z.string().min(1, 'Select a state'),
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
// city/address are optional here (the platform Admin's own catalog UI
// doesn't collect them) — they exist on the model primarily for the School
// Admin's own "Create Branch" form (see branchCode.validator.ts's
// createOwnBranchSchema, where they're required), reused via
// SchoolBranchService.create() so both paths share one implementation.
export const adminCreateSchoolBranchSchema = z.object({
  schoolId: z.string().min(1, 'schoolId is required'),
  stateId:  z.string().min(1, 'stateId is required'),
  name:     catalogNameSchema,
  city:     z.string().trim().max(80).optional(),
  address:  z.string().trim().max(500).optional(),
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
