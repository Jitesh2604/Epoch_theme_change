import type { Request, Response } from '../core/types';
import { SchoolPanelService } from '../services/schoolPanel.service';
import { LeaderboardService } from '../services/leaderboard.service';
import { SubmissionService } from '../services/submission.service';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { Actor } from '../services/assessment.service';
import type {
  ListSchoolStudentsQuery,
  ListSchoolResultsQuery,
  SchoolLeaderboardQuery,
  SchoolUpdateStudentProfileInput,
} from '../validators/schoolPanel.validator';
import type { MyRankingQuery } from '../validators/leaderboard.validator';

function actorFrom(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

const p = (req: Request, key: string): string => req.params[key] as string;

export const SchoolPanelController = {
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.dashboard(actorFrom(req));
    ApiResponse.ok(res, data);
  }),

  students: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await SchoolPanelService.students(actorFrom(req), req.query as unknown as ListSchoolStudentsQuery);
    ApiResponse.ok(res, { items, meta });
  }),

  studentDetail: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.studentDetail(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, data);
  }),

  updateStudentProfile: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.updateStudentProfile(actorFrom(req), p(req, 'id'), req.body as SchoolUpdateStudentProfileInput);
    ApiResponse.ok(res, data, 'Student profile updated');
  }),

  results: asyncHandler(async (req: Request, res: Response) => {
    const { items, meta } = await SchoolPanelService.results(actorFrom(req), req.query as unknown as ListSchoolResultsQuery);
    ApiResponse.ok(res, { items, meta });
  }),

  filterOptions: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.filterOptions(actorFrom(req));
    ApiResponse.ok(res, data);
  }),

  leaderboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await LeaderboardService.forSchoolPanel(actorFrom(req), req.query as unknown as SchoolLeaderboardQuery);
    ApiResponse.ok(res, data);
  }),

  // ── Student Details tabs ──────────────────────────────────────────────

  studentSubmission: asyncHandler(async (req: Request, res: Response) => {
    // Calls SubmissionService directly rather than going through
    // SchoolPanelService — see that method's own doc comment (avoids a
    // circular import; the method does its own complete authorization).
    const data = await SubmissionService.getForSchoolAdmin(actorFrom(req), p(req, 'id'), p(req, 'submissionId'));
    ApiResponse.ok(res, data);
  }),

  studentPractice: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.studentPractice(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, data);
  }),

  studentAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.studentAnalytics(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, data);
  }),

  studentCertificates: asyncHandler(async (req: Request, res: Response) => {
    const data = await SchoolPanelService.studentCertificates(actorFrom(req), p(req, 'id'));
    ApiResponse.ok(res, data);
  }),

  studentRanking: asyncHandler(async (req: Request, res: Response) => {
    const data = await LeaderboardService.studentRanking(actorFrom(req), p(req, 'id'), req.query as unknown as MyRankingQuery);
    ApiResponse.ok(res, data);
  }),
};
