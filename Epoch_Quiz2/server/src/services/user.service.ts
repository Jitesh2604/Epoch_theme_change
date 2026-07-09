import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role, UserStatus, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { hashPassword, comparePassword } from '../utils/password';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { suggestStateBoard } from '../lib/educationBoards';
import { ContentService, ContentMeta } from './content.service';
import type { DbUser } from './auth.service';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  UpdateProfileInput,
  ChangePasswordInput,
  ListUsersQuery,
  ListProfilesQuery,
} from '../validators/user.validator';

export interface PublicUser {
  id:              string;
  name:            string;
  email:           string;
  role:            Role;
  status:          UserStatus;
  avatarHue:       number;
  profileComplete: boolean;
  createdAt:       Date;
  updatedAt:       Date;
  mobileNo?:       string | null;
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
    updatedAt:       u.updatedAt,
    mobileNo:        u.mobileNo ?? null,
  };
}

/** Build a case-insensitive name/email search filter. */
function searchFilter(search?: string): Prisma.UserWhereInput {
  return search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {};
}

export const UserService = {
  async list(query: ListUsersQuery) {
    const { page, limit, role, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(status && { status }),
      ...searchFilter(search),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: { teacherProfile: true, studentProfile: true },
      }),
      prisma.user.count({ where }),
    ]);

    const items = users.map(u => ({
      ...toPublicUser(u),
      ...(u.teacherProfile ? { teacherProfile: u.teacherProfile } : {}),
      ...(u.studentProfile ? { studentProfile: u.studentProfile } : {}),
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },

  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true, studentProfile: true },
    });
    if (!user) throw ApiError.notFound('User not found');

    return {
      ...toPublicUser(user),
      ...(user.teacherProfile ? { teacherProfile: user.teacherProfile } : {}),
      ...(user.studentProfile ? { studentProfile: user.studentProfile } : {}),
    };
  },

  async create(input: AdminCreateUserInput): Promise<PublicUser> {
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw ApiError.conflict('Email is already registered');

    const passwordHash = await hashPassword(input.password);
    const avatarHue    = input.avatarHue ?? Math.floor(Math.random() * 360);
    const userStatus   = input.status ?? UserStatus.ACTIVE;

    const user = await prisma.user.create({
      data: {
        email:           input.email,
        passwordHash,
        name:            input.name,
        role:            input.role,
        status:          userStatus,
        avatarHue,
        profileComplete: false,
        ...(input.role === Role.TEACHER
          ? { teacherProfile: { create: { schoolName: input.schoolName ?? null } } }
          : input.role === Role.STUDENT
            ? { studentProfile: { create: { schoolName: input.schoolName ?? null } } }
            : {}),
      },
    });

    return toPublicUser(user);
  },

  async update(id: string, input: AdminUpdateUserInput): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw ApiError.notFound('User not found');

    if (input.email && input.email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (taken) throw ApiError.conflict('Email is already in use');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name      !== undefined && { name: input.name }),
        ...(input.email     !== undefined && { email: input.email }),
        ...(input.status    !== undefined && { status: input.status }),
        ...(input.avatarHue !== undefined && { avatarHue: input.avatarHue }),
      },
    });

    if (user.role === Role.TEACHER && (input.schoolName !== undefined || input.bio !== undefined)) {
      const fields = {
        ...(input.schoolName !== undefined && { schoolName: input.schoolName ?? null }),
        ...(input.bio        !== undefined && { bio: input.bio ?? null }),
      };
      await prisma.teacherProfile.upsert({
        where: { userId: id },
        create: { userId: id, ...fields },
        update: fields,
      });
    }

    const teacherCode = (input as { teacherCode?: string | null }).teacherCode;
    if (user.role === Role.STUDENT && (input.schoolName !== undefined || teacherCode !== undefined)) {
      const fields = {
        ...(input.schoolName !== undefined && { schoolName: input.schoolName ?? null }),
        ...(teacherCode      !== undefined && { teacherCode: teacherCode ?? null }),
      };
      await prisma.studentProfile.upsert({
        where: { userId: id },
        create: { userId: id, ...fields },
        update: fields,
      });
    }

    return toPublicUser(updated);
  },

  async deactivate(id: string): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw ApiError.notFound('User not found');

    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { status: UserStatus.INACTIVE } }),
      prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return toPublicUser(updated);
  },

  async updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User not found');

    // 1. Update user scalars (profile is always marked complete here).
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        profileComplete: true,
        ...(input.name      !== undefined && { name: input.name }),
        ...(input.avatarHue !== undefined && { avatarHue: input.avatarHue }),
      },
    });

    const dob = input.dob !== undefined
      ? (input.dob ? new Date(input.dob + 'T00:00:00.000Z') : null)
      : undefined;

    const existingState = input.state !== undefined ? input.state : null;
    const boardFields: Record<string, unknown> = {};
    if (input.educationBoard !== undefined) {
      boardFields.educationBoard = input.educationBoard;
      boardFields.stateBoard = input.educationBoard === 'STATE_BOARD'
        ? (input.stateBoard?.trim() || suggestStateBoard(existingState) || null)
        : null;
    } else if (input.stateBoard !== undefined) {
      boardFields.stateBoard = input.stateBoard?.trim() || null;
    }

    const sharedFields: Record<string, unknown> = {
      ...(dob              !== undefined && { dob }),
      ...(input.schoolName !== undefined && { schoolName: input.schoolName }),
      ...(input.address    !== undefined && { address:    input.address }),
      ...(input.country    !== undefined && { country:    input.country }),
      ...(input.state      !== undefined && { state:      input.state }),
      ...(input.city       !== undefined && { city:       input.city }),
      ...(input.zip        !== undefined && { zip:        input.zip }),
      ...(input.imageUrl   !== undefined && { imageUrl:   input.imageUrl }),
      ...boardFields,
    };

    if (user.role === Role.TEACHER) {
      const teacherFields = {
        ...sharedFields,
        ...(input.boardExternalId !== undefined && { boardExternalId: input.boardExternalId }),
        ...(input.bio             !== undefined && { bio:             input.bio }),
      } as Prisma.TeacherProfileUncheckedUpdateInput;

      const tp = await prisma.teacherProfile.upsert({
        where: { userId },
        create: { userId, ...teacherFields } as Prisma.TeacherProfileUncheckedCreateInput,
        update: teacherFields,
      });

      if (input.classExternalIds !== undefined) {
        await prisma.teacherClass.deleteMany({ where: { teacherProfileId: tp.id } });
        if (input.classExternalIds.length)
          await prisma.teacherClass.createMany({ data: input.classExternalIds.map(classExternalId => ({ teacherProfileId: tp.id, classExternalId })), skipDuplicates: true });
      }
      if (input.subjectExternalIds !== undefined) {
        await prisma.teacherSubject.deleteMany({ where: { teacherProfileId: tp.id } });
        if (input.subjectExternalIds.length)
          await prisma.teacherSubject.createMany({ data: input.subjectExternalIds.map(subjectExternalId => ({ teacherProfileId: tp.id, subjectExternalId })), skipDuplicates: true });
      }
      if (input.seriesExternalIds !== undefined) {
        await prisma.teacherSeries.deleteMany({ where: { teacherProfileId: tp.id } });
        if (input.seriesExternalIds.length)
          await prisma.teacherSeries.createMany({ data: input.seriesExternalIds.map(seriesExternalId => ({ teacherProfileId: tp.id, seriesExternalId })), skipDuplicates: true });
      }
      if (input.bookExternalIds !== undefined) {
        await prisma.teacherBook.deleteMany({ where: { teacherProfileId: tp.id } });
        if (input.bookExternalIds.length)
          await prisma.teacherBook.createMany({ data: input.bookExternalIds.map(bookExternalId => ({ teacherProfileId: tp.id, bookExternalId })), skipDuplicates: true });
      }
    }

    if (user.role === Role.STUDENT) {
      let inheritedBoardId:  string | null | undefined;
      let inheritedClassId:  string | null | undefined;
      let inheritedSeriesId: string | null | undefined;
      let inheritedBookIds:  string[] | undefined;
      let normalizedCode:    string | null | undefined = input.teacherCode;

      if (input.teacherCode != null && input.teacherCode.trim() !== '') {
        const code    = input.teacherCode.trim().toUpperCase();
        const teacher = await prisma.teacherProfile.findUnique({
          where: { teacherCode: code },
          select: {
            id: true, boardExternalId: true,
            classes: { take: 1, select: { classExternalId: true } },
            teacherSeries: { take: 1, select: { seriesExternalId: true } },
            books: { select: { bookExternalId: true } },
          },
        });
        if (!teacher) throw ApiError.badRequest('Invalid teacher code. Please check the code with your teacher.');

        normalizedCode    = code;
        inheritedBoardId  = teacher.boardExternalId ?? null;
        inheritedClassId  = teacher.classes[0]?.classExternalId ?? null;
        inheritedSeriesId = teacher.teacherSeries[0]?.seriesExternalId ?? null;
        inheritedBookIds  = teacher.books.map(b => b.bookExternalId);
      }

      const studentFields = {
        ...sharedFields,
        ...(normalizedCode    !== undefined && { teacherCode: normalizedCode }),
        ...(inheritedBoardId  !== undefined
          ? { boardExternalId:  inheritedBoardId }
          : input.boardExternalId  !== undefined && { boardExternalId:  input.boardExternalId  }),
        ...(input.classExternalId !== undefined
          ? { classExternalId:  input.classExternalId }
          : inheritedClassId !== undefined && { classExternalId: inheritedClassId }),
        ...(inheritedSeriesId !== undefined
          ? { seriesExternalId: inheritedSeriesId }
          : input.seriesExternalId !== undefined && { seriesExternalId: input.seriesExternalId }),
      } as Prisma.StudentProfileUncheckedUpdateInput;

      const sp = await prisma.studentProfile.upsert({
        where: { userId },
        create: { userId, ...studentFields } as Prisma.StudentProfileUncheckedCreateInput,
        update: studentFields,
      });

      const bookIds = inheritedBookIds !== undefined ? inheritedBookIds : input.bookExternalIds;
      if (bookIds !== undefined) {
        await prisma.studentBook.deleteMany({ where: { studentProfileId: sp.id } });
        if (bookIds.length)
          await prisma.studentBook.createMany({ data: bookIds.map(bookExternalId => ({ studentProfileId: sp.id, bookExternalId })), skipDuplicates: true });
      }

      // Student ↔ Subjects (many-to-many), stored as Content API external ids.
      // Only real subjects can be selected — Olympiad "modes" are app-owned and
      // are never studied subjects. When the API is configured we keep only the
      // external ids that resolve to a real live subject.
      if (input.subjectExternalIds !== undefined) {
        await prisma.studentSubject.deleteMany({ where: { studentProfileId: sp.id } });
        if (input.subjectExternalIds.length) {
          let valid = input.subjectExternalIds;
          if (ContentService.isConfigured()) {
            const subjectMap = await ContentMeta.subjects();
            valid = input.subjectExternalIds.filter(id => subjectMap.has(String(id)));
          }
          if (valid.length)
            await prisma.studentSubject.createMany({ data: valid.map(subjectExternalId => ({ studentProfileId: sp.id, subjectExternalId })), skipDuplicates: true });
        }
      }
    }

    return toPublicUser(updatedUser);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User not found');

    const ok = await comparePassword(input.currentPassword, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Current password is incorrect');

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  },

  async listTeachers(query: ListProfilesQuery) {
    const { page, limit, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const where: Prisma.UserWhereInput = {
      role: Role.TEACHER,
      ...(status && { status }),
      ...searchFilter(search),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: {
          teacherProfile: { select: { schoolName: true, bio: true } },
          _count: { select: { createdAssessments: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items = rows.map(u => ({
      id:          u.id,
      name:        u.name,
      email:       u.email,
      schoolName:  u.teacherProfile?.schoolName ?? null,
      bio:         u.teacherProfile?.bio ?? null,
      assessments: u._count.createdAssessments,
      students:    0,
      status:      u.status,
      joinedAt:    u.createdAt,
      avatarHue:   u.avatarHue,
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },

  async listStudents(query: ListProfilesQuery) {
    const { page, limit, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const where: Prisma.UserWhereInput = {
      role: Role.STUDENT,
      ...(status && { status }),
      ...searchFilter(search),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: {
          studentProfile: { select: { schoolName: true, teacherCode: true } },
          _count: { select: { submissions: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const ids = rows.map(r => r.id);
    const graded: Prisma.SubmissionWhereInput = { status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] } };
    const [aggs, allTotals] = ids.length
      ? await Promise.all([
          prisma.submission.groupBy({
            by: ['studentId'],
            where: { studentId: { in: ids }, ...graded },
            _sum: { score: true, totalMarks: true },
          }),
          prisma.submission.groupBy({
            by: ['studentId'],
            where: graded,
            _sum: { score: true },
            orderBy: { _sum: { score: 'desc' } },
          }),
        ])
      : [[], []];

    const aggById  = new Map(aggs.map(a => [a.studentId, a]));
    const rankById = new Map(allTotals.map((r, i) => [r.studentId, i + 1]));

    const items = rows.map(u => {
      const agg      = aggById.get(u.id);
      const score    = agg?._sum?.score ?? 0;
      const total    = agg?._sum?.totalMarks ?? 0;
      const avgScore = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
      return {
        id:          u.id,
        name:        u.name,
        email:       u.email,
        schoolName:  u.studentProfile?.schoolName  ?? null,
        teacherCode: u.studentProfile?.teacherCode ?? null,
        attempted:   u._count.submissions,
        avgScore,
        rank:        rankById.get(u.id) ?? 0,
        status:      u.status,
        joinedAt:    u.createdAt,
        avatarHue:   u.avatarHue,
      };
    });

    return { items, meta: pageMeta(total, page, limit) };
  },
};
