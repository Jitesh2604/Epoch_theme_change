import type { Request, Response } from '../core/types';
import { QuizService } from '../services/quiz.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type {
  StartPracticeInput,
  PreviewPracticeInput,
  StartOlympiadInput,
  SaveAttemptAnswerInput,
  SubmitAttemptInput,
  SaveProgressInput,
} from '../validators/quiz.validator';

const param = (req: Request, key: string): string => req.params[key] as string;

export const QuizController = {
  getSubjects: asyncHandler(async (req: Request, res: Response) => {
    const subjects = await QuizService.getSubjectsWithQuestions(req.user?.id);
    ApiResponse.ok(res, subjects);
  }),

  previewPractice: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.previewPractice(req.user.id, req.body as PreviewPracticeInput);
    ApiResponse.ok(res, result);
  }),

  startPractice: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.startPractice(req.user.id, req.body as StartPracticeInput);
    ApiResponse.created(res, result, 'Practice session started');
  }),

  startOlympiad: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.startOlympiad(req.user.id, req.body as StartOlympiadInput);
    ApiResponse.created(res, result, 'Olympiad started');
  }),

  olympiadAttempts: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const data = await QuizService.getOlympiadAttempts(req.user.id);
    ApiResponse.ok(res, data);
  }),

  getAttempt: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const data = await QuizService.getAttempt(param(req, 'id'), req.user.id);
    ApiResponse.ok(res, data);
  }),

  saveAnswer: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.saveAnswer(
      param(req, 'id'),
      req.user.id,
      req.body as SaveAttemptAnswerInput,
    );
    ApiResponse.ok(res, result);
  }),

  saveProgress: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.saveProgress(
      param(req, 'id'),
      req.user.id,
      req.body as SaveProgressInput,
    );
    ApiResponse.ok(res, result);
  }),

  submitAttempt: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await QuizService.submitAttempt(
      param(req, 'id'),
      req.user.id,
      req.body as SubmitAttemptInput,
    );
    ApiResponse.ok(res, result, 'Quiz submitted');
  }),
};
