import type { Request, Response } from '../core/types';
import { SchoolBranchService } from '../services/schoolBranch.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  AdminCreateSchoolBranchInput,
  AdminUpdateSchoolBranchInput,
  ListSchoolBranchesQuery,
} from '../validators/school.validator';

const p = (req: Request, key: string): string => req.params[key] as string;

export const SchoolBranchController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { schoolId, stateId } = req.query as unknown as ListSchoolBranchesQuery;
    const includeInactive = req.query.includeInactive === 'true';
    const items = await SchoolBranchService.list(schoolId, stateId, includeInactive);
    ApiResponse.ok(res, items);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const branch = await SchoolBranchService.create(req.body as AdminCreateSchoolBranchInput);
    ApiResponse.created(res, branch, 'Branch created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const branch = await SchoolBranchService.update(p(req, 'id'), req.body as AdminUpdateSchoolBranchInput);
    ApiResponse.ok(res, branch, 'Branch updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const branch = await SchoolBranchService.deactivate(p(req, 'id'));
    ApiResponse.ok(res, branch, 'Branch deactivated');
  }),
};
