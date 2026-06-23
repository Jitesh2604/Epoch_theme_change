import { Router } from '../core/router';
import { Role } from '../lib/enums';
import { SubmissionController } from '../controllers/submission.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  saveAnswerSchema,
  submitAttemptSchema,
  gradeAnswerSchema,
  listSubmissionsQuerySchema,
  submissionIdParamsSchema,
  submissionAnswerParamsSchema,
} from '../validators/submission.validator';

const router = new Router();

router.use(authenticate);

router.get(
  '/me',
  authorize(Role.STUDENT),
  validate(listSubmissionsQuerySchema, 'query'),
  SubmissionController.listMine,
);

router.get(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(listSubmissionsQuerySchema, 'query'),
  SubmissionController.list,
);

router.get(
  '/:id',
  validate(submissionIdParamsSchema, 'params'),
  SubmissionController.getById,
);

router.post(
  '/:id/answer',
  authorize(Role.STUDENT, ...ADMIN_ROLES),
  validate(submissionIdParamsSchema, 'params'),
  validate(saveAnswerSchema),
  SubmissionController.saveAnswer,
);

router.post(
  '/:id/submit',
  authorize(Role.STUDENT, ...ADMIN_ROLES),
  validate(submissionIdParamsSchema, 'params'),
  validate(submitAttemptSchema),
  SubmissionController.submit,
);

router.patch(
  '/:id/answers/:questionId/grade',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(submissionAnswerParamsSchema, 'params'),
  validate(gradeAnswerSchema),
  SubmissionController.grade,
);

export default router;
