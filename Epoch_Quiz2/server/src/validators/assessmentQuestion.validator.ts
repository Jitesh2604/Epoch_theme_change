import { z } from 'zod';
import { Difficulty, QuestionType } from '../lib/enums';
import { paginationSchema } from '../utils/pagination';

// ── shared fragments ─────────────────────────────────────────
// Mirrors question.validator.ts's fragments exactly — same question shape,
// just validated for the separate Assessment Question Bank table.
const promptSchema      = z.string().trim().min(1, 'Prompt is required').max(5000);
const explanationSchema = z.string().trim().min(1).max(5000).optional().nullable();
const marksSchema      = z.coerce.number().int().min(1, 'Marks must be ≥ 1').max(100);
const difficultySchema = z.nativeEnum(Difficulty);
const tagsSchema       = z.array(z.string().trim().min(1).max(40)).max(20);
const subjectIdSchema  = z.string().min(1).optional().nullable();
const optionsSchema    = z.array(z.string().trim().min(1).max(500)).min(2, 'At least 2 options').max(8);

const academicFields = {
  classExternalId:        z.string().min(1).optional().nullable(),
  chapterExternalId:      z.string().min(1).optional().nullable(),
  bookExternalId:         z.string().min(1).optional().nullable(),
  educationBoard: z.string().trim().min(1).max(120).optional().nullable(),
};

const imgUrlSchema = z.string().trim().url('Must be a valid image URL').max(191).optional().nullable();
const commonFields = {
  explanation:         explanationSchema,
  promptImageUrl:      imgUrlSchema,
  explanationImageUrl: imgUrlSchema,
};
const mcqImageFields = {
  optionAImageUrl: imgUrlSchema,
  optionBImageUrl: imgUrlSchema,
  optionCImageUrl: imgUrlSchema,
  optionDImageUrl: imgUrlSchema,
};

// ── CREATE — discriminated union by `type` ───────────────────

const mcqSingleCreateSchema = z.object({
  type:          z.literal(QuestionType.MCQ_SINGLE),
  prompt:        promptSchema,
  options:       optionsSchema,
  correctOption: z.coerce.number().int().min(0),
  marks:         marksSchema.optional(),
  difficulty:    difficultySchema.default(Difficulty.MEDIUM),
  tags:          tagsSchema.default([]),
  subjectExternalId:     subjectIdSchema,
  ...mcqImageFields,
});

const mcqMultipleCreateSchema = z.object({
  type:           z.literal(QuestionType.MCQ_MULTIPLE),
  prompt:         promptSchema,
  options:        optionsSchema,
  correctOptions: z.array(z.coerce.number().int().min(0)).min(1, 'At least one correct option required'),
  marks:          marksSchema.optional(),
  difficulty:     difficultySchema.default(Difficulty.MEDIUM),
  tags:           tagsSchema.default([]),
  subjectExternalId:      subjectIdSchema,
  ...mcqImageFields,
});

const tfCreateSchema = z.object({
  type:           z.literal(QuestionType.TRUE_FALSE),
  prompt:         promptSchema,
  correctBoolean: z.boolean(),
  marks:          marksSchema.optional(),
  difficulty:     difficultySchema.default(Difficulty.MEDIUM),
  tags:           tagsSchema.default([]),
  subjectExternalId:      subjectIdSchema,
});

const fillInBlankCreateSchema = z.object({
  type:          z.literal(QuestionType.FILL_IN_BLANK),
  prompt:        promptSchema,
  correctAnswer: z.string().trim().min(1).max(500),
  marks:         marksSchema.optional(),
  difficulty:    difficultySchema.default(Difficulty.MEDIUM),
  tags:          tagsSchema.default([]),
  subjectExternalId:     subjectIdSchema,
});

const matchColumnCreateSchema = z.object({
  type:       z.literal(QuestionType.MATCH_THE_COLUMN),
  prompt:     promptSchema,
  matchPairs: z
    .array(z.object({ left: z.string().trim().min(1), right: z.string().trim().min(1) }))
    .min(2, 'At least 2 pairs required'),
  marks:      marksSchema.optional(),
  difficulty: difficultySchema.default(Difficulty.MEDIUM),
  tags:       tagsSchema.default([]),
  subjectExternalId:  subjectIdSchema,
});

const descCreateSchema = z.object({
  type:        z.literal(QuestionType.DESCRIPTIVE),
  prompt:      promptSchema,
  modelAnswer: z.string().trim().min(1).max(5000).optional(),
  marks:       marksSchema.optional(),
  difficulty:  difficultySchema.default(Difficulty.MEDIUM),
  tags:        tagsSchema.default([]),
  subjectExternalId:   subjectIdSchema,
});

export const createAssessmentQuestionSchema = z
  .discriminatedUnion('type', [
    mcqSingleCreateSchema,
    mcqMultipleCreateSchema,
    tfCreateSchema,
    fillInBlankCreateSchema,
    matchColumnCreateSchema,
    descCreateSchema,
  ])
  .and(z.object({ ...academicFields, ...commonFields }));

// ── UPDATE — partial; type-specific fields validated in service ─
export const updateAssessmentQuestionBankSchema = z
  .object({
    prompt:         promptSchema.optional(),
    marks:          marksSchema.optional(),
    difficulty:     difficultySchema.optional(),
    tags:           tagsSchema.optional(),
    subjectExternalId:      subjectIdSchema,
    ...academicFields,
    ...commonFields,

    // MCQ-only
    options:        optionsSchema.optional(),
    correctOption:  z.coerce.number().int().min(0).optional(),
    correctOptions: z.array(z.coerce.number().int().min(0)).optional(),
    ...mcqImageFields,

    // TF-only
    correctBoolean: z.boolean().optional(),

    // FILL_IN_BLANK-only
    correctAnswer:  z.string().trim().min(1).max(500).optional(),

    // MATCH_THE_COLUMN-only
    matchPairs: z
      .array(z.object({ left: z.string().trim().min(1), right: z.string().trim().min(1) }))
      .optional(),

    // DESCRIPTIVE-only
    modelAnswer: z.string().trim().min(1).max(5000).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

// ── LIST / params ────────────────────────────────────────────
export const listAssessmentQuestionsQuerySchema = paginationSchema.extend({
  type:       z.nativeEnum(QuestionType).optional(),
  difficulty: difficultySchema.optional(),
  subjectExternalId:  z.string().min(1).optional(),
  search:     z.string().trim().min(1).max(200).optional(),
  mine:       z.coerce.boolean().optional(),
  tag:        z.string().trim().min(1).max(40).optional(),
  excludeAssessmentId: z.string().min(1).optional(),
});

export const assessmentQuestionBankIdParamsSchema = z.object({
  id: z.string().min(1),
});

// ── Assessment ↔ Question (attach / reorder / params) ────────
// Per-question override of the assessment's flat negativeMarksValue — mirrors
// how `marks` here overrides AssessmentQuestionBank.marks.
const negMarksSchema = z.coerce.number().min(0, 'Negative marks must be ≥ 0').max(100).optional();

export const attachQuestionsSchema = z.union([
  z.object({
    questionId: z.string().min(1),
    marks:      z.coerce.number().int().min(1).max(100).optional(),
    negMarks:   negMarksSchema,
  }),
  z.object({
    questionIds: z.array(z.string().min(1)).min(1).max(200),
  }),
]);

export const updateAssessmentQuestionSchema = z
  .object({
    marks:    z.coerce.number().int().min(1).max(100).optional().nullable(),
    negMarks: negMarksSchema.nullable(),
    order:    z.coerce.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const reorderQuestionsSchema = z.object({
  order: z
    .array(z.object({ questionId: z.string().min(1), order: z.coerce.number().int().min(1) }))
    .min(1)
    .max(500),
});

export const assessmentQuestionParamsSchema = z.object({
  id:         z.string().min(1),
  questionId: z.string().min(1),
});

export type CreateAssessmentQuestionInput      = z.infer<typeof createAssessmentQuestionSchema>;
export type UpdateAssessmentQuestionBankInput  = z.infer<typeof updateAssessmentQuestionBankSchema>;
export type ListAssessmentQuestionsQuery       = z.infer<typeof listAssessmentQuestionsQuerySchema>;
export type AttachQuestionsInput               = z.infer<typeof attachQuestionsSchema>;
export type UpdateAssessmentQuestionInput      = z.infer<typeof updateAssessmentQuestionSchema>;
export type ReorderQuestionsInput              = z.infer<typeof reorderQuestionsSchema>;
