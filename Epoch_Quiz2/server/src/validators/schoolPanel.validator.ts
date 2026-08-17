import { z } from 'zod';
import { paginationSchema } from '../utils/pagination';
import { EDUCATION_BOARD_CODES } from '../lib/educationBoards';

// Every list here is additionally scoped server-side to the caller's own
// school (see SchoolPanelService's resolveAdminSchool) — branchId here only
// NARROWS within that school, it can never be used to reach another
// school's branch (validated against the resolved schoolId, not trusted
// as-is).
export const listSchoolStudentsQuerySchema = paginationSchema.extend({
  search:   z.string().trim().min(1).max(80).optional(),
  branchId: z.string().min(1).optional(),
  classExternalId: z.string().min(1).optional(),
  // Branch-verification status — the most actionable "is this student
  // actually connected yet" signal for a school admin, distinct from
  // User.status (which is just ACTIVE/PENDING/INACTIVE account state).
  verified: z.enum(['true', 'false']).optional(),
});

export const schoolStudentIdParamsSchema = z.object({
  id: z.string().min(1),
});

// Student Details → Answer Sheet tab. submissionId is looked up against
// its OWN studentId server-side (see SubmissionService.getForSchoolAdmin)
// — the :id here is only used for a consistency check, never trusted as
// the actual authorization boundary.
export const schoolStudentSubmissionParamsSchema = z.object({
  id: z.string().min(1),
  submissionId: z.string().min(1),
});

export const listSchoolResultsQuerySchema = paginationSchema.extend({
  studentId:          z.string().min(1).optional(),
  subjectExternalId:  z.string().min(1).optional(),
  classExternalId:    z.string().min(1).optional(),
  branchId:           z.string().min(1).optional(),
  assessmentId:       z.string().min(1).optional(),
  session:            z.string().trim().min(1).optional(),
});

export const schoolLeaderboardQuerySchema = paginationSchema.extend({
  session:            z.string().trim().min(1).optional(),
  subjectExternalId:  z.string().min(1).optional(),
  classExternalId:    z.string().min(1).optional(),
  branchId:           z.string().min(1).optional(),
});

export const schoolAnalyticsQuerySchema = z.object({
  branchId: z.string().min(1).optional(),
});

/**
 * School Admin editing a student in their own school (Student Details →
 * Edit Profile). Deliberately a WHITELIST, not an extension of the
 * self-service updateProfileSchema — there is no `schoolId` field here at
 * all, so even a malicious request body containing one is silently
 * stripped by Zod before it ever reaches the service layer; a School
 * Admin can never move a student to another school through this endpoint.
 * `email`/`phone` are handled here because UserService.updateOwnProfile
 * (reused for every other field below) deliberately does not expose
 * either for self-service — see schoolPanel.service.ts's
 * updateStudentProfile for why they're handled as a small addition
 * instead of inside that shared function.
 */
export const schoolUpdateStudentProfileSchema = z.object({
  name:            z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  email:           z.string().email('Invalid email address').toLowerCase().trim().optional(),
  phone:           z.string().trim().min(7, 'Mobile number must be at least 7 digits').max(20).optional().nullable(),
  dob:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  branchId:        z.string().min(1).optional().nullable(),
  classExternalId: z.string().min(1).optional().nullable(),
  address:         z.string().trim().max(500).optional().nullable(),
  country:         z.string().trim().max(80).optional().nullable(),
  state:           z.string().trim().max(80).optional().nullable(),
  city:            z.string().trim().max(80).optional().nullable(),
  zip:             z.string().trim().max(20).optional().nullable(),
  educationBoard:  z.enum(EDUCATION_BOARD_CODES).optional().nullable(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type ListSchoolStudentsQuery           = z.infer<typeof listSchoolStudentsQuerySchema>;
export type ListSchoolResultsQuery            = z.infer<typeof listSchoolResultsQuerySchema>;
export type SchoolLeaderboardQuery            = z.infer<typeof schoolLeaderboardQuerySchema>;
export type SchoolAnalyticsQuery              = z.infer<typeof schoolAnalyticsQuerySchema>;
export type SchoolStudentSubmissionParams     = z.infer<typeof schoolStudentSubmissionParamsSchema>;
export type SchoolUpdateStudentProfileInput   = z.infer<typeof schoolUpdateStudentProfileSchema>;
