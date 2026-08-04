import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { SubjectAnalyticsController } from '../controllers/subjectAnalytics.controller';

// Admin Analytics — Feature 3: Subject Analytics. Admin-only, same pattern
// as studentPerformance.routes.ts (mounted at the same /admin-analytics
// prefix, no path collisions — that file owns /students..., this one owns
// /subjects...). Every handler delegates to SubjectAnalyticsService, which
// reuses the same per-(subject,attempt) slicing technique as
// analytics.service.ts — nothing here recomputes per-student analytics.
const router = new Router();

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get('/subjects', SubjectAnalyticsController.getOverview);
router.get('/subjects/:subjectId/chapters', SubjectAnalyticsController.getChapters);
router.get('/subjects/:subjectId/trends', SubjectAnalyticsController.getTrends);

export default router;
