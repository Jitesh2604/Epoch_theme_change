import { z } from 'zod';

// Codes are matched case-insensitively; normalized to uppercase at the
// boundary so storage/lookups never have to re-derive it.
const codeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, - and _')
  .transform((v) => v.toUpperCase());

export const adminCreateTeacherCodeSchema = z.object({
  code:     codeSchema,
  isActive: z.boolean().optional(),
});

export const adminUpdateTeacherCodeSchema = z.object({
  code:     codeSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const teacherCodeIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type AdminCreateTeacherCodeInput = z.infer<typeof adminCreateTeacherCodeSchema>;
export type AdminUpdateTeacherCodeInput = z.infer<typeof adminUpdateTeacherCodeSchema>;
