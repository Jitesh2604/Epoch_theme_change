import { Router } from '../core/router';
import { rateLimit } from '../core/middleware/rate-limiter';
import { isProd } from '../config/env';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { EmailService } from '../services/email.service';
import { contactSchema, type ContactInput } from '../validators/contact.validator';

const router = new Router();

// Public endpoint — throttle per IP to stop the form being used for spam.
const contactLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             isProd ? 10 : 10_000,
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many messages, please try again later' } },
});

router.post(
  '/',
  contactLimiter,
  validate(contactSchema),
  asyncHandler(async (req, res) => {
    const result = await EmailService.sendContactMessage(req.body as ContactInput);
    if (!result.ok) {
      // Real failure — surface it (no fake success).
      throw new ApiError(502, result.error ?? 'Could not send your message. Please try again later.');
    }
    ApiResponse.ok(res, { ok: true }, 'Message sent');
  }),
);

export default router;
