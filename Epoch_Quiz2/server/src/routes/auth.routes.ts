import { Router } from '../core/router';
import { rateLimit } from '../core/middleware/rate-limiter';
import { isProd } from '../config/env';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator';

const router = new Router();

// Tight per-IP limiter on credential endpoints to slow brute-force.
// Kept strict in production only; relaxed in dev/test so local work and the
// E2E suite (which performs many logins) aren't throttled.
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             isProd ? 30 : 10_000,
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login',    authLimiter, validate(loginSchema),    AuthController.login);
router.post('/refresh',  validate(refreshSchema),               AuthController.refresh);
router.post('/logout',   validate(logoutSchema),                AuthController.logout);
router.get('/me',        authenticate,                                     AuthController.me);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password',  authLimiter, validate(resetPasswordSchema),  AuthController.resetPassword);

export default router;
