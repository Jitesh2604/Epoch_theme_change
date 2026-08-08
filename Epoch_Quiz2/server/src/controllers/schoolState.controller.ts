import type { Request, Response } from '../core/types';
import { SchoolStateService } from '../services/schoolState.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  AdminCreateSchoolStateInput,
  AdminUpdateSchoolStateInput,
  ListSchoolStatesQuery,
} from '../validators/school.validator';

const p = (req: Request, key: string): string => req.params[key] as string;

export const SchoolStateController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { schoolId } = req.query as unknown as ListSchoolStatesQuery;
    const includeInactive = req.query.includeInactive === 'true';
    const items = await SchoolStateService.list(schoolId, includeInactive);
    ApiResponse.ok(res, items);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const state = await SchoolStateService.create(req.body as AdminCreateSchoolStateInput);
    ApiResponse.created(res, state, 'State created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const state = await SchoolStateService.update(p(req, 'id'), req.body as AdminUpdateSchoolStateInput);
    ApiResponse.ok(res, state, 'State updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const state = await SchoolStateService.deactivate(p(req, 'id'));
    ApiResponse.ok(res, state, 'State deactivated');
  }),
};
