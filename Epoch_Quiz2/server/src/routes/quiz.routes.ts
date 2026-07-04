import { Router } from '../core/router';
import { QuizController } from '../controllers/quiz.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import {
  startPracticeSchema,
  startOlympiadSchema,
  saveAttemptAnswerSchema,
  submitAttemptSchema,
  attemptIdParamsSchema,
} from '../validators/quiz.validator';

const router = new Router();

// ── Subject catalogue ─────────────────────────────────────────────
router.get('/subjects', authenticate, QuizController.getSubjects);

// ── Practice flow ─────────────────────────────────────────────────
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
  '/attempts/:id/submit',
  authenticate,
  validate(attemptIdParamsSchema, 'params'),
  validate(submitAttemptSchema),
  QuizController.submitAttempt,
);

export default router;
