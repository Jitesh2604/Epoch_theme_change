import type { Request, Response } from '../core/types';
import { UserService } from '../services/user.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  UpdateProfileInput,
  ChangePasswordInput,
  ListUsersQuery,
  ListProfilesQuery,
} from '../validators/user.validator';

const p = (req: Request, key: string): string => req.params[key] as string;

export const UserController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await UserService.list(req.query as unknown as ListUsersQuery);
    ApiResponse.ok(res, { items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const user = await UserService.findById(p(req, 'id'));
    ApiResponse.ok(res, user);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const user = await UserService.create(req.body as AdminCreateUserInput);
    ApiResponse.created(res, user, 'User created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const user = await UserService.update(p(req, 'id'), req.body as AdminUpdateUserInput);
    ApiResponse.ok(res, user, 'User updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const user = await UserService.deactivate(p(req, 'id'));
    ApiResponse.ok(res, user, 'User deactivated');
  }),

  listTeachers: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await UserService.listTeachers(req.query as unknown as ListProfilesQuery);
    ApiResponse.ok(res, { items, meta });
  }),

  listStudents: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await UserService.listStudents(req.query as unknown as ListProfilesQuery);
    ApiResponse.ok(res, { items, meta });
  }),

  getMe: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await UserService.findById(req.user.id);
    ApiResponse.ok(res, user);
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await UserService.updateOwnProfile(req.user.id, req.body as UpdateProfileInput);
    ApiResponse.ok(res, user, 'Profile updated');
  }),

  changeMyPassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await UserService.changePassword(req.user.id, req.body as ChangePasswordInput);
    ApiResponse.ok(res, { ok: true }, 'Password changed — please log in again');
  }),
};
