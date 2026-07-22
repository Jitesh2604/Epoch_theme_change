import type { Request, Response } from '../core/types';
import { AssessmentQuestionService } from '../services/assessmentQuestion.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type {
  CreateAssessmentQuestionInput,
  UpdateAssessmentQuestionBankInput,
  ListAssessmentQuestionsQuery,
  AttachQuestionsInput,
  UpdateAssessmentQuestionInput,
  ReorderQuestionsInput,
} from '../validators/assessmentQuestion.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

// The Assessment Question Bank — physically separate from Practice/
// Olympiad's QuestionController, mirroring its shape.
export const AssessmentQuestionController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const q = await AssessmentQuestionService.create(actorFrom(req), req.body as CreateAssessmentQuestionInput);
    ApiResponse.created(res, q, 'Question created');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await AssessmentQuestionService.list(
      actorFrom(req),
      req.query as unknown as ListAssessmentQuestionsQuery,
    );
    ApiResponse.ok(res, { items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const q = await AssessmentQuestionService.findById(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, q);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const q = await AssessmentQuestionService.update(actorFrom(req), p(req, 'id'), req.body as UpdateAssessmentQuestionBankInput);
    ApiResponse.ok(res, q, 'Question updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await AssessmentQuestionService.remove(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, { ok: true }, 'Question deleted');
  }),

  listForAssessment: asyncHandler(async (req: Request, res: Response) => {
    const items = await AssessmentQuestionService.listForAssessment(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, items);
  }),

  attach: asyncHandler(async (req: Request, res: Response) => {
    const result = await AssessmentQuestionService.attach(
      actorFrom(req),
      p(req, 'id'),
      req.body as AttachQuestionsInput,
    );
    ApiResponse.ok(res, result, 'Question(s) attached');
  }),

  detach: asyncHandler(async (req: Request, res: Response) => {
    await AssessmentQuestionService.detach(actorFrom(req), p(req, 'id'), p(req, 'questionId'));
    ApiResponse.ok(res, { ok: true }, 'Question detached');
  }),

  updateAttachment: asyncHandler(async (req: Request, res: Response) => {
    const updated = await AssessmentQuestionService.updateAttachment(
      actorFrom(req),
      p(req, 'id'),
      p(req, 'questionId'),
      req.body as UpdateAssessmentQuestionInput,
    );
    ApiResponse.ok(res, updated, 'Attachment updated');
  }),

  reorder: asyncHandler(async (req: Request, res: Response) => {
    await AssessmentQuestionService.reorder(actorFrom(req), p(req, 'id'), req.body as ReorderQuestionsInput);
    ApiResponse.ok(res, { ok: true }, 'Order updated');
  }),
};
