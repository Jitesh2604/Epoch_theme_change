import { z } from 'zod';
import { paginationSchema } from '../utils/pagination';

export const assessmentLeaderboardQuerySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const globalLeaderboardQuerySchema = paginationSchema.extend({
  limit:     z.coerce.number().int().min(1).max(200).default(20),
  subjectId: z.string().min(1).optional(),
});

export type AssessmentLeaderboardQuery = z.infer<typeof assessmentLeaderboardQuerySchema>;
export type GlobalLeaderboardQuery     = z.infer<typeof globalLeaderboardQuerySchema>;
