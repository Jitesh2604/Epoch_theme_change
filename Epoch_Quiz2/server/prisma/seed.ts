/**
 * Prisma seed — APP-OWNED data only.
 *
 * Catalog data (subjects, classes, boards, series, books, chapters) is NOT
 * seeded here: the Content API is the single source of truth for it and the
 * backend never persists it. This seed covers only application-owned rows:
 *  - default Olympiad modes (surfaced alongside live subjects by /subjects)
 *  - one default ADMIN user (configurable via env)
 *
 * Run with:  npm run seed
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_OLYMPIAD_MODES: Array<{ name: string; slug: string; kind: string; serial: string }> = [
  { name: 'Practice Olympiad',  slug: 'practice-olympiad',   kind: 'PRACTICE_OLYMPIAD',  serial: '0' },
  { name: 'Attempted Olympiad', slug: 'attempted-olympiad',  kind: 'ATTEMPTED_OLYMPIAD', serial: '1' },
];

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@epoch.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const ADMIN_NAME     = process.env.SEED_ADMIN_NAME     ?? 'Publication Admin';

async function seedOlympiadModes(): Promise<void> {
  console.log('[seed] Upserting default Olympiad modes…');
  for (const mode of DEFAULT_OLYMPIAD_MODES) {
    await prisma.olympiadMode.upsert({
      where: { slug: mode.slug },
      update: { name: mode.name, kind: mode.kind, serial: mode.serial },
      create: mode,
    });
  }
  const count = await prisma.olympiadMode.count();
  console.log(`[seed] Olympiad modes in DB: ${count}`);
}

async function seedAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`[seed] Admin already exists (${ADMIN_EMAIL}) — skipping`);
    return;
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash,
      role: Role.SUPER_ADMIN,
      avatarHue: 220,
    },
  });
  console.log(`[seed] Admin created: ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`);
  console.log('[seed] ⚠  Change the admin password immediately after first login.');
}

async function main(): Promise<void> {
  await seedOlympiadModes();
  await seedAdmin();
  console.log('[seed] Done.');
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
