import { z } from 'zod';
import { SubmissionStatus } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

// Single answer — can be supplied for autosave or as part of bulk submit.
export const answerInputSchema = z.object({
  questionId:      z.string().min(1),
  selectedOption:  z.number().int().min(0).optional().nullable(),
  selectedOptions: z.array(z.number().int().min(0)).optional().nullable(), // MCQ_MULTIPLE
  selectedBoolean: z.boolean().optional().nullable(),
  textAnswer:      z.string().max(5000).optional().nullable(),
  timeMs:          z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
});

export const saveAnswerSchema = answerInputSchema;

export const submitAttemptSchema = z.object({
  answers: z.array(answerInputSchema).max(1000).optional().default([]),
});

// Debounced "which question am I on" ping (paused omitted) and the explicit
// Pause action (paused: true) share this one shape.
export const pauseSubmissionSchema = z.object({
  currentQuestionIndex: z.number().int().min(0),
  paused:               z.boolean().optional(),
});

export const gradeAnswerSchema = z.object({
  marksAwarded: z.coerce.number().int().min(0).max(100),
  // Optional override; if omitted we derive correctness from marksAwarded > 0.
  isCorrect:    z.boolean().optional(),
  feedback:     z.string().max(2000).optional(), // currently informational only
});

export const listSubmissionsQuerySchema = paginationSchema.extend({
  status:       z.nativeEnum(SubmissionStatus).optional(),
  assessmentId: z.string().min(1).optional(),
  studentId:    z.string().min(1).optional(),
});

export const submissionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const submissionAnswerParamsSchema = z.object({
  id:         z.string().min(1),
  questionId: z.string().min(1),
});

export type SaveAnswerInput        = z.infer<typeof saveAnswerSchema>;
export type SubmitAttemptInput     = z.infer<typeof submitAttemptSchema>;
export type GradeAnswerInput       = z.infer<typeof gradeAnswerSchema>;
export type ListSubmissionsQuery   = z.infer<typeof listSubmissionsQuerySchema>;
export type PauseSubmissionInput   = z.infer<typeof pauseSubmissionSchema>;
