import { Router } from '../core/router';
import { Role } from '../lib/enums';
import { QuestionController } from '../controllers/question.controller';
import { UploadController } from '../controllers/upload.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { excelUpload } from '../middlewares/upload';
import { ADMIN_ROLES } from '../utils/roles';
import {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
  questionIdParamsSchema,
} from '../validators/question.validator';
import { uploadQuerySchema } from '../validators/upload.validator';

const router = new Router();

router.use(authenticate);

router.get(
  '/upload/template',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  UploadController.downloadTemplate,
);

router.post(
  '/upload',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(uploadQuerySchema, 'query'),
  excelUpload,
  UploadController.importQuestions,
);

router.get(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(listQuestionsQuerySchema, 'query'),
  QuestionController.list,
);

router.post(
  '/',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(createQuestionSchema),
  QuestionController.create,
);

router.get(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(questionIdParamsSchema, 'params'),
  QuestionController.getById,
);

router.patch(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(questionIdParamsSchema, 'params'),
  validate(updateQuestionSchema),
  QuestionController.update,
);

router.delete(
  '/:id',
  authorize(Role.TEACHER, ...ADMIN_ROLES),
  validate(questionIdParamsSchema, 'params'),
  QuestionController.remove,
);

export default router;
