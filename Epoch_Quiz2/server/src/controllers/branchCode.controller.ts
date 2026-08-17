import type { Request, Response } from '../core/types';
import { BranchCodeService } from '../services/branchCode.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type { VerifyBranchCodeInput, CreateOwnBranchInput } from '../validators/branchCode.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const BranchCodeController = {
  myBranches: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.myBranches(actorFrom(req));
    ApiResponse.ok(res, data);
  }),

  createBranch: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.createBranch(actorFrom(req), req.body as CreateOwnBranchInput);
    ApiResponse.created(res, data, 'Branch created');
  }),

  generateCode: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.generateCode(actorFrom(req), p(req, 'branchId'));
    ApiResponse.ok(res, data, 'Branch code generated');
  }),

  deactivateCode: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.deactivateCode(actorFrom(req), p(req, 'codeId'));
    ApiResponse.ok(res, data, 'Branch code deactivated');
  }),

  verify: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.verify(actorFrom(req), (req.body as VerifyBranchCodeInput).code);
    ApiResponse.ok(res, data, 'Branch verified');
  }),

  mine: asyncHandler(async (req: Request, res: Response) => {
    const data = await BranchCodeService.myStatus(actorFrom(req));
    ApiResponse.ok(res, data);
  }),
};
