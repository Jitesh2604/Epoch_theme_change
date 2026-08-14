import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import type {
  AdminCreateTeacherCodeInput,
  AdminUpdateTeacherCodeInput,
} from '../validators/teacherCode.validator';

export interface TeacherCodeRow {
  id:        string;
  code:      string;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const TeacherCodeService = {
  async list(includeInactive = false): Promise<TeacherCodeRow[]> {
    return prisma.teacherCode.findMany({
      where:   includeInactive ? {} : { isActive: true },
      orderBy: { code: 'asc' },
    });
  },

  async create(input: AdminCreateTeacherCodeInput): Promise<TeacherCodeRow> {
    const existing = await prisma.teacherCode.findUnique({ where: { code: input.code }, select: { id: true } });
    if (existing) throw ApiError.conflict('This teacher code already exists');

    return prisma.teacherCode.create({
      data: { code: input.code, isActive: input.isActive ?? true },
    });
  },

  async update(id: string, input: AdminUpdateTeacherCodeInput): Promise<TeacherCodeRow> {
    const tc = await prisma.teacherCode.findUnique({ where: { id } });
    if (!tc) throw ApiError.notFound('Teacher code not found');

    if (input.code && input.code !== tc.code) {
      const taken = await prisma.teacherCode.findUnique({ where: { code: input.code }, select: { id: true } });
      if (taken) throw ApiError.conflict('This teacher code already exists');
    }

    return prisma.teacherCode.update({
      where: { id },
      data: {
        ...(input.code !== undefined && { code: input.code }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  },

  // Soft delete only, matching SchoolService — a deactivated code should
  // stop unlocking Assessment for anyone still holding it (see
  // studentHasValidCode's live re-check), not just stop being assignable.
  async deactivate(id: string): Promise<TeacherCodeRow> {
    const tc = await prisma.teacherCode.findUnique({ where: { id } });
    if (!tc) throw ApiError.notFound('Teacher code not found');
    return prisma.teacherCode.update({ where: { id }, data: { isActive: false } });
  },

  /** Case-insensitive lookup of a real, active code. Returns null (never
   *  throws) so callers can distinguish "invalid code" from a real error. */
  async findValid(rawCode: string): Promise<TeacherCodeRow | null> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return null;
    const tc = await prisma.teacherCode.findUnique({ where: { code } });
    return tc && tc.isActive ? tc : null;
  },

  /** Live gate check for Assessment access — re-validates the student's
   *  saved code against the catalog on every call (not just "is the field
   *  non-null"), so deactivating a code immediately revokes access. */
  async studentHasValidCode(userId: string): Promise<boolean> {
    const sp = await prisma.studentProfile.findUnique({ where: { userId }, select: { teacherCode: true } });
    if (!sp?.teacherCode) return false;
    const tc = await TeacherCodeService.findValid(sp.teacherCode);
    return !!tc;
  },
};
