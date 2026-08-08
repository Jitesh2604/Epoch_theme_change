import type { Request, Response } from '../core/types';
import { SchoolService } from '../services/school.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  SchoolRegisterInput,
  AdminCreateSchoolInput,
  AdminUpdateSchoolInput,
} from '../validators/school.validator';

const p = (req: Request, key: string): string => req.params[key] as string;

export const SchoolController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const items = await SchoolService.list(includeInactive);
    ApiResponse.ok(res, items);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const school = await SchoolService.create(req.body as AdminCreateSchoolInput);
    ApiResponse.created(res, school, 'School created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const school = await SchoolService.update(p(req, 'id'), req.body as AdminUpdateSchoolInput);
    ApiResponse.ok(res, school, 'School updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const school = await SchoolService.deactivate(p(req, 'id'));
    ApiResponse.ok(res, school, 'School deactivated');
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await SchoolService.register(req.body as SchoolRegisterInput);
    ApiResponse.created(res, result, 'Registration submitted — pending admin approval.');
  }),
};
