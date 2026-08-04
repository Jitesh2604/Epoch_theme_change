import { Router } from '../core/router';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { StudentPerformanceController } from '../controllers/studentPerformance.controller';

// Admin Analytics — Feature 2: Student Performance Analytics. Admin-only,
// mirroring dashboard.routes.ts's admin-overview pattern. Every handler
// delegates to StudentPerformanceService, which itself only calls the
// existing per-student Student Analytics functions (analytics.service.ts /
// revision.service.ts) — nothing here recomputes analytics.
const router = new Router();

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

router.get('/students', StudentPerformanceController.listCandidates);
router.post('/students/bulk-insights', StudentPerformanceController.getBulkInsights);
router.get('/students/:studentId/detail', StudentPerformanceController.getStudentDetail);

export default router;
