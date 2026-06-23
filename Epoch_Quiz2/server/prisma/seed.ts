/**
 * Prisma seed
 *  - default subjects
 *  - one default ADMIN user (configurable via env)
 *
 * Run with:  npm run prisma:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_SUBJECTS: Array<{ name: string; slug: string }> = [
  { name: 'Mathematics',       slug: 'mathematics' },
  { name: 'Science',           slug: 'science' },
  { name: 'English',           slug: 'english' },
  { name: 'General Knowledge', slug: 'general-knowledge' },
  { name: 'Computer Science',  slug: 'computer-science' },
  { name: 'Social Studies',    slug: 'social-studies' },
];

// Standard grade levels (Class 1 … Class 12). `serial` drives catalog ordering.
const DEFAULT_CLASSES: Array<{ name: string; serial: string }> = Array.from(
  { length: 12 },
  (_, i) => ({ name: `Class ${i + 1}`, serial: String(i + 1).padStart(2, '0') }),
);

const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@epoch.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const ADMIN_NAME     = process.env.SEED_ADMIN_NAME     ?? 'Publication Admin';

async function seedSubjects(): Promise<void> {
  console.log('[seed] Upserting default subjects…');
  for (const s of DEFAULT_SUBJECTS) {
    await prisma.subject.upsert({
      where: { slug: s.slug },
      update: { name: s.name },
      create: { name: s.name, slug: s.slug },
    });
  }
  const count = await prisma.subject.count();
  console.log(`[seed] Subjects in DB: ${count}`);
}

async function seedClasses(): Promise<void> {
  console.log('[seed] Upserting default classes…');
  // Class.name has no unique constraint, so match by name to stay idempotent.
  for (const c of DEFAULT_CLASSES) {
    const existing = await prisma.class.findFirst({ where: { name: c.name } });
    if (existing) {
      if (existing.serial !== c.serial) {
        await prisma.class.update({ where: { id: existing.id }, data: { serial: c.serial } });
      }
    } else {
      await prisma.class.create({ data: { name: c.name, serial: c.serial } });
    }
  }
  const count = await prisma.class.count();
  console.log(`[seed] Classes in DB: ${count}`);
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
  await seedSubjects();
  await seedClasses();
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
