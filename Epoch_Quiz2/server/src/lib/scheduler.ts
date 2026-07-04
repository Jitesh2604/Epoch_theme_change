/**
 * Lightweight daily scheduler for the content sync (no external cron dependency).
 * Fires once per day at CONTENT_SYNC_HOUR:CONTENT_SYNC_MINUTE (local time), then
 * re-arms itself. Never throws into the event loop — sync errors are swallowed
 * and logged so the server keeps running even when the SDK is unavailable.
 */
import { env } from '../config';
import { logger } from '../utils/logger';
import { isContentConfigured } from './contentClient';
import { ContentSyncService } from '../services/content-sync.service';

let timer: NodeJS.Timeout | null = null;

function msUntilNext(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function fire(): Promise<void> {
  try {
    if (isContentConfigured() && !ContentSyncService.isRunning()) {
      logger.info('[content-sync] scheduled run triggered');
      await ContentSyncService.run('SCHEDULED');
    }
  } catch (err) {
    logger.error(`[content-sync] scheduled run error: ${(err as Error).message}`);
  } finally {
    scheduleNext();
  }
}

function scheduleNext(): void {
  const delay = msUntilNext(env.CONTENT_SYNC_HOUR, env.CONTENT_SYNC_MINUTE);
  timer = setTimeout(fire, delay);
  if (timer.unref) timer.unref(); // don't keep the process alive just for this
  logger.info(`[content-sync] next scheduled run in ~${Math.round(delay / 60000)} min (${env.CONTENT_SYNC_HOUR}:${String(env.CONTENT_SYNC_MINUTE).padStart(2, '0')})`);
}

export function startContentScheduler(): void {
  if (env.CONTENT_SYNC_ENABLED !== 'true') {
    logger.info('[content-sync] daily scheduler disabled (CONTENT_SYNC_ENABLED != true)');
    return;
  }
  if (!isContentConfigured()) {
    logger.warn('[content-sync] scheduler not started — CONTENT_API_KEY not set');
    return;
  }
  scheduleNext();
}

export function stopContentScheduler(): void {
  if (timer) { clearTimeout(timer); timer = null; }
}
