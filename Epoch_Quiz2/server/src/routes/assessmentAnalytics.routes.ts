import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { AssessmentAnalyticsController } from '../controllers/assessmentAnalytics.controller';

// Admin Analytics — Feature 5: Assessment Analytics. Admin-only, same
// pattern as studentPerformance/subjectAnalytics/questionAnalytics.routes.ts
// (mounted at the same /admin-analytics prefix, no path collisions — this
// file owns /assessments...). Every handler delegates to
// AssessmentOverviewService/AssessmentQuestionAnalyticsService/
// LeaderboardService, which reuse the existing Assessment-side scoring/
// pass-rate/results-visibility rules — nothing here recomputes them, and
// nothing here ever touches Practice Olympiad (Quiz/QuizAttempt) data.
const router = new Router();

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get('/assessments', AssessmentAnalyticsController.getOverview);
router.get('/assessments/trends', AssessmentAnalyticsController.getTrends);
router.get('/assessments/questions', AssessmentAnalyticsController.getQuestionOverview);
router.get('/assessments/questions/bank-count', AssessmentAnalyticsController.getQuestionBankCount);
router.get('/assessments/:assessmentId/students', AssessmentAnalyticsController.getAssessmentStudents);

export default router;
