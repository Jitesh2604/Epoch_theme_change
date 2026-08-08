import { Router } from '../core/router';
import { SchoolBranchController } from '../controllers/schoolBranch.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  adminCreateSchoolBranchSchema,
  adminUpdateSchoolBranchSchema,
  listSchoolBranchesQuerySchema,
  catalogIdParamsSchema,
} from '../validators/school.validator';

const router = new Router();

// Public — needed by the (logged-out) School registration form's
// State -> Branch cascade.
router.get('/', validate(listSchoolBranchesQuerySchema, 'query'), SchoolBranchController.list);

router.post(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(adminCreateSchoolBranchSchema),
  SchoolBranchController.create,
);

router.patch(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  validate(adminUpdateSchoolBranchSchema),
  SchoolBranchController.update,
);

router.delete(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  SchoolBranchController.remove,
);

export default router;
