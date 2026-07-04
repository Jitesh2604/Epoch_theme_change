import type { Request, Response } from '../core/types';
import { AssessmentService, type Actor } from '../services/assessment.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  ListAssessmentsQuery,
  AssignAssessmentInput,
} from '../validators/assessment.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const AssessmentController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.create(actorFrom(req), req.body as CreateAssessmentInput);
    ApiResponse.created(res, a, 'Assessment created');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await AssessmentService.list(
      actorFrom(req),
      req.query as unknown as ListAssessmentsQuery,
    );
    ApiResponse.ok(res, { items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.findById(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, a);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.update(actorFrom(req), p(req, 'id'), req.body as UpdateAssessmentInput);
    ApiResponse.ok(res, a, 'Assessment updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await AssessmentService.remove(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, { ok: true }, 'Assessment deleted');
  }),

  publish: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.publish(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, a, 'Assessment published');
  }),

  unpublish: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.unpublish(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, a, 'Assessment unpublished');
  }),

  archive: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.archive(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, a, 'Assessment archived');
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.assign(actorFrom(req), p(req, 'id'), req.body as AssignAssessmentInput);
    ApiResponse.ok(res, a, 'Assessment assignment updated');
  }),

  getAssignments: asyncHandler(async (req: Request, res: Response) => {
    const a = await AssessmentService.getAssignments(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, a);
  }),
};
