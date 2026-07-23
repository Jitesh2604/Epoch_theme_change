import { z } from 'zod';
import { Role } from '../lib/enums';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt limit

const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();
const nameSchema  = z.string().min(2, 'Name must be at least 2 characters').max(80).trim();

// Public registration: only STUDENT allowed.
// Admin accounts are seeded (see prisma/seed.ts) or created by an existing admin.
// The Teacher module is temporarily hidden — Role.TEACHER is excluded here to
// block new teacher signups. Re-add Role.TEACHER to re-enable.
export const registerSchema = z.object({
  name:     nameSchema,
  email:    emailSchema,
  password: passwordSchema,
  role:     z.enum([Role.STUDENT]),
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

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code:  z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type RegisterInput           = z.infer<typeof registerSchema>;
export type LoginInput              = z.infer<typeof loginSchema>;
export type RefreshInput            = z.infer<typeof refreshSchema>;
export type LogoutInput             = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput     = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput      = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput        = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
