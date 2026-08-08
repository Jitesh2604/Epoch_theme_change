import { Router } from '../core/router';
import { rateLimit } from '../core/middleware/rate-limiter';
import { isProd } from '../config/env';
import { SchoolController } from '../controllers/school.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  schoolRegisterSchema,
  adminCreateSchoolSchema,
  adminUpdateSchoolSchema,
  catalogIdParamsSchema,
} from '../validators/school.validator';

const router = new Router();

// Same shape as auth.routes.ts's authLimiter — this is a public credential-
// creating endpoint (it hashes a password and creates a User), so it gets
// the same per-IP throttling.
const registerLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             isProd ? 30 : 10_000,
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

// Public catalogue — school names are not sensitive and are needed by the
// (logged-out) School registration form.
router.get('/', SchoolController.list);

router.post('/register', registerLimiter, validate(schoolRegisterSchema), SchoolController.register);

router.post(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(adminCreateSchoolSchema),
  SchoolController.create,
);

router.patch(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  validate(adminUpdateSchoolSchema),
  SchoolController.update,
);

router.delete(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate(catalogIdParamsSchema, 'params'),
  SchoolController.remove,
);

export default router;
