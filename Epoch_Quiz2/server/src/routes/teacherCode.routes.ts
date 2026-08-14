import { Router } from '../core/router';
import { TeacherCodeController } from '../controllers/teacherCode.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  adminCreateTeacherCodeSchema,
  adminUpdateTeacherCodeSchema,
  teacherCodeIdParamsSchema,
} from '../validators/teacherCode.validator';

const router = new Router();

// Admin-only — unlike the School catalog, these must NOT be publicly
// listable: a student who could browse valid codes could bypass the
// Assessment gate entirely.
router.use(authenticate, authorize(...ADMIN_ROLES));

router.get('/', TeacherCodeController.list);

router.post('/', validate(adminCreateTeacherCodeSchema), TeacherCodeController.create);

router.patch(
  '/:id',
  validate(teacherCodeIdParamsSchema, 'params'),
  validate(adminUpdateTeacherCodeSchema),
  TeacherCodeController.update,
);

router.delete(
  '/:id',
  validate(teacherCodeIdParamsSchema, 'params'),
  TeacherCodeController.remove,
);

export default router;
