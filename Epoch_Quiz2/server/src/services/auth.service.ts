import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { Role, UserStatus, OtpType } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { hashPassword, comparePassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  parseDurationMs,
} from '../utils/jwt';
import { env, isDev } from '../config';
import { EmailService } from './email.service';
import { ContentMeta } from './content.service';
import { SettingsService, assertMinPasswordLength } from './settings.service';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';

function slugifySubject(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

export interface DbUser {
  id:              string;
  email:           string;
  mobileNo:        string | null;
  passwordHash:    string;
  name:            string;
  role:            Role;
  status:          UserStatus;
  avatarHue:       number;
  profileComplete: boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface PublicUser {
  id:              string;
  name:            string;
  email:           string;
  role:            Role;
  status:          UserStatus;
  avatarHue:       number;
  profileComplete: boolean;
  createdAt:       Date;
}

export interface AuthResponse {
  user:         PublicUser;
  accessToken:  string;
  refreshToken: string;
}

function toPublicUser(u: DbUser): PublicUser {
  return {
    id:              u.id,
    name:            u.name,
    email:           u.email,
    role:            u.role,
    status:          u.status,
    avatarHue:       u.avatarHue,
    profileComplete: Boolean(u.profileComplete),
    createdAt:       u.createdAt,
  };
}

async function issueTokens(user: Pick<DbUser, 'id' | 'email' | 'role'>): Promise<{
  accessToken: string; refreshToken: string;
}> {
  const accessToken  = signAccessToken(user);
  const jti          = crypto.randomUUID();
  const refreshToken = signRefreshToken(user, jti);
  const tokenHash    = hashRefreshToken(refreshToken);
  const expiresAt    = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));

  // The stored id must equal the JWT's jti so `refresh` can look it up.
  await prisma.refreshToken.create({
    data: { id: jti, userId: user.id, tokenHash, expiresAt },
  });
  return { accessToken, refreshToken };
}

async function generateTeacherCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const existing = await prisma.teacherProfile.findUnique({ where: { teacherCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw ApiError.internal('Could not generate a unique teacher code. Please try again.');
}

export const AuthService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    // Registration is always for Role.STUDENT while the Teacher module is
    // disabled (see auth.validator.ts), so this is effectively the master
    // switch for public self-signup.
    if ((await SettingsService.get('users.studentRegistration')) === 'false') {
      throw ApiError.forbidden('Self-registration is currently disabled. Contact an administrator.');
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw ApiError.conflict('Email is already registered');

    if (input.mobileNo) {
      const mobileExists = await prisma.user.findUnique({ where: { mobileNo: input.mobileNo }, select: { id: true } });
      if (mobileExists) throw ApiError.conflict('Mobile number is already registered');
    }

    await assertMinPasswordLength(input.password);

    const passwordHash = await hashPassword(input.password);
    const avatarHue    = Math.floor(Math.random() * 360);

    // `input.role` is typed as Role.STUDENT while the Teacher module is
    // hidden (see auth.validator.ts); widen it so the dormant teacher branch
    // below still type-checks and can be re-enabled by reverting that schema.
    const role = input.role as Role;

    let teacherCode: string | undefined;
    if (role === Role.TEACHER) teacherCode = await generateTeacherCode();

    const user = await prisma.user.create({
      data: {
        email:           input.email,
        mobileNo:        input.mobileNo ?? null,
        passwordHash,
        name:            input.name,
        role,
        status:          UserStatus.ACTIVE,
        avatarHue,
        profileComplete: false,
        ...(role === Role.TEACHER
          ? { teacherProfile: { create: { teacherCode } } }
          : role === Role.STUDENT
            ? { studentProfile: { create: {} } }
            : {}),
      },
    });

    const tokens = await issueTokens(user);
    EmailService.sendWelcome(user.email, user.name).catch(() => {});
    return { user: toPublicUser(user), ...tokens };
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    if (user.status === UserStatus.INACTIVE) throw ApiError.forbidden('Account is inactive');
    // The Teacher module is temporarily hidden. Remove this check to re-enable
    // teacher sign-in for existing accounts.
    if (user.role === Role.TEACHER) throw ApiError.forbidden('Teacher accounts are currently unavailable.');

    const ok = await comparePassword(input.password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Invalid email or password');

    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), ...tokens };
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload;
    try { payload = verifyRefreshToken(refreshToken); }
    catch { throw ApiError.unauthorized('Invalid refresh token'); }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (!stored || stored.tokenHash !== tokenHash) throw ApiError.unauthorized('Refresh token not recognized');
    if (stored.revokedAt) throw ApiError.unauthorized('Refresh token has been revoked');
    if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token has expired');

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw ApiError.unauthorized('User no longer exists');
    // The Teacher module is temporarily hidden — this also cuts off any
    // already-issued teacher session once its access token expires.
    if (user.role === Role.TEACHER) throw ApiError.forbidden('Teacher accounts are currently unavailable.');

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return issueTokens(user);
  },

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try { payload = verifyRefreshToken(refreshToken); }
    catch { return; }
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  },

  async forgotPassword(email: string): Promise<{ ok: true; resetToken?: string }> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true };

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.otp.updateMany({
      where: { mobileOrEmail: email, otpType: OtpType.PASSWORD_RESET, isVerified: false },
      data:  { isVerified: true },
    });
    await prisma.otp.create({
      data: { mobileOrEmail: email, otpCode: token, otpType: OtpType.PASSWORD_RESET, expiresAt, isVerified: false },
    });

    EmailService.sendPasswordReset(email, token, user.name).catch(() => {});
    return { ok: true, ...(isDev ? { resetToken: token } : {}) };
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const otp = await prisma.otp.findFirst({
      where: { otpCode: token, otpType: OtpType.PASSWORD_RESET, isVerified: false, expiresAt: { gt: new Date() } },
      select: { id: true, mobileOrEmail: true },
    });
    if (!otp) throw ApiError.badRequest('Reset token is invalid or has expired.');

    const user = await prisma.user.findUnique({ where: { email: otp.mobileOrEmail } });
    if (!user) throw ApiError.notFound('User not found');

    await assertMinPasswordLength(newPassword);

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.otp.update({ where: { id: otp.id }, data: { isVerified: true } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  },

  async getMe(userId: string): Promise<PublicUser & { teacherProfile?: unknown; studentProfile?: unknown }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User not found');

    const [teacherProfile, studentProfile] = await Promise.all([
      prisma.teacherProfile.findUnique({ where: { userId } }),
      prisma.studentProfile.findUnique({ where: { userId } }),
    ]);

    let studentWithSubjects: Record<string, unknown> | null = studentProfile as Record<string, unknown> | null;
    if (studentProfile) {
      // Subjects are stored as Content API external ids; resolve display names
      // from the live (cached) catalog. Unknown ids fall back to the id itself.
      const [links, subjectNames] = await Promise.all([
        prisma.studentSubject.findMany({ where: { studentProfileId: studentProfile.id }, select: { subjectExternalId: true } }),
        ContentMeta.subjects(),
      ]);
      const subjects = links
        .map(l => ({ id: l.subjectExternalId, name: subjectNames.get(l.subjectExternalId) ?? l.subjectExternalId, slug: slugifySubject(subjectNames.get(l.subjectExternalId) ?? l.subjectExternalId) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      studentWithSubjects = { ...studentProfile, subjects };
    }

    return {
      ...toPublicUser(user),
      ...(teacherProfile ? { teacherProfile } : {}),
      ...(studentWithSubjects ? { studentProfile: studentWithSubjects } : {}),
    };
  },
};
