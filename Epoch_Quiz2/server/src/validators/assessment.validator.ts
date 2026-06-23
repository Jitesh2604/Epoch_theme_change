import { z } from 'zod';
import { AssessmentStatus } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

const titleSchema       = z.string().trim().min(3, 'Title must be at least 3 characters').max(160);
const descriptionSchema = z.string().trim().max(5000).optional().nullable();
const durationSchema    = z.coerce.number().int().min(1, 'Duration must be ≥ 1 minute').max(60 * 24);

export const createAssessmentSchema = z.object({
  title:        titleSchema,
  description:  descriptionSchema,
  duration:     durationSchema,
  subjectId:    z.string().min(1).optional().nullable(),
  passingMarks: z.coerce.number().int().min(0).optional(),
});

export const updateAssessmentSchema = z.object({
  title:        titleSchema.optional(),
  description:  descriptionSchema,
  duration:     durationSchema.optional(),
  subjectId:    z.string().min(1).optional().nullable(),
  passingMarks: z.coerce.number().int().min(0).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const listAssessmentsQuerySchema = paginationSchema.extend({
  status:    z.nativeEnum(AssessmentStatus).optional(),
  subjectId: z.string().min(1).optional(),
  search:    z.string().trim().min(1).max(80).optional(),
  mine:      z.coerce.boolean().optional(),
});

export const assessmentIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateAssessmentInput     = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput     = z.infer<typeof updateAssessmentSchema>;
export type ListAssessmentsQuery      = z.infer<typeof listAssessmentsQuerySchema>;
