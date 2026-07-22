import { Router } from '../core/router';
import { Role } from '../lib/enums';
import { AssessmentQuestionController } from '../controllers/assessmentQuestion.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  createAssessmentQuestionSchema,
  updateAssessmentQuestionBankSchema,
  listAssessmentQuestionsQuerySchema,
  assessmentQuestionBankIdParamsSchema,
} from '../validators/assessmentQuestion.validator';

// The Assessment Question Bank's own CRUD — a table physically separate from
// `/questions` (Practice/Olympiad's bank). The nested "questions attached to
// a given assessment" endpoints (attach/detach/reorder/list-for-assessment)
// live under /assessments/:id/questions in assessment.routes.ts, backed by
// this same AssessmentQuestionController.
const router = new Router();

router.use(authenticate);

router.get(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(listAssessmentQuestionsQuerySchema, 'query'),
  AssessmentQuestionController.list,
);

router.post(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(createAssessmentQuestionSchema),
  AssessmentQuestionController.create,
);

router.get(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentQuestionBankIdParamsSchema, 'params'),
  AssessmentQuestionController.getById,
);

router.patch(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentQuestionBankIdParamsSchema, 'params'),
  validate(updateAssessmentQuestionBankSchema),
  AssessmentQuestionController.update,
);

router.delete(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(assessmentQuestionBankIdParamsSchema, 'params'),
  AssessmentQuestionController.remove,
);

export default router;
