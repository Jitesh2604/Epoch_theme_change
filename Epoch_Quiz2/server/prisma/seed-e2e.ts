/**
 * E2E test seed — idempotent test accounts for the Playwright suite.
 *
 * Creates one ACTIVE, profile-complete user per non-admin role so login lands
 * directly on the dashboard (admin is provisioned by the main seed).
 *
 * Run with:  npm run seed:e2e
 */
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

const PASSWORD = process.env.E2E_PASSWORD ?? 'TestPass@123';

const USERS: Array<{ email: string; name: string; role: Role; avatarHue: number }> = [
  { email: process.env.E2E_TEACHER_EMAIL ?? 'test-teacher@epochquiz.test', name: 'E2E Teacher', role: Role.TEACHER, avatarHue: 150 },
  { email: process.env.E2E_STUDENT_EMAIL ?? 'test-student@epochquiz.test', name: 'E2E Student', role: Role.STUDENT, avatarHue: 250 },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      // Reset password + ensure the account is usable on every run.
      update: { name: u.name, passwordHash, role: u.role, status: UserStatus.ACTIVE, profileComplete: true },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        status: UserStatus.ACTIVE,
        profileComplete: true,
        avatarHue: u.avatarHue,
      },
    });
    console.log(`[seed:e2e] Ready: ${u.email} (${u.role}) — password: ${PASSWORD}`);
  }
  console.log('[seed:e2e] Done.');
}

main()
  .catch((err) => {
    console.error('[seed:e2e] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
