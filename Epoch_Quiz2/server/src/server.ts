import { createApp } from './app';
import { env } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { startContentScheduler, stopContentScheduler } from './lib/scheduler';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Attempt DB connection but do not crash the process if it fails
  // in development — keeps `npm run dev` usable before Module 2 migration.
  try {
    await connectDatabase();
  } catch (err) {
    logger.warn(
      `Database not reachable on startup — health/db endpoint will fail. (${(err as Error).message})`
    );
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running at http://localhost:${env.PORT}${env.API_PREFIX}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    // Arm the daily content synchronisation (no-op if unconfigured/disabled).
    startContentScheduler();
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully…`);
    stopContentScheduler();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });

    // Force exit after 10s if hanging.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${(reason as Error)?.stack ?? String(reason)}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error(`Failed to start server: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
