/**
 * Subject / category service.
 *
 * Real subjects come from the Content API (single source of truth); each is
 * resolved to its local row (keyed by `externalId`) so the returned id is a
 * valid foreign key. The two synthetic Olympiad "mode" rows (kind != SUBJECT)
 * are app concepts that live only in the DB and are always appended.
 *
 * Falls back to the locally-synced subjects when the API is unavailable. This
 * endpoint is public (the logged-out home page uses it), so it must never fail
 * hard on an API outage.
 */
import { prisma } from '../lib/prisma';
import { isContentConfigured } from '../lib/contentClient';
import { ContentService } from './content.service';
import { logger } from '../utils/logger';

interface SubjectItem { id: string; name: string; slug: string; kind: string }

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `subject-${Date.now()}`;
}

/** Resolve an API subject to its local row (adopt same-named row, else create). */
async function resolveSubject(extId: string, name: string): Promise<SubjectItem> {
  const existing = await prisma.subject.findUnique({ where: { externalId: extId }, select: { id: true, slug: true, kind: true } });
  if (existing) return { id: existing.id, name, slug: existing.slug, kind: existing.kind };

  const byName = await prisma.subject.findFirst({ where: { name, externalId: null }, select: { id: true, slug: true, kind: true } });
  if (byName) {
    await prisma.subject.update({ where: { id: byName.id }, data: { externalId: extId } });
    return { id: byName.id, name, slug: byName.slug, kind: byName.kind };
  }
  const slug = slugify(name);
  const created = await prisma.subject.create({
    data: { name, slug, kind: 'SUBJECT', externalId: extId, status: 'ACTIVE' }, select: { id: true },
  });
  return { id: created.id, name, slug, kind: 'SUBJECT' };
}

/** The synthetic Olympiad "mode" rows (kind != SUBJECT) — app concepts, DB-only. */
function olympiadModes(): Promise<SubjectItem[]> {
  return prisma.subject.findMany({
    where: { status: 'ACTIVE', kind: { not: 'SUBJECT' } },
    select: { id: true, name: true, slug: true, kind: true },
    orderBy: [{ serial: 'asc' }, { name: 'asc' }],
  });
}

export const SubjectService = {
  // Every active subject, including the special Olympiad "modes" (kind !=
  // SUBJECT). `kind` lets the client branch behaviour without hardcoding.
  async list(): Promise<SubjectItem[]> {
    if (isContentConfigured()) {
      try {
        const apiSubjects = await ContentService.getSubjects();
        const real = await Promise.all(apiSubjects.map(s => resolveSubject(String(s.id), s.name)));
        real.sort((a, b) => a.name.localeCompare(b.name));
        return [...real, ...await olympiadModes()];
      } catch (err) {
        logger.warn(`[subjects] from API failed, using local rows: ${(err as Error).message}`);
      }
    }
    return prisma.subject.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, kind: true },
      orderBy: [{ serial: 'asc' }, { name: 'asc' }],
    });
  },

  async findById(id: string) {
    return prisma.subject.findUnique({ where: { id }, select: { id: true, name: true, slug: true, kind: true } });
  },
};
