import { Router } from '../core/router';
import { Role } from '../lib/enums';
import { UserController } from '../controllers/user.controller';
import { LeaderboardController } from '../controllers/leaderboard.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { ADMIN_ROLES } from '../utils/roles';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  updateProfileSchema,
  changePasswordSchema,
  listUsersQuerySchema,
  listProfilesQuerySchema,
  userIdParamsSchema,
} from '../validators/user.validator';

const router = new Router();

router.use(authenticate);

// ── self ──────────────────────────────────────────────────────
router.get  ('/me/stats',    LeaderboardController.myStats);
router.get  ('/me',          UserController.getMe);
router.patch('/me/password', validate(changePasswordSchema), UserController.changeMyPassword);
router.patch('/me',          validate(updateProfileSchema),  UserController.updateMe);

// ── role-targeted listings ────────────────────────────────────
router.get(
  '/teachers',
  authorize(...ADMIN_ROLES),
  validate(listProfilesQuerySchema, 'query'),
  UserController.listTeachers,
);

router.get(
  '/students',
  authorize(...ADMIN_ROLES, Role.TEACHER),
  validate(listProfilesQuerySchema, 'query'),
  UserController.listStudents,
);

// ── admin: generic CRUD ───────────────────────────────────────
router.get(
  '/',
  authorize(...ADMIN_ROLES),
  validate(listUsersQuerySchema, 'query'),
  UserController.list,
);

router.post(
  '/',
  authorize(...ADMIN_ROLES),
  validate(adminCreateUserSchema),
  UserController.create,
);

router.get(
  '/:id',
  authorize(...ADMIN_ROLES),
  validate(userIdParamsSchema, 'params'),
  UserController.getById,
);

router.patch(
  '/:id',
  authorize(...ADMIN_ROLES),
  validate(userIdParamsSchema, 'params'),
  validate(adminUpdateUserSchema),
  UserController.update,
);

router.delete(
  '/:id',
  authorize(...ADMIN_ROLES),
  validate(userIdParamsSchema, 'params'),
  UserController.remove,
);

export default router;
