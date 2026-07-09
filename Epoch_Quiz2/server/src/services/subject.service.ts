/**
 * Subject / category service.
 *
 * Real subjects come from the Content API (single source of truth). Each item's
 * `id` is the API EXTERNAL ID (a string) — the same value the rest of the app
 * stores as `subjectExternalId`. Nothing is written to MySQL.
 *
 * The synthetic Olympiad "mode" rows are app concepts (NOT catalog) that live
 * in the app-owned `olympiad_modes` table and are always appended. `kind` lets
 * the client branch behaviour: 'SUBJECT' = a real Content API subject, anything
 * else = an Olympiad mode.
 *
 * This endpoint is public (the logged-out home page uses it), so it must never
 * fail hard on an API outage — it degrades to just the Olympiad modes.
 */
import { prisma } from '../lib/prisma';
import { ContentService } from './content.service';
import { logger } from '../utils/logger';

interface SubjectItem { id: string; name: string; slug: string; kind: string }

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

/** The app-owned Olympiad "mode" rows (kind != SUBJECT). */
function olympiadModes(): Promise<SubjectItem[]> {
  return prisma.olympiadMode.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, kind: true },
    orderBy: [{ serial: 'asc' }, { name: 'asc' }],
  });
}

export const SubjectService = {
  // Every real subject from the Content API, plus the app-owned Olympiad
  // "modes". Real subjects use their external id as `id`.
  async list(): Promise<SubjectItem[]> {
    const modes = await olympiadModes();
    if (!ContentService.isConfigured()) return modes;
    try {
      const apiSubjects = await ContentService.getSubjects();
      const real: SubjectItem[] = apiSubjects
        .map(s => ({ id: String(s.id), name: s.name, slug: slugify(s.name), kind: 'SUBJECT' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...real, ...modes];
    } catch (err) {
      logger.warn(`[subjects] from API failed, returning Olympiad modes only: ${(err as Error).message}`);
      return modes;
    }
  },
};
