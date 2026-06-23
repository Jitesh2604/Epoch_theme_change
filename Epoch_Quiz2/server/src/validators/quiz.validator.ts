import { z } from 'zod';
import { Difficulty } from '../lib/enums';

export const startPracticeSchema = z.object({
  subjectId:     z.string().min(1, 'Subject is required'),
  difficulty:    z.nativeEnum(Difficulty).optional(),
  questionCount: z.number().int().min(5).max(30).default(10),
});

export const saveAttemptAnswerSchema = z.object({
  questionId:      z.string().min(1, 'questionId is required'),
  selectedOption:  z.string().optional(),      // "A"|"B"|"C"|"D" or "TRUE"|"FALSE"
  selectedOptions: z.array(z.string()).optional(), // MCQ_MULTIPLE
  textAnswer:      z.string().max(2000).optional(),
  timeSpentSec:    z.number().int().min(0).optional(),
  isSkipped:       z.boolean().optional(),
  isMarkedReview:  z.boolean().optional(),
});

export const submitAttemptSchema = z.object({
  timeTakenSec: z.number().int().min(0).optional(),
});

export const attemptIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type StartPracticeInput    = z.infer<typeof startPracticeSchema>;
export type SaveAttemptAnswerInput = z.infer<typeof saveAttemptAnswerSchema>;
export type SubmitAttemptInput    = z.infer<typeof submitAttemptSchema>;
