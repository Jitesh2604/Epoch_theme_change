import type { Request, Response } from '../core/types';
import { QuestionService } from '../services/question.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
  ListQuestionsQuery,
  AttachQuestionsInput,
  UpdateAssessmentQuestionInput,
  ReorderQuestionsInput,
} from '../validators/question.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const QuestionController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const q = await QuestionService.create(actorFrom(req), req.body as CreateQuestionInput);
    ApiResponse.created(res, q, 'Question created');
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await QuestionService.list(
      actorFrom(req),
      req.query as unknown as ListQuestionsQuery,
    );
    ApiResponse.ok(res, { items, meta });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const q = await QuestionService.findById(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, q);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const q = await QuestionService.update(actorFrom(req), p(req, 'id'), req.body as UpdateQuestionInput);
    ApiResponse.ok(res, q, 'Question updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await QuestionService.remove(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, { ok: true }, 'Question deleted');
  }),

  listForAssessment: asyncHandler(async (req: Request, res: Response) => {
    const items = await QuestionService.listForAssessment(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, items);
  }),

  attach: asyncHandler(async (req: Request, res: Response) => {
    const result = await QuestionService.attach(
      actorFrom(req),
      p(req, 'id'),
      req.body as AttachQuestionsInput,
    );
    ApiResponse.ok(res, result, 'Question(s) attached');
  }),

  detach: asyncHandler(async (req: Request, res: Response) => {
    await QuestionService.detach(actorFrom(req), p(req, 'id'), p(req, 'questionId'));
    ApiResponse.ok(res, { ok: true }, 'Question detached');
  }),

  updateAttachment: asyncHandler(async (req: Request, res: Response) => {
    const updated = await QuestionService.updateAttachment(
      actorFrom(req),
      p(req, 'id'),
      p(req, 'questionId'),
      req.body as UpdateAssessmentQuestionInput,
    );
    ApiResponse.ok(res, updated, 'Attachment updated');
  }),

  reorder: asyncHandler(async (req: Request, res: Response) => {
    await QuestionService.reorder(actorFrom(req), p(req, 'id'), req.body as ReorderQuestionsInput);
    ApiResponse.ok(res, { ok: true }, 'Order updated');
  }),
};
