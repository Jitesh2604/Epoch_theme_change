import type { Request, Response } from '../core/types';
import { StudentPerformanceService } from '../services/studentPerformance.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';

export const StudentPerformanceController = {
  listCandidates: asyncHandler(async (req: Request, res: Response) => {
    const classExternalId = typeof req.query.classExternalId === 'string' ? req.query.classExternalId : undefined;
    const data = await StudentPerformanceService.listStudentCandidates({ classExternalId });
    ApiResponse.ok(res, data);
  }),

  getBulkInsights: asyncHandler(async (req: Request, res: Response) => {
    const studentIds = (req.body as { studentIds?: unknown })?.studentIds;
    if (!Array.isArray(studentIds) || studentIds.some(id => typeof id !== 'string')) {
      throw ApiError.badRequest('studentIds must be an array of strings');
    }
    const data = await StudentPerformanceService.getBulkInsights(studentIds);
    ApiResponse.ok(res, data);
  }),

  getStudentDetail: asyncHandler(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const data = await StudentPerformanceService.getStudentDetail(studentId);
    ApiResponse.ok(res, data);
  }),
};
