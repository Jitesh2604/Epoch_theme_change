/**
 * Prisma seed — APP-OWNED data only.
 *
 * Catalog data (subjects, classes, boards, series, books, chapters) is NOT
 * seeded here: the Content API is the single source of truth for it and the
 * backend never persists it. This seed covers only application-owned rows:
 *  - default categories (Olympiad modes surfaced by /categories)
 *  - one default ADMIN user (configurable via env)
 *
 * Run with:  npm run seed
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES: Array<{ name: string; slug: string }> = [
  { name: 'Attempt Olympiad', slug: 'attempted-olympiad' },
  { name: 'Practice Olympiad', slug: 'practice-olympiad' },
];

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@epoch.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const ADMIN_NAME     = process.env.SEED_ADMIN_NAME     ?? 'Publication Admin';

async function seedCategories(): Promise<void> {
  console.log('[seed] Upserting default categories…');
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: { name: category.name, slug: category.slug },
    });
  }
  const count = await prisma.category.count();
  console.log(`[seed] Categories in DB: ${count}`);
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
  await seedCategories();
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
