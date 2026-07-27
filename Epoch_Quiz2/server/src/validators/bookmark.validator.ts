import { z } from 'zod';

// Feature 12 (Practice Review & Mistake Analysis) — bookmarking a Question
// while reviewing a past Practice Olympiad attempt.
export const bookmarkBodySchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
});

export const questionIdParamsSchema = z.object({
  questionId: z.string().min(1),
});

export type BookmarkBodyInput = z.infer<typeof bookmarkBodySchema>;
