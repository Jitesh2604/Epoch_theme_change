import { Router } from '../core/router';
import { BranchCodeController } from '../controllers/branchCode.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { Role } from '../lib/enums';
import {
  branchIdParamsSchema,
  branchCodeIdParamsSchema,
  verifyBranchCodeSchema,
  createOwnBranchSchema,
} from '../validators/branchCode.validator';

const router = new Router();

router.use(authenticate);

// School Admin — scoped to their own school's branches (see
// BranchCodeService's requireAdminSchool); a school admin manages every
// branch of their own school, never another school's.
router.get('/my-branches', authorize(Role.SCHOOL_ADMIN), BranchCodeController.myBranches);

// Create a new branch for my own school — schoolId always resolved
// server-side from the authenticated School Admin (see
// BranchCodeService.createBranch's requireAdminSchool), never accepted
// from the request body.
router.post(
  '/branches',
  authorize(Role.SCHOOL_ADMIN),
  validate(createOwnBranchSchema),
  BranchCodeController.createBranch,
);

router.post(
  '/branches/:branchId/generate',
  authorize(Role.SCHOOL_ADMIN),
  validate(branchIdParamsSchema, 'params'),
  BranchCodeController.generateCode,
);

router.post(
  '/:codeId/deactivate',
  authorize(Role.SCHOOL_ADMIN),
  validate(branchCodeIdParamsSchema, 'params'),
  BranchCodeController.deactivateCode,
);

// Student — verify the branch they already selected at registration; this
// never lets the student pick/change which school/branch it links to.
router.post('/verify', authorize(Role.STUDENT), validate(verifyBranchCodeSchema), BranchCodeController.verify);
router.get('/mine', authorize(Role.STUDENT), BranchCodeController.mine);

export default router;
