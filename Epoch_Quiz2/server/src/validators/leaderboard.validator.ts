import { z } from 'zod';
import { paginationSchema } from '../utils/pagination';

export const assessmentLeaderboardQuerySchema = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const globalLeaderboardQuerySchema = paginationSchema.extend({
  limit:     z.coerce.number().int().min(1).max(200).default(20),
  subjectExternalId: z.string().min(1).optional(),
});

export type AssessmentLeaderboardQuery = z.infer<typeof assessmentLeaderboardQuerySchema>;
export type GlobalLeaderboardQuery     = z.infer<typeof globalLeaderboardQuerySchema>;

// ── Assessment Leaderboard (School / State / Global) ──────────────────────
// "Session" = a distinct title among leaderboard-eligible (published-results)
// Assessments — see LeaderboardService.listAssessmentSessions. Subject/Class
// narrow the set of assessments within a session (both are Assessment-level
// attributes, not student-level), per the plan.

const sessionFilterFields = {
  session:           z.string().trim().min(1).optional(),
  subjectExternalId: z.string().trim().min(1).optional(),
  classExternalId:   z.string().trim().min(1).optional(),
};

export const scopedLeaderboardQuerySchema = paginationSchema.extend({
  ...sessionFilterFields,
  scope:  z.enum(['school', 'state', 'global']),
  school: z.string().trim().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(50),
});

export const myRankingQuerySchema = z.object(sessionFilterFields);

export type ScopedLeaderboardQuery = z.infer<typeof scopedLeaderboardQuerySchema>;
export type MyRankingQuery         = z.infer<typeof myRankingQuerySchema>;
