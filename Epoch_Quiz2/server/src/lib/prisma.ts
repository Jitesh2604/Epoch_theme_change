/**
 * Prisma Client — the single source of truth for all database access.
 *
 * A single PrismaClient instance is shared process-wide (a new client per call
 * would exhaust the connection pool). All services and routes import `prisma`
 * from here; there is no other database layer.
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn', (e) => logger.warn(`[prisma] ${e.message}`));
prisma.$on('error', (e) => logger.error(`[prisma] ${e.message}`));

// ── Lifecycle ─────────────────────────────────────────────────────────────

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected (Prisma)');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
