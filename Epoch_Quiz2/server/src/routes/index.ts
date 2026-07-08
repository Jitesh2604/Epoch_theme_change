import { Router } from '../core/router';
import { ApiResponse } from '../utils/ApiResponse';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import authRoutes         from './auth.routes';
import userRoutes         from './user.routes';
import catalogRoutes      from './catalog.routes';
import subjectRoutes      from './subject.routes';
import categoryRoutes     from './category.routes';
import assessmentRoutes   from './assessment.routes';
import questionRoutes     from './question.routes';
import submissionRoutes   from './submission.routes';
import leaderboardRoutes  from './leaderboard.routes';
import notificationRoutes from './notification.routes';
import dashboardRoutes    from './dashboard.routes';
import quizRoutes         from './quiz.routes';
import settingsRoutes     from './settings.routes';
import contactRoutes      from './contact.routes';
import contentRoutes      from './content.routes';

const router = new Router();

router.get('/health', (_req, res) => {
  ApiResponse.ok(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

router.get(
  '/health/db',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ApiResponse.ok(res, { database: 'connected' });
  })
);

router.use('/auth',          authRoutes);
router.use('/users',         userRoutes);
router.use('/catalog',       catalogRoutes);
router.use('/subjects',      subjectRoutes);
router.use('/categories',    categoryRoutes);
router.use('/assessments',   assessmentRoutes);
router.use('/questions',     questionRoutes);
router.use('/submissions',   submissionRoutes);
router.use('/leaderboard',   leaderboardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard',     dashboardRoutes);
router.use('/quizzes',       quizRoutes);
router.use('/settings',      settingsRoutes);
router.use('/contact',       contactRoutes);
router.use('/admin/content', contentRoutes);

export default router;
