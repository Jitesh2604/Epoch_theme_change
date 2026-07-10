/**
 * CLI entry point for `npm run sync:questions`.
 *
 * Imports Question rows from the Epoch Content API into MySQL. See
 * questionSync.service.ts for the full architecture notes — this file is
 * just logging + process exit-code plumbing around QuestionSyncService.run().
 */
import { QuestionSyncService } from '../services/questionSync.service';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

async function main(): Promise<void> {
  const stats = await QuestionSyncService.run();

  logger.info('──────────────────────────────────────────────');
  logger.info('  Question Sync — Summary');
  logger.info('──────────────────────────────────────────────');
  logger.info(`  Fetched from Content API : ${stats.fetched}`);
  logger.info(`  Created                  : ${stats.created}`);
  logger.info(`  Updated                  : ${stats.updated}`);
  logger.info(`  Skipped                  : ${stats.skipped}`);
  logger.info(`  Failed                   : ${stats.failed}`);
  logger.info(`  Duration                 : ${stats.durationMs}ms`);
  if (Object.keys(stats.skipReasons).length > 0) {
    logger.info('  Skip reasons:');
    for (const [reason, count] of Object.entries(stats.skipReasons)) {
      logger.info(`    - ${reason}: ${count}`);
    }
  }
  logger.info('──────────────────────────────────────────────');

  if (stats.failed > 0) {
    logger.warn(`[question-sync] completed with ${stats.failed} failed record(s) — see errors above.`);
  }
}

main()
  .catch((err) => {
    logger.error(`[question-sync] FAILED: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
