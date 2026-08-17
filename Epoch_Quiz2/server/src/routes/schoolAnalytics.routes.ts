import { Router } from '../core/router';
import { SchoolAnalyticsController } from '../controllers/schoolAnalytics.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { Role } from '../lib/enums';
import { schoolAnalyticsQuerySchema } from '../validators/schoolPanel.validator';

const router = new Router();

// Mounted at the same '/school-panel' prefix as schoolPanel.routes.ts (the
// project's existing pattern for admin-analytics — several route files
// sharing one prefix). School-Admin-only, every handler resolves the
// caller's own school server-side (SchoolPanelService.resolveAdminSchool).
router.use(authenticate, authorize(Role.SCHOOL_ADMIN));

const v = validate(schoolAnalyticsQuerySchema, 'query');

router.get('/analytics/overview',           v, SchoolAnalyticsController.overview);
router.get('/analytics/subject-wise',       v, SchoolAnalyticsController.subjectWise);
router.get('/analytics/difficulty-wise',    v, SchoolAnalyticsController.difficultyWise);
router.get('/analytics/improvement-trend',  v, SchoolAnalyticsController.improvementTrend);
router.get('/analytics/topics',             v, SchoolAnalyticsController.topics);

export default router;
