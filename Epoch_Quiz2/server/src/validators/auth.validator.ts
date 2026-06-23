import { z } from 'zod';
import { Role } from '../lib/enums';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt limit

const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();
const nameSchema  = z.string().min(2, 'Name must be at least 2 characters').max(80).trim();

// Public registration: only TEACHER and STUDENT allowed.
// Admin accounts are seeded (see prisma/seed.ts) or created by an existing admin.
export const registerSchema = z.object({
  name:     nameSchema,
  email:    emailSchema,
  password: passwordSchema,
  role:     z.enum([Role.TEACHER, Role.STUDENT]),
  mobileNo: z.string().trim().min(7, 'Mobile number must be at least 7 digits').max(20),
});

export const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token:       z.string().min(1, 'token is required'),
  newPassword: passwordSchema,
});

export type RegisterInput       = z.infer<typeof registerSchema>;
export type LoginInput          = z.infer<typeof loginSchema>;
export type RefreshInput        = z.infer<typeof refreshSchema>;
export type LogoutInput         = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>;
