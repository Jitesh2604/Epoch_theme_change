import { Router } from '../core/router';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/authenticate';

const router = new Router();

router.get('/practice/overview', authenticate, AnalyticsController.getPracticeOverview);
router.get('/practice/subjects', authenticate, AnalyticsController.getSubjectBreakdown);
router.get('/practice/question-types', authenticate, AnalyticsController.getQuestionTypeBreakdown);
router.get('/practice/topics', authenticate, AnalyticsController.getTopicBreakdown);

export default router;
