import { Router } from '../core/router';
import { QuizController } from '../controllers/quiz.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  startPracticeSchema,
  previewPracticeSchema,
  startOlympiadSchema,
  previewMixedPracticeSchema,
  startMixedPracticeSchema,
  saveAttemptAnswerSchema,
  submitAttemptSchema,
  attemptIdParamsSchema,
  saveProgressSchema,
  listQuizAttemptsQuerySchema,
  retryAttemptSchema,
} from '../validators/quiz.validator';

const router = new Router();

// ── Subject catalogue ─────────────────────────────────────────────
router.get('/subjects', authenticate, QuizController.getSubjects);

// ── Practice flow ─────────────────────────────────────────────────
router.post(
  '/practice/preview',
  authenticate,
  validate(previewPracticeSchema),
  QuizController.previewPractice,
);

router.post(
  '/practice/start',
  authenticate,
  validate(startPracticeSchema),
  QuizController.startPractice,
);

// ── Mixed Subjects Practice (a Practice attempt drawn from multiple
//    subjects, not a single one — see QuizService.startMixedPractice) ─────
router.post(
  '/mixed-practice/preview',
  authenticate,
  validate(previewMixedPracticeSchema),
  QuizController.previewMixedPractice,
);

router.post(
  '/mixed-practice/start',
  authenticate,
  validate(startMixedPracticeSchema),
  QuizController.startMixedPractice,
);

// ── Olympiad flow (mixed quiz + attempt history) ──────────────────
router.post(
  '/olympiad/start',
  authenticate,
  validate(startOlympiadSchema),
  QuizController.startOlympiad,
);
router.get('/olympiad/attempts', authenticate, QuizController.olympiadAttempts);

// ── Admin: cross-student attempts report ───────────────────────────
router.get(
  '/attempts',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(listQuizAttemptsQuerySchema, 'query'),
  QuizController.list,
);

// ── Attempt lifecycle ─────────────────────────────────────────────
router.get(
  '/attempts/:id',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  QuizController.getAttempt,
);

router.post(
  '/attempts/:id/answer',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  validate(saveAttemptAnswerSchema),
  QuizController.saveAnswer,
);

router.post(
  '/attempts/:id/progress',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  validate(saveProgressSchema),
  QuizController.saveProgress,
);

router.post(
  '/attempts/:id/submit',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  validate(submitAttemptSchema),
  QuizController.submitAttempt,
);

// Feature 12 (Practice Review & Mistake Analysis) — "Practice Incorrect
// Questions Again", a brand-new attempt built from a past attempt's own
// wrong/skipped questions (see QuizService.startRetry).
router.post(
  '/attempts/:id/retry',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  validate(retryAttemptSchema),
  QuizController.retryAttempt,
);

export default router;
