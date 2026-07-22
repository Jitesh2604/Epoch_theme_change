import { Router } from '../core/router';
import { Role } from '../lib/enums';
import { ADMIN_ROLES } from '../utils/roles';
import { AssessmentController } from '../controllers/assessment.controller';
import { AssessmentQuestionController } from '../controllers/assessmentQuestion.controller';
import { SubmissionController } from '../controllers/submission.controller';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  createAssessmentSchema,
  updateAssessmentSchema,
  listAssessmentsQuerySchema,
  assessmentIdParamsSchema,
  assignAssessmentSchema,
} from '../validators/assessment.validator';
import {
  attachQuestionsSchema,
  updateAssessmentQuestionSchema,
  reorderQuestionsSchema,
  assessmentQuestionParamsSchema,
} from '../validators/assessmentQuestion.validator';
import { assessmentLeaderboardQuerySchema } from '../validators/leaderboard.validator';

const router = new Router();

router.use(authenticate);

// ── list / read (scoped per role inside the service) ──────────
router.get(
  '/',
  validate(listAssessmentsQuerySchema, 'query'),
  AssessmentController.list,
);

router.get(
  '/:id',
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.getById,
);

// ── write (TEACHER or ADMIN; STUDENT is rejected by service) ──
router.post(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(createAssessmentSchema),
  AssessmentController.create,
);

router.patch(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  validate(updateAssessmentSchema),
  AssessmentController.update,
);

router.delete(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.remove,
);

// ── status transitions ────────────────────────────────────────
router.post(
  '/:id/publish',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.publish,
);

router.post(
  '/:id/unpublish',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.unpublish,
);

router.post(
  '/:id/archive',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.archive,
);

router.post(
  '/:id/publish-results',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.publishResults,
);

router.post(
  '/:id/unpublish-results',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.unpublishResults,
);

// ── assignment (assign to classes / students) ─────────────────
router.get(
  '/:id/assignments',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentController.getAssignments,
);

router.post(
  '/:id/assign',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  validate(assignAssessmentSchema),
  AssessmentController.assign,
);

// ── nested: /assessments/:id/questions (TEACHER / ADMIN only) ─

router.get(
  '/:id/questions',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  AssessmentQuestionController.listForAssessment,
);

router.post(
  '/:id/questions',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  validate(attachQuestionsSchema),
  AssessmentQuestionController.attach,
);

// Bulk reorder — must come before "/:id/questions/:questionId"
// so Express doesn't treat "reorder" as a questionId.
router.patch(
  '/:id/questions/reorder',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  validate(reorderQuestionsSchema),
  AssessmentQuestionController.reorder,
);

router.patch(
  '/:id/questions/:questionId',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentQuestionParamsSchema, 'params'),
  validate(updateAssessmentQuestionSchema),
  AssessmentQuestionController.updateAttachment,
);

router.delete(
  '/:id/questions/:questionId',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentQuestionParamsSchema, 'params'),
  AssessmentQuestionController.detach,
);

// ── student: start an attempt for this assessment ─────────────
router.post(
  '/:id/start',
  authorize(Role.STUDENT, ...ADMIN_ROLES),
  validate(assessmentIdParamsSchema, 'params'),
  SubmissionController.start,
);

// ── leaderboard for this assessment ───────────────────────────
router.get(
  '/:id/leaderboard',
  validate(assessmentIdParamsSchema, 'params'),
  validate(assessmentLeaderboardQuerySchema, 'query'),
  LeaderboardController.forAssessment,
);

export default router;
