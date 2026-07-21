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
  saveAttemptAnswerSchema,
  submitAttemptSchema,
  attemptIdParamsSchema,
  saveProgressSchema,
  listQuizAttemptsQuerySchema,
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

// The caller's own paused attempts — "Resume Paused Quizzes". Registered
// before /attempts/:id: "paused" would otherwise match as an :id value,
// since the router has no way to distinguish a literal segment from a
// param by pattern alone — first match in registration order wins.
router.get('/attempts/paused', authenticate, QuizController.listPaused);

// ── Attempt lifecycle ─────────────────────────────────────────────
router.get(
  '/attempts/:id',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  QuizController.getAttempt,
);

router.post(
  '/attempts/:id/discard',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  QuizController.discardAttempt,
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

export default router;
