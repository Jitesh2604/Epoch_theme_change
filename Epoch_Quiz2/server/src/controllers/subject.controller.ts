import { SubjectService } from '../services/subject.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const SubjectController = {
  list: asyncHandler(async (_req, res) => {
    const items = await SubjectService.list();
    ApiResponse.ok(res, items);
  }),
};
