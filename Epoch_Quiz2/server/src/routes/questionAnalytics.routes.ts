import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { QuestionAnalyticsController } from '../controllers/questionAnalytics.controller';

// Admin Analytics — Feature 4: Question Analytics. Admin-only, same pattern
// as studentPerformance.routes.ts / subjectAnalytics.routes.ts (mounted at
// the same /admin-analytics prefix, no path collisions — this file owns
// /questions...). Every handler delegates to QuestionAnalyticsService, which
// reuses the shared bulk-fetch/time-allocation helpers Feature 3 also uses —
// nothing here recomputes subject/chapter analytics.
const router = new Router();

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get('/questions', QuestionAnalyticsController.getOverview);
router.get('/questions/bank-count', QuestionAnalyticsController.getBankCount);
router.get('/questions/:questionId/trends', QuestionAnalyticsController.getTrends);

export default router;
