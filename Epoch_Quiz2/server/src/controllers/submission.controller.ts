import type { Request, Response } from '../core/types';
import { SubmissionService } from '../services/submission.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type {
  SaveAnswerInput,
  SubmitAttemptInput,
  GradeAnswerInput,
  ListSubmissionsQuery,
  PauseSubmissionInput,
} from '../validators/submission.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const SubmissionController = {
  start: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.start(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, out, 'Attempt started');
  }),

  saveAnswer: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.saveAnswer(actorFrom(req), p(req, 'id'), req.body as SaveAnswerInput);
    ApiResponse.ok(res, out, 'Answer saved');
  }),

  pause: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.pause(actorFrom(req), p(req, 'id'), req.body as PauseSubmissionInput);
    ApiResponse.ok(res, out, 'Progress saved');
  }),

  submit: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.submit(actorFrom(req), p(req, 'id'), req.body as SubmitAttemptInput);
    ApiResponse.ok(res, out, 'Submission finalized');
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.findById(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, out);
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await SubmissionService.listMine(
      actorFrom(req),
      req.query as unknown as ListSubmissionsQuery,
    );
    ApiResponse.ok(res, { items, meta });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await SubmissionService.list(
      actorFrom(req),
      req.query as unknown as ListSubmissionsQuery,
    );
    ApiResponse.ok(res, { items, meta });
  }),

  grade: asyncHandler(async (req: Request, res: Response) => {
    const out = await SubmissionService.grade(
      actorFrom(req),
      p(req, 'id'),
      p(req, 'questionId'),
      req.body as GradeAnswerInput,
    );
    ApiResponse.ok(res, out, 'Answer graded');
  }),
};
