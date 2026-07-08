import { CategoryService } from '../services/category.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const CategoryController = {
  list: asyncHandler(async (_req, res) => {
    const items = await CategoryService.list();
    ApiResponse.ok(res, items);
  }),
};
