import type { Request, Response } from '../core/types';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { RegisterInput, LoginInput, RefreshInput, LogoutInput, ForgotPasswordInput, ResetPasswordInput } from '../validators/auth.validator';

export const AuthController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await AuthService.register(req.body as RegisterInput);
    ApiResponse.created(res, result, 'Account created');
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await AuthService.login(req.body as LoginInput);
    ApiResponse.ok(res, result, 'Logged in');
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshInput;
    const tokens = await AuthService.refresh(refreshToken);
    ApiResponse.ok(res, tokens, 'Tokens refreshed');
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as LogoutInput;
    await AuthService.logout(refreshToken);
    ApiResponse.ok(res, { ok: true }, 'Logged out');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await AuthService.getMe(req.user.id);
    ApiResponse.ok(res, user);
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as ForgotPasswordInput;
    const result = await AuthService.forgotPassword(email);
    ApiResponse.ok(res, result, 'If that email is registered, a reset link has been sent.');
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as ResetPasswordInput;
    await AuthService.resetPassword(token, newPassword);
    ApiResponse.ok(res, { ok: true }, 'Password reset successfully. Please sign in.');
  }),
};
