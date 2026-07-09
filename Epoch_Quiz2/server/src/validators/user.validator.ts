import { z } from 'zod';
import { Role, UserStatus } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';
import { EDUCATION_BOARD_CODES } from '../lib/educationBoards';

const emailSchema    = z.string().email().toLowerCase().trim();
const nameSchema     = z.string().min(2).max(80).trim();
const passwordSchema = z.string().min(8).max(72);

export const adminCreateUserSchema = z.object({
  name:        nameSchema,
  email:       emailSchema,
  password:    passwordSchema,
  role:        z.nativeEnum(Role),
  status:      z.nativeEnum(UserStatus).optional(),
  avatarHue:   z.number().int().min(0).max(360).optional(),
  schoolName:  z.string().trim().min(1).max(120).optional(),
  teacherCode: z.string().trim().min(1).max(40).optional(),
  bio:         z.string().trim().max(1000).optional(),
});

export const adminUpdateUserSchema = z.object({
  name:        nameSchema.optional(),
  email:       emailSchema.optional(),
  status:      z.nativeEnum(UserStatus).optional(),
  avatarHue:   z.number().int().min(0).max(360).optional(),
  schoolName:  z.string().trim().min(1).max(120).optional().nullable(),
  teacherCode: z.string().trim().min(1).max(40).optional().nullable(),
  bio:         z.string().trim().max(1000).optional().nullable(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const updateProfileSchema = z.object({
  // User-level
  name:      nameSchema.optional(),
  avatarHue: z.number().int().min(0).max(360).optional(),
  // Scalar profile fields
  dob:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  schoolName: z.string().trim().min(1).max(200).optional().nullable(),
  address:   z.string().trim().max(500).optional().nullable(),
  country:   z.string().trim().max(80).optional().nullable(),
  state:     z.string().trim().max(80).optional().nullable(),
  city:      z.string().trim().max(80).optional().nullable(),
  zip:       z.string().trim().max(20).optional().nullable(),
  // Profile image — stored as a data URL or hosted URL (≤ ~3 MB base64)
  imageUrl:  z.string().trim().max(3_500_000).optional().nullable(),
  // Education board (curated curriculum taxonomy — see lib/educationBoards)
  educationBoard: z.enum(EDUCATION_BOARD_CODES).optional().nullable(),
  stateBoard:     z.string().trim().max(120).optional().nullable(),
  // FK fields (single select)
  boardExternalId:   z.string().min(1).optional().nullable(),
  classExternalId:   z.string().min(1).optional().nullable(),   // student: single
  seriesExternalId:  z.string().min(1).optional().nullable(),   // student: single
  // Many-to-many (arrays of IDs)
  classExternalIds:   z.array(z.string().min(1)).optional(),   // teacher: multiple
  subjectExternalIds: z.array(z.string().min(1)).optional(),   // teacher: multiple
  seriesExternalIds:  z.array(z.string().min(1)).optional(),   // teacher: multiple
  bookExternalIds:    z.array(z.string().min(1)).optional(),   // both: multiple
  // Role-specific text fields
  bio:         z.string().trim().max(1000).optional().nullable(),
  teacherCode: z.string().trim().min(1).max(40).optional().nullable(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     passwordSchema,
}).refine((v) => v.currentPassword !== v.newPassword, {
  path: ['newPassword'],
  message: 'New password must differ from current password',
});

export const listUsersQuerySchema = paginationSchema.extend({
  role:   z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

export const listProfilesQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

export const userIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type UpdateProfileInput   = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput  = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery       = z.infer<typeof listUsersQuerySchema>;
export type ListProfilesQuery    = z.infer<typeof listProfilesQuerySchema>;
