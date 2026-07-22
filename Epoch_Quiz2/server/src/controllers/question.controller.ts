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
} from '../validators/question.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

// Practice/Olympiad question bank only — see assessmentQuestion.controller.ts
// for the physically separate Assessment Question Bank.
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
};
