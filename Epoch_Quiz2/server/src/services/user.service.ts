import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Role, UserStatus, SubmissionStatus } from "../lib/enums";
import { ApiError } from "../utils/ApiError";
import { hashPassword, comparePassword } from "../utils/password";
import { pageMeta, pageToSkipTake } from "../utils/pagination";
import { suggestStateBoard } from "../lib/educationBoards";
import { ContentService, ContentMeta, UNKNOWN_CLASS_NAME } from "./content.service";
import { assertMinPasswordLength } from "./settings.service";
import type { DbUser } from "./auth.service";
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  UpdateProfileInput,
  ChangePasswordInput,
  ListUsersQuery,
  ListProfilesQuery,
} from "../validators/user.validator";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarHue: number;
  profileComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  mobileNo?: string | null;
}

function toPublicUser(u: DbUser): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    avatarHue: u.avatarHue,
    profileComplete: Boolean(u.profileComplete),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    mobileNo: u.mobileNo ?? null,
  };
}

// Flattens SchoolRegistration's school/state/branch relations to display
// names — same shape AuthService.getMe returns for a school's own /me call,
// reused here so the admin approvals list and a school's own profile agree.
// branch is nullable — no branch is selected/created at registration time
// anymore, only afterward by the School Admin themselves.
function toSchoolRegistrationView(reg: {
  school: { name: string };
  state:  { name: string };
  branch: { name: string } | null;
  [key: string]: unknown;
}) {
  return { ...reg, schoolName: reg.school.name, stateName: reg.state.name, branchName: reg.branch?.name ?? null };
}

/** Build a case-insensitive name/email search filter. */
function searchFilter(search?: string): Prisma.UserWhereInput {
  return search
    ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
    : {};
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
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          studentProfile: true,
          schoolRegistration: { include: { school: true, state: true, branch: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items = users.map((u) => ({
      ...toPublicUser(u),
      ...(u.studentProfile ? { studentProfile: u.studentProfile } : {}),
      ...(u.schoolRegistration ? { schoolRegistration: toSchoolRegistrationView(u.schoolRegistration) } : {}),
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },

  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        schoolRegistration: { include: { school: true, state: true, branch: true } },
      },
    });
    if (!user) throw ApiError.notFound("User not found");

    return {
      ...toPublicUser(user),
      ...(user.studentProfile ? { studentProfile: user.studentProfile } : {}),
      ...(user.schoolRegistration ? { schoolRegistration: toSchoolRegistrationView(user.schoolRegistration) } : {}),
    };
  },

  async create(input: AdminCreateUserInput): Promise<PublicUser> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict("Email is already registered");

    await assertMinPasswordLength(input.password);

    const passwordHash = await hashPassword(input.password);
    const avatarHue = input.avatarHue ?? Math.floor(Math.random() * 360);
    const userStatus = input.status ?? UserStatus.ACTIVE;

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role,
        status: userStatus,
        avatarHue,
        profileComplete: false,
        ...(input.role === Role.STUDENT
          ? {
              studentProfile: {
                create: { schoolName: input.schoolName ?? null },
              },
            }
          : {}),
      },
    });

    return toPublicUser(user);
  },

  async update(id: string, input: AdminUpdateUserInput): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw ApiError.notFound("User not found");

    if (input.email && input.email !== user.email) {
      const taken = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (taken) throw ApiError.conflict("Email is already in use");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.avatarHue !== undefined && { avatarHue: input.avatarHue }),
      },
    });

    if (
      user.role === Role.STUDENT &&
      input.schoolName !== undefined
    ) {
      const fields = {
        ...(input.schoolName !== undefined && {
          schoolName: input.schoolName ?? null,
        }),
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
    if (!user) throw ApiError.notFound("User not found");

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { status: UserStatus.INACTIVE },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return toPublicUser(updated);
  },

  async updateOwnProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User not found");

    // 1. Update user scalars (profile is always marked complete here).
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        profileComplete: true,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.avatarHue !== undefined && { avatarHue: input.avatarHue }),
      },
    });

    const dob =
      input.dob !== undefined
        ? input.dob
          ? new Date(input.dob + "T00:00:00.000Z")
          : null
        : undefined;

    const existingState = input.state !== undefined ? input.state : null;
    const boardFields: Record<string, unknown> = {};
    if (input.educationBoard !== undefined) {
      boardFields.educationBoard = input.educationBoard;
      boardFields.stateBoard =
        input.educationBoard === "STATE_BOARD"
          ? input.stateBoard?.trim() || suggestStateBoard(existingState) || null
          : null;
    } else if (input.stateBoard !== undefined) {
      boardFields.stateBoard = input.stateBoard?.trim() || null;
    }

    // School-catalog selection (School/SchoolBranch) — validated for real
    // existence + the branch actually belonging to the chosen school (same
    // integrity check SchoolService.register does), then schoolName is
    // derived from the canonical School.name so LeaderboardService's
    // exact-string school-scope match stays consistent across every student
    // who picks the same catalog school.
    let schoolCatalogFields: Record<string, unknown> = {};
    if (input.schoolId !== undefined || input.branchId !== undefined) {
      const existing = await prisma.studentProfile.findUnique({
        where: { userId }, select: { schoolId: true, branchId: true, branchVerifiedAt: true },
      });

      let resolvedSchoolId: string | null = existing?.schoolId ?? null;
      let resolvedBranchId: string | null = existing?.branchId ?? null;

      if (input.schoolId !== undefined) {
        if (input.schoolId === null) {
          resolvedSchoolId = null;
          resolvedBranchId = null;
        } else {
          const school = await prisma.school.findUnique({ where: { id: input.schoolId } });
          if (!school || !school.isActive) throw ApiError.badRequest("Select a valid school");
          resolvedSchoolId = school.id;
          resolvedBranchId = null; // a new school always clears any previously chosen branch

          if (input.branchId) {
            const branch = await prisma.schoolBranch.findUnique({ where: { id: input.branchId } });
            if (!branch || !branch.isActive || branch.schoolId !== school.id) {
              throw ApiError.badRequest("Select a valid branch for the chosen school");
            }
            resolvedBranchId = branch.id;
          }
          schoolCatalogFields.schoolName = school.name;
        }
      } else if (input.branchId !== undefined) {
        if (input.branchId === null) {
          resolvedBranchId = null;
        } else {
          if (!resolvedSchoolId) throw ApiError.badRequest("Select a school before choosing a branch");
          const branch = await prisma.schoolBranch.findUnique({ where: { id: input.branchId } });
          if (!branch || !branch.isActive || branch.schoolId !== resolvedSchoolId) {
            throw ApiError.badRequest("Select a valid branch for the chosen school");
          }
          resolvedBranchId = branch.id;
        }
      }

      schoolCatalogFields.schoolId = resolvedSchoolId;
      schoolCatalogFields.branchId = resolvedBranchId;

      // Changing which school/branch is selected invalidates any existing
      // Branch Code verification — it was only ever proof that the student
      // verified THAT branch, not a general "trust this student" flag. See
      // requireBranchVerification / BranchCodeService.verify.
      const changed = existing && (existing.schoolId !== resolvedSchoolId || existing.branchId !== resolvedBranchId);
      if (changed && existing?.branchVerifiedAt) {
        schoolCatalogFields.branchVerifiedAt = null;
      }
    }

    const sharedFields: Record<string, unknown> = {
      ...(dob !== undefined && { dob }),
      ...(input.schoolName !== undefined && { schoolName: input.schoolName }),
      ...schoolCatalogFields,
      ...(input.address !== undefined && { address: input.address }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.zip !== undefined && { zip: input.zip }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...boardFields,
    };

    if (user.role === Role.STUDENT) {
      const studentFields = {
        ...sharedFields,
        ...(input.boardExternalId !== undefined && {
          boardExternalId: input.boardExternalId,
        }),
        ...(input.classExternalId !== undefined && {
          classExternalId: input.classExternalId,
        }),
        ...(input.seriesExternalId !== undefined && {
          seriesExternalId: input.seriesExternalId,
        }),
      } as Prisma.StudentProfileUncheckedUpdateInput;

      const sp = await prisma.studentProfile.upsert({
        where: { userId },
        create: {
          userId,
          ...studentFields,
        } as Prisma.StudentProfileUncheckedCreateInput,
        update: studentFields,
      });

      const bookIds = input.bookExternalIds;
      if (bookIds !== undefined) {
        await prisma.studentBook.deleteMany({
          where: { studentProfileId: sp.id },
        });
        if (bookIds.length)
          await prisma.studentBook.createMany({
            data: bookIds.map((bookExternalId) => ({
              studentProfileId: sp.id,
              bookExternalId,
            })),
            skipDuplicates: true,
          });
      }

      // Student ↔ Subjects (many-to-many), stored as Content API external ids.
      // Only real subjects can be selected — Olympiad "modes" are app-owned and
      // are never studied subjects. When the API is configured we keep only the
      // external ids that resolve to a real live subject.
      if (input.subjectExternalIds !== undefined) {
        await prisma.studentSubject.deleteMany({
          where: { studentProfileId: sp.id },
        });
        if (input.subjectExternalIds.length) {
          let valid = input.subjectExternalIds;
          if (ContentService.isConfigured()) {
            const subjectMap = await ContentMeta.subjects();
            valid = input.subjectExternalIds.filter((id) =>
              subjectMap.has(String(id)),
            );
          }
          if (valid.length)
            await prisma.studentSubject.createMany({
              data: valid.map((subjectExternalId) => ({
                studentProfileId: sp.id,
                subjectExternalId,
              })),
              skipDuplicates: true,
            });
        }
      }
    }

    return toPublicUser(updatedUser);
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User not found");

    const ok = await comparePassword(input.currentPassword, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Current password is incorrect");

    await assertMinPasswordLength(input.newPassword);

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
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
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          // classExternalId/educationBoard added for Feature A1 (Admin
          // Dashboard)'s "Recent Student Registrations" widget — schoolName
          // was already selected for existing consumers.
          studentProfile: { select: { schoolName: true, classExternalId: true, educationBoard: true } },
          _count: { select: { submissions: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Resolve class external ids to display names from the cached Content
    // API — same resolver every other feature already uses.
    const classNames = await ContentMeta.classes();

    const ids = rows.map((r) => r.id);
    const graded: Prisma.SubmissionWhereInput = {
      status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] },
    };
    const [aggs, allTotals] = ids.length
      ? await Promise.all([
          prisma.submission.groupBy({
            by: ["studentId"],
            where: { studentId: { in: ids }, ...graded },
            _sum: { score: true, totalMarks: true },
          }),
          prisma.submission.groupBy({
            by: ["studentId"],
            where: graded,
            _sum: { score: true },
            orderBy: { _sum: { score: "desc" } },
          }),
        ])
      : [[], []];

    const aggById = new Map(aggs.map((a) => [a.studentId, a]));
    const rankById = new Map(allTotals.map((r, i) => [r.studentId, i + 1]));

    const items = rows.map((u) => {
      const agg = aggById.get(u.id);
      const score = agg?._sum?.score ?? 0;
      const total = agg?._sum?.totalMarks ?? 0;
      const avgScore =
        total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
      const classExternalId = u.studentProfile?.classExternalId ?? null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        schoolName: u.studentProfile?.schoolName ?? null,
        className: classExternalId ? classNames.get(classExternalId) ?? UNKNOWN_CLASS_NAME : null,
        educationBoard: u.studentProfile?.educationBoard ?? null,
        attempted: u._count.submissions,
        avgScore,
        rank: rankById.get(u.id) ?? 0,
        status: u.status,
        joinedAt: u.createdAt,
        avatarHue: u.avatarHue,
      };
    });

    return { items, meta: pageMeta(total, page, limit) };
  },
};
