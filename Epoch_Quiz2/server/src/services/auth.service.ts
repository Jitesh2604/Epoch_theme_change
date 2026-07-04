import crypto from 'crypto';
import { q, q1, run, newId, tx, cr } from '../lib/db';
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
import type { RegisterInput, LoginInput } from '../validators/auth.validator';

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
  publicationId:   string | null;
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

  await run(
    'INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, NOW())',
    [jti, user.id, tokenHash, expiresAt],
  );
  return { accessToken, refreshToken };
}

async function generateTeacherCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const existing = await q1('SELECT id FROM teacher_profiles WHERE teacherCode = ?', [code]);
    if (!existing) return code;
  }
  throw ApiError.internal('Could not generate a unique teacher code. Please try again.');
}

export const AuthService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await q1<DbUser>('SELECT id FROM users WHERE email = ?', [input.email]);
    if (existing) throw ApiError.conflict('Email is already registered');

    if (input.mobileNo) {
      const mobileExists = await q1('SELECT id FROM users WHERE mobileNo = ?', [input.mobileNo]);
      if (mobileExists) throw ApiError.conflict('Mobile number is already registered');
    }

    const passwordHash = await hashPassword(input.password);
    const userId       = newId();
    const avatarHue    = Math.floor(Math.random() * 360);

    let teacherCode: string | undefined;
    if (input.role === Role.TEACHER) teacherCode = await generateTeacherCode();

    await run(
      `INSERT INTO users (id, email, mobileNo, passwordHash, name, role, status, avatarHue, profileComplete, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [userId, input.email, input.mobileNo ?? null, passwordHash, input.name, input.role, UserStatus.ACTIVE, avatarHue],
    );

    if (input.role === Role.TEACHER) {
      await run(
        'INSERT INTO teacher_profiles (id, userId, teacherCode, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
        [newId(), userId, teacherCode],
      );
    } else if (input.role === Role.STUDENT) {
      await run(
        'INSERT INTO student_profiles (id, userId, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
        [newId(), userId],
      );
    }

    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    const tokens = await issueTokens(user!);
    EmailService.sendWelcome(user!.email, user!.name).catch(() => {});
    return { user: toPublicUser(user!), ...tokens };
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE email = ?', [input.email]);
    if (!user) throw ApiError.unauthorized('Invalid email or password');

    if (user.status === UserStatus.INACTIVE) throw ApiError.forbidden('Account is inactive');

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
    const stored = await q1<{
      id: string; userId: string; tokenHash: string; revokedAt: Date | null; expiresAt: Date;
    }>('SELECT * FROM refresh_tokens WHERE id = ?', [payload.jti]);

    if (!stored || stored.tokenHash !== tokenHash) throw ApiError.unauthorized('Refresh token not recognized');
    if (stored.revokedAt) throw ApiError.unauthorized('Refresh token has been revoked');
    if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token has expired');

    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [stored.userId]);
    if (!user) throw ApiError.unauthorized('User no longer exists');

    await run('UPDATE refresh_tokens SET revokedAt = NOW() WHERE id = ?', [stored.id]);
    return issueTokens(user);
  },

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try { payload = verifyRefreshToken(refreshToken); }
    catch { return; }
    await run('UPDATE refresh_tokens SET revokedAt = NOW() WHERE id = ? AND revokedAt IS NULL', [payload.jti]);
  },

  async forgotPassword(email: string): Promise<{ ok: true; resetToken?: string }> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return { ok: true };

    const token    = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await run(
      "UPDATE otps SET isVerified = 1 WHERE mobileOrEmail = ? AND otpType = 'PASSWORD_RESET' AND isVerified = 0",
      [email],
    );
    await run(
      'INSERT INTO otps (id, mobileOrEmail, otpCode, otpType, expiresAt, isVerified, attemptCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, 0, NOW(), NOW())',
      [newId(), email, token, OtpType.PASSWORD_RESET, expiresAt],
    );

    EmailService.sendPasswordReset(email, token, user.name).catch(() => {});
    return { ok: true, ...(isDev ? { resetToken: token } : {}) };
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const otp = await q1<{ id: string; mobileOrEmail: string }>(
      "SELECT id, mobileOrEmail FROM otps WHERE otpCode = ? AND otpType = 'PASSWORD_RESET' AND isVerified = 0 AND expiresAt > NOW()",
      [token],
    );
    if (!otp) throw ApiError.badRequest('Reset token is invalid or has expired.');

    const user = await q1<DbUser>('SELECT * FROM users WHERE email = ?', [otp.mobileOrEmail]);
    if (!user) throw ApiError.notFound('User not found');

    const passwordHash = await hashPassword(newPassword);

    await tx(async conn => {
      await cr(conn, 'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE id = ?', [passwordHash, user.id]);
      await cr(conn, 'UPDATE otps SET isVerified = 1, updatedAt = NOW() WHERE id = ?', [otp.id]);
      await cr(conn, 'UPDATE refresh_tokens SET revokedAt = NOW() WHERE userId = ? AND revokedAt IS NULL', [user.id]);
    });
  },

  async getMe(userId: string): Promise<PublicUser & { teacherProfile?: unknown; studentProfile?: unknown }> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw ApiError.notFound('User not found');

    const [teacherProfile, studentProfile] = await Promise.all([
      q1('SELECT * FROM teacher_profiles WHERE userId = ?', [userId]),
      q1<{ id: string }>('SELECT * FROM student_profiles WHERE userId = ?',  [userId]),
    ]);

    let studentWithSubjects: Record<string, unknown> | null = studentProfile as Record<string, unknown> | null;
    if (studentProfile) {
      const subjects = await q<{ id: string; name: string; slug: string }>(
        `SELECT s.id, s.name, s.slug FROM student_subjects ss
         JOIN subjects s ON s.id = ss.subjectId
         WHERE ss.studentProfileId = ? ORDER BY s.name`,
        [studentProfile.id],
      );
      studentWithSubjects = { ...studentProfile, subjects };
    }

    return {
      ...toPublicUser(user),
      ...(teacherProfile ? { teacherProfile } : {}),
      ...(studentWithSubjects ? { studentProfile: studentWithSubjects } : {}),
    };
  },
};
