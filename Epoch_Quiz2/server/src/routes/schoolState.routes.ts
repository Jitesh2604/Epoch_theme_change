import { Router } from '../core/router';
import { SchoolStateController } from '../controllers/schoolState.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  adminCreateSchoolStateSchema,
  adminUpdateSchoolStateSchema,
  listSchoolStatesQuerySchema,
  catalogIdParamsSchema,
} from '../validators/school.validator';

const router = new Router();

// Public — states are not sensitive and are needed by the (logged-out)
// School registration form's School -> State cascade (see
// SchoolStateService.list's schoolId param).
router.get('/', validate(listSchoolStatesQuerySchema, 'query'), SchoolStateController.list);

router.post(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(adminCreateSchoolStateSchema),
  SchoolStateController.create,
);

router.patch(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  validate(adminUpdateSchoolStateSchema),
  SchoolStateController.update,
);

router.delete(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  SchoolStateController.remove,
);

export default router;
