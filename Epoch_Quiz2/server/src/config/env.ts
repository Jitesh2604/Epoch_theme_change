import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  // ── Email (optional — password-reset emails only) ───────────
  // Set SMTP_HOST + SMTP_USER + SMTP_PASS to enable real email delivery.
  // When omitted, the reset token is returned in the API response (dev only).
  SMTP_HOST:     z.string().optional(),
  SMTP_PORT:     z.coerce.number().int().positive().default(587),
  SMTP_SECURE:   z.string().optional(),      // 'true' for port 465
  SMTP_USER:     z.string().optional(),
  SMTP_PASS:     z.string().optional(),
  EMAIL_FROM:    z.string().default('Epoch Quiz <noreply@epochquiz.app>'),
  APP_URL:       z.string().default('http://localhost:5173'),
  // Recipient of the "Contact us" form. Override in .env if the address changes.
  CONTACT_TO:    z.string().default('mayank@epochstudio.net'),

  // ── Epoch Content SDK (content synchronisation) ─────────────
  // CONTENT_API_KEY enables the sync; when absent the sync is skipped (server
  // still boots normally). Never hardcode the key — set it in .env.
  CONTENT_API_KEY:            z.string().optional(),
  CONTENT_BASE_URL:           z.string().default('https://content.epochgpt.in'),
  // Optional DNS pin: connect to this IP while keeping TLS SNI + Host = the
  // baseUrl host. Use only when the host can't be resolved locally.
  CONTENT_RESOLVE_IP:         z.string().optional(),
  CONTENT_HTTP_TIMEOUT_MS:    z.coerce.number().int().positive().default(20_000),
  CONTENT_SYNC_MAX_RETRIES:   z.coerce.number().int().min(0).max(10).default(3),
  CONTENT_SYNC_PAGE_SIZE:     z.coerce.number().int().min(1).max(500).default(100),
  CONTENT_SYNC_ENABLED:       z.string().default('true'),   // 'false' to disable the daily job
  CONTENT_SYNC_HOUR:          z.coerce.number().int().min(0).max(23).default(2),
  CONTENT_SYNC_MINUTE:        z.coerce.number().int().min(0).max(59).default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
