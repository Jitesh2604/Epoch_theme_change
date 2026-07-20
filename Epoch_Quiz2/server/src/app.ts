/**
 * Application bootstrap — pure Node.js, zero Express dependency.
 * Replaces express() with our native Application class.
 */

import { Application }  from './core/application';
import { Router }       from './core/router';
import { cors }         from './core/middleware/cors';
import { security }     from './core/middleware/security';
import { compression }  from './core/middleware/compression';
import { rateLimit }    from './core/middleware/rate-limiter';
import { json as jsonParser, urlEncoded } from './core/middleware/body-parser';

import { env, isProd }      from './config';
import { requestLogger }    from './middlewares/requestLogger';
import { errorHandler }     from './middlewares/errorHandler';
import { notFound }         from './middlewares/notFound';
import { ApiResponse }      from './utils/ApiResponse';
import routes               from './routes';

// Answers bare `GET /` — platform health-check probes commonly hit the
// root instead of `${API_PREFIX}/health`, which otherwise 404s and spams
// the logs with "Route GET / not found" on every probe interval.
const rootRouter = new Router();
rootRouter.get('/', (_req, res) => {
  ApiResponse.ok(res, { service: 'epoch-quiz-api', status: 'ok' });
});

const ALLOWED_ORIGINS = new Set(
  env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
);

export function createApp(): Application {
  const app = new Application();

  // ── Security headers ────────────────────────────────────────
  app.use(security({ csp: isProd, hsts: isProd }));

  // ── CORS ────────────────────────────────────────────────────
  app.use(
    cors({
      origins:         ALLOWED_ORIGINS,
      credentials:     true,
      methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders:  ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge:          86_400,
    }),
  );

  // ── Compression ─────────────────────────────────────────────
  app.use(compression());

  // ── Body parsers ────────────────────────────────────────────
  app.use(jsonParser({ limit: 1 * 1024 * 1024 }));
  app.use(urlEncoded({ limit: 1 * 1024 * 1024 }));

  // ── Request logging ─────────────────────────────────────────
  app.use(requestLogger);

  // ── Global rate limiter ─────────────────────────────────────
  app.use(
    rateLimit({
      windowMs:        env.RATE_LIMIT_WINDOW_MS,
      // Enforce the configured cap in production only; dev/test (incl. the E2E
      // suite, which fires many requests) run effectively unthrottled.
      max:             isProd ? env.RATE_LIMIT_MAX : 1_000_000,
      standardHeaders: true,
      message: {
        success: false,
        error:   { code: 'RATE_LIMITED', message: 'Too many requests — please slow down.' },
      },
    }),
  );

  // ── Root health check ────────────────────────────────────────
  app.use(rootRouter);

  // ── API routes ───────────────────────────────────────────────
  app.use(env.API_PREFIX, routes);

  // ── 404 handler (must be after routes) ──────────────────────
  app.use(notFound);

  // ── Global error handler (4-arg, must be last) ───────────────
  app.use(errorHandler as any);

  return app;
}
