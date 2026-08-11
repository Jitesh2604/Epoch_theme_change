import { Router } from '../core/router';
import { CertificateController } from '../controllers/certificate.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { certificateIdParamsSchema } from '../validators/certificate.validator';

const router = new Router();

// Public — certificate verification is meant to be checkable by anyone who
// has the code (e.g. a school checking a student's claimed certificate),
// same mixed public/authenticated style as school.routes.ts.
router.get(
  '/verify/:certificateId',
  validate(certificateIdParamsSchema, 'params'),
  CertificateController.verify,
);

router.get('/me', authenticate, CertificateController.mine);

export default router;
