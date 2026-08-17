import { Router } from '../core/router';
import { SchoolPanelController } from '../controllers/schoolPanel.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { Role } from '../lib/enums';
import {
  listSchoolStudentsQuerySchema,
  schoolStudentIdParamsSchema,
  schoolStudentSubmissionParamsSchema,
  listSchoolResultsQuerySchema,
  schoolLeaderboardQuerySchema,
  schoolUpdateStudentProfileSchema,
} from '../validators/schoolPanel.validator';
import { myRankingQuerySchema } from '../validators/leaderboard.validator';

const router = new Router();

// School-Admin-only, every handler scoped to the caller's own school (see
// SchoolPanelService.resolveAdminSchool) — a normal student or another
// school's admin can never reach another school's data through these.
router.use(authenticate, authorize(Role.SCHOOL_ADMIN));

router.get('/dashboard', SchoolPanelController.dashboard);
router.get('/filter-options', SchoolPanelController.filterOptions);

router.get('/students', validate(listSchoolStudentsQuerySchema, 'query'), SchoolPanelController.students);
router.get('/students/:id', validate(schoolStudentIdParamsSchema, 'params'), SchoolPanelController.studentDetail);
router.patch(
  '/students/:id',
  validate(schoolStudentIdParamsSchema, 'params'),
  validate(schoolUpdateStudentProfileSchema),
  SchoolPanelController.updateStudentProfile,
);

// ── Student Details tabs — each independently re-verifies the student
// belongs to the caller's own school (see the controller/service methods);
// none of these trust :id alone. ──────────────────────────────────────────
router.get(
  '/students/:id/submissions/:submissionId',
  validate(schoolStudentSubmissionParamsSchema, 'params'),
  SchoolPanelController.studentSubmission,
);
router.get('/students/:id/practice', validate(schoolStudentIdParamsSchema, 'params'), SchoolPanelController.studentPractice);
router.get('/students/:id/analytics', validate(schoolStudentIdParamsSchema, 'params'), SchoolPanelController.studentAnalytics);
router.get('/students/:id/certificates', validate(schoolStudentIdParamsSchema, 'params'), SchoolPanelController.studentCertificates);
router.get(
  '/students/:id/ranking',
  validate(schoolStudentIdParamsSchema, 'params'),
  validate(myRankingQuerySchema, 'query'),
  SchoolPanelController.studentRanking,
);

router.get('/results', validate(listSchoolResultsQuerySchema, 'query'), SchoolPanelController.results);

router.get('/leaderboard', validate(schoolLeaderboardQuerySchema, 'query'), SchoolPanelController.leaderboard);

export default router;
