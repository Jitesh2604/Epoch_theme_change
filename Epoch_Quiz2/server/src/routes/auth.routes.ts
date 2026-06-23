import { Router } from '../core/router';
import { rateLimit } from '../core/middleware/rate-limiter';
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
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             30,
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
