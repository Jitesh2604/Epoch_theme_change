import { Router } from '../core/router';
import { ApiResponse } from '../utils/ApiResponse';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import authRoutes         from './auth.routes';
import userRoutes         from './user.routes';
import catalogRoutes      from './catalog.routes';
import subjectRoutes      from './subject.routes';
import assessmentRoutes   from './assessment.routes';
import questionRoutes     from './question.routes';
import assessmentQuestionRoutes from './assessmentQuestion.routes';
import submissionRoutes   from './submission.routes';
import leaderboardRoutes  from './leaderboard.routes';
import dashboardRoutes    from './dashboard.routes';
import quizRoutes         from './quiz.routes';
import settingsRoutes     from './settings.routes';
import contactRoutes      from './contact.routes';
import analyticsRoutes    from './analytics.routes';
import bookmarkRoutes     from './bookmark.routes';
import revisionRoutes     from './revision.routes';
import studentPerformanceRoutes from './studentPerformance.routes';
import subjectAnalyticsRoutes from './subjectAnalytics.routes';
import questionAnalyticsRoutes from './questionAnalytics.routes';
import assessmentAnalyticsRoutes from './assessmentAnalytics.routes';
import schoolRoutes         from './school.routes';
import schoolStateRoutes    from './schoolState.routes';
import schoolBranchRoutes   from './schoolBranch.routes';
import certificateRoutes    from './certificate.routes';
import branchCodeRoutes     from './branchCode.routes';
import schoolPanelRoutes    from './schoolPanel.routes';
import schoolAnalyticsRoutes from './schoolAnalytics.routes';
// ── TEMPORARY CONTENT CLIENT DEBUG ──
import debugRoutes          from './debug.routes';
import { isDev } from '../config';
// ── END TEMPORARY CONTENT CLIENT DEBUG ──

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
router.use('/assessments',   assessmentRoutes);
router.use('/questions',     questionRoutes);
router.use('/assessment-questions', assessmentQuestionRoutes);
router.use('/submissions',   submissionRoutes);
router.use('/leaderboard',   leaderboardRoutes);
router.use('/dashboard',     dashboardRoutes);
router.use('/quizzes',       quizRoutes);
router.use('/settings',      settingsRoutes);
router.use('/contact',       contactRoutes);
router.use('/analytics',     analyticsRoutes);
router.use('/bookmarks',     bookmarkRoutes);
router.use('/revision',      revisionRoutes);
router.use('/admin-analytics', studentPerformanceRoutes);
router.use('/admin-analytics', subjectAnalyticsRoutes);
router.use('/admin-analytics', questionAnalyticsRoutes);
router.use('/admin-analytics', assessmentAnalyticsRoutes);
router.use('/schools',        schoolRoutes);
router.use('/school-states',  schoolStateRoutes);
router.use('/school-branches', schoolBranchRoutes);
router.use('/certificates',   certificateRoutes);
router.use('/branch-codes',   branchCodeRoutes);
router.use('/school-panel',   schoolPanelRoutes);
router.use('/school-panel',   schoolAnalyticsRoutes);

// ── TEMPORARY CONTENT CLIENT DEBUG ──
// Only mounted at all when isDev — the route tree does not exist in
// production, not merely gated inside the handler.
if (isDev) {
  router.use('/debug', debugRoutes);
}
// ── END TEMPORARY CONTENT CLIENT DEBUG ──

export default router;
