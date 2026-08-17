import { z } from 'zod';
import { AssessmentStatus } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

const titleSchema       = z.string().trim().min(3, 'Title must be at least 3 characters').max(160);
const descriptionSchema = z.string().trim().max(5000).optional().nullable();
const instructionsSchema = z.string().trim().max(5000).optional().nullable();
const durationSchema    = z.coerce.number().int().min(1, 'Duration must be ≥ 1 minute').max(60 * 24);
const negativeMarkingSchema      = z.coerce.boolean().optional();
const negativeMarksValueSchema   = z.coerce.number().min(0, 'Negative marks value must be ≥ 0').max(100).optional();
const resultsPublishedSchema     = z.coerce.boolean().optional();
const resultPublishAtSchema      = z.coerce.date().optional().nullable();

const idArraySchema = z.array(z.string().min(1)).max(500);

export const createAssessmentSchema = z.object({
  title:        titleSchema,
  description:  descriptionSchema,
  instructions: instructionsSchema,
  // Optional: falls back to the live assessment.defaultDuration admin
  // setting in AssessmentService.create when omitted.
  duration:     durationSchema.optional(),
  subjectExternalId:    z.string().min(1).optional().nullable(),
  classExternalId:z.string().min(1).optional().nullable(),
  passingMarks: z.coerce.number().int().min(0).optional(),
  negativeMarking:    negativeMarkingSchema,
  negativeMarksValue: negativeMarksValueSchema,
  resultsPublished: resultsPublishedSchema,
  resultPublishAt:  resultPublishAtSchema,
  // Optional assignment at creation time (replace-set semantics)
  assignedClassIds:   idArraySchema.optional(),
  assignedStudentIds: idArraySchema.optional(),
});

/** Replace-set assignment: whichever arrays are provided overwrite that dimension. */
export const assignAssessmentSchema = z.object({
  classIds:   idArraySchema.optional(),
  studentIds: idArraySchema.optional(),
}).refine(
  (v) => v.classIds !== undefined || v.studentIds !== undefined,
  { message: 'Provide classIds and/or studentIds' },
);

export const updateAssessmentSchema = z.object({
  title:        titleSchema.optional(),
  description:  descriptionSchema,
  instructions: instructionsSchema,
  duration:     durationSchema.optional(),
  subjectExternalId:    z.string().min(1).optional().nullable(),
  passingMarks: z.coerce.number().int().min(0).optional(),
  negativeMarking:    negativeMarkingSchema,
  negativeMarksValue: negativeMarksValueSchema,
  resultsPublished: resultsPublishedSchema,
  resultPublishAt:  resultPublishAtSchema,
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

/**
 * Auto-generated assessments always use ASSESSMENT_CONFIG for question
 * count/marks/duration (see AssessmentService.generate) — so unlike
 * createAssessmentSchema, there's no `duration` field here to accept, and
 * subjectExternalId is required (question selection needs one subject's
 * bank to draw from, not the whole platform's).
 */
export const generateAssessmentSchema = z.object({
  title:        titleSchema,
  description:  descriptionSchema,
  instructions: instructionsSchema,
  subjectExternalId: z.string().min(1, 'Select a subject to generate questions from'),
  classExternalId:   z.string().min(1).optional().nullable(),
  passingMarks: z.coerce.number().int().min(0).optional(),
  negativeMarking:    negativeMarkingSchema,
  negativeMarksValue: negativeMarksValueSchema,
  resultsPublished: resultsPublishedSchema,
  resultPublishAt:  resultPublishAtSchema,
  assignedClassIds:   idArraySchema.optional(),
  assignedStudentIds: idArraySchema.optional(),
});

export const listAssessmentsQuerySchema = paginationSchema.extend({
  status:    z.nativeEnum(AssessmentStatus).optional(),
  subjectExternalId: z.string().min(1).optional(),
  search:    z.string().trim().min(1).max(80).optional(),
  mine:      z.coerce.boolean().optional(),
});

export const assessmentIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type GenerateAssessmentInput   = z.infer<typeof generateAssessmentSchema>;
export type CreateAssessmentInput     = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput     = z.infer<typeof updateAssessmentSchema>;
export type ListAssessmentsQuery      = z.infer<typeof listAssessmentsQuerySchema>;
export type AssignAssessmentInput     = z.infer<typeof assignAssessmentSchema>;
