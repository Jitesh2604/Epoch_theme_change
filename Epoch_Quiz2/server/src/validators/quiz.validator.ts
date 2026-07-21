import { z } from 'zod';
import { Difficulty, AttemptStatus, QuizType } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

export const startPracticeSchema = z.object({
  subjectExternalId: z.string().min(1, 'Subject is required'),
  // Question count and time limit are never client-supplied — the service
  // looks them up from PracticeConfig by difficulty, so difficulty is required.
  difficulty:        z.nativeEnum(Difficulty, { required_error: 'Difficulty is required' }),
  chapterExternalId: z.string().min(1).optional(),
});

// Same shape as startPracticeSchema — used by the read-only overview/confirm
// screen shown before an attempt is created (no chapter filter needed there).
export const previewPracticeSchema = z.object({
  subjectExternalId: z.string().min(1, 'Subject is required'),
  difficulty:        z.nativeEnum(Difficulty, { required_error: 'Difficulty is required' }),
});

export const startOlympiadSchema = z.object({
  // Optional override of the DB-configured questions-per-subject distribution.
  perSubject: z.number().int().min(1).max(20).optional(),
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

// Debounced continuous autosave (paused omitted) and the explicit Pause
// action (paused: true) share this shape — see QuizService.saveProgress.
export const saveProgressSchema = z.object({
  currentQuestionIndex: z.number().int().min(0),
  paused:               z.boolean().optional(),
  draft: z.object({
    questionId:      z.string().min(1),
    selectedOption:  z.string().optional(),
    selectedOptions: z.array(z.string()).optional(),
    textAnswer:      z.string().max(2000).optional(),
  }).optional(),
});

// Admin-only cross-student report — see QuizService.list. Same construction
// pattern as submission.validator.ts's listSubmissionsQuerySchema, with a
// richer filter/sort surface since this table is expected to grow large.
export const listQuizAttemptsQuerySchema = paginationSchema.extend({
  status:            z.nativeEnum(AttemptStatus).optional(),
  quizType:          z.nativeEnum(QuizType).optional(),
  studentId:         z.string().min(1).optional(),
  subjectExternalId: z.string().min(1).optional(),
  // Accepts either a date-only ("2026-01-01") or full ISO datetime string —
  // parsed with `new Date(...)` in the service, which handles both.
  dateFrom:          z.string().min(1).optional(),
  dateTo:            z.string().min(1).optional(),
  sortBy:            z.enum(['latest', 'score_desc', 'score_asc', 'time_desc', 'time_asc']).default('latest'),
});

export type StartPracticeInput      = z.infer<typeof startPracticeSchema>;
export type PreviewPracticeInput    = z.infer<typeof previewPracticeSchema>;
export type StartOlympiadInput      = z.infer<typeof startOlympiadSchema>;
export type SaveAttemptAnswerInput  = z.infer<typeof saveAttemptAnswerSchema>;
export type SubmitAttemptInput      = z.infer<typeof submitAttemptSchema>;
export type SaveProgressInput       = z.infer<typeof saveProgressSchema>;
export type ListQuizAttemptsInput   = z.infer<typeof listQuizAttemptsQuerySchema>;
