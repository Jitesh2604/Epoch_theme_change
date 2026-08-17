import { randomInt } from 'crypto';
import { prisma } from '../lib/prisma';
import { Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { SchoolBranchService } from './schoolBranch.service';
import type { Actor } from './assessment.service';
import type { CreateOwnBranchInput } from '../validators/branchCode.validator';

/** A School Admin's own school, resolved from their SchoolRegistration row
 *  (one per SCHOOL_ADMIN user) — every branch/code operation is scoped to
 *  this, never to a school named in the request, so an admin can only ever
 *  see/touch their own school's branches. Isolation is at the SCHOOL level
 *  (an admin manages every branch of their school, not just the one branch
 *  they personally registered under). */
async function requireAdminSchool(actor: Actor): Promise<string> {
  if (actor.role !== Role.SCHOOL_ADMIN) throw ApiError.forbidden('Only School Admins manage branch codes');
  const reg = await prisma.schoolRegistration.findUnique({ where: { userId: actor.id }, select: { schoolId: true } });
  if (!reg) throw ApiError.forbidden('No school registration found for this account');
  return reg.schoolId;
}

/** Short, readable-ish code from the school+branch initials plus 4 random
 *  digits (e.g. "DPS-RH-4829") — retried on the rare unique collision.
 *  Not a security-sensitive secret generator (this isn't a password), so
 *  crypto.randomInt is used for a good-quality, dependency-free source,
 *  not because collision-resistance needs to be cryptographic. */
function initials(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const letters = words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters || 'SCH').slice(0, 4);
}

async function generateUniqueCode(schoolName: string, branchName: string): Promise<string> {
  const prefix = `${initials(schoolName)}-${initials(branchName)}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = String(randomInt(1000, 10000));
    const code = `${prefix}-${suffix}`;
    const existing = await prisma.branchCode.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw ApiError.internal('Could not generate a unique branch code — please try again');
}

function toBranchRow(b: {
  id: string; name: string; city: string | null; address: string | null;
  isActive: boolean; createdAt: Date; updatedAt: Date;
  branchCodes: { id: string; code: string; isActive: boolean; createdAt: Date }[];
  _count: { studentProfiles: number };
}) {
  const activeCode = b.branchCodes.find(c => c.isActive) ?? null;
  return {
    id: b.id,
    name: b.name,
    city: b.city,
    address: b.address,
    isActive: b.isActive,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    verifiedStudentCount: b._count.studentProfiles,
    activeCode: activeCode ? { id: activeCode.id, code: activeCode.code, createdAt: activeCode.createdAt } : null,
  };
}

export const BranchCodeService = {
  async myBranches(actor: Actor) {
    const schoolId = await requireAdminSchool(actor);
    const branches = await prisma.schoolBranch.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
      include: {
        branchCodes: { where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, code: true, isActive: true, createdAt: true } },
        // "Verified" students, not just "selected this branch" — matches
        // the same distinction Assessment access itself enforces.
        _count: { select: { studentProfiles: { where: { branchVerifiedAt: { not: null } } } } },
      },
    });
    return branches.map(toBranchRow);
  },

  /**
   * Create a new branch for the logged-in School Admin's OWN school —
   * schoolId is never accepted from the request, always resolved from the
   * actor's own SchoolRegistration (requireAdminSchool), so a school admin
   * can never create a branch under another school. Reuses
   * SchoolBranchService.create() (the same uniqueness rule the platform
   * Admin's catalog CRUD already enforces) rather than duplicating it.
   */
  async createBranch(actor: Actor, input: CreateOwnBranchInput) {
    const schoolId = await requireAdminSchool(actor);
    const row = await SchoolBranchService.create({
      schoolId,
      stateId: input.stateId,
      name:    input.name,
      city:    input.city,
      address: input.address,
    });
    return toBranchRow({ ...row, branchCodes: [], _count: { studentProfiles: 0 } });
  },

  async generateCode(actor: Actor, branchId: string) {
    const schoolId = await requireAdminSchool(actor);
    const branch = await prisma.schoolBranch.findUnique({
      where: { id: branchId },
      include: { school: { select: { name: true } } },
    });
    if (!branch || branch.schoolId !== schoolId) throw ApiError.notFound('Branch not found');

    const code = await generateUniqueCode(branch.school.name, branch.name);

    const [, created] = await prisma.$transaction([
      prisma.branchCode.updateMany({ where: { branchId, isActive: true }, data: { isActive: false } }),
      prisma.branchCode.create({ data: { branchId, code } }),
    ]);
    return { id: created.id, code: created.code, isActive: created.isActive, createdAt: created.createdAt };
  },

  async deactivateCode(actor: Actor, codeId: string) {
    const schoolId = await requireAdminSchool(actor);
    const code = await prisma.branchCode.findUnique({ where: { id: codeId }, include: { branch: { select: { schoolId: true } } } });
    if (!code || code.branch.schoolId !== schoolId) throw ApiError.notFound('Branch code not found');
    return prisma.branchCode.update({ where: { id: codeId }, data: { isActive: false } });
  },

  // ── Student-facing ────────────────────────────────────────────────────

  /** Verifies a code against the student's ALREADY-SELECTED school/branch
   *  (from registration) — never assigns school/branch from the code
   *  itself. Checked, in order: a school+branch must be selected; the code
   *  must exist, be active, and belong to an active branch; the code's
   *  branch must match BOTH the selected school and the selected branch
   *  (a Dwarka code can never verify a Rohini selection, even for the same
   *  school). Only on every check passing does branchVerifiedAt get set. */
  async verify(actor: Actor, rawCode: string) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('Only students can verify a branch code');

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: actor.id },
      select: { schoolId: true, branchId: true, branchVerifiedAt: true },
    });
    if (!profile?.schoolId || !profile.branchId) {
      throw ApiError.badRequest('Select your school and branch first.');
    }

    // Already verified for the exact branch currently selected — nothing
    // to do (this can only be reached if the popup somehow still shows;
    // treat as a harmless no-op rather than an error). Changing school/
    // branch elsewhere already clears branchVerifiedAt (see
    // UserService.updateOwnProfile), so a stale/conflicting verification
    // can't exist by construction.
    if (profile.branchVerifiedAt) {
      return { alreadyVerified: true as const };
    }

    const code = rawCode.trim().toUpperCase();
    const branchCode = await prisma.branchCode.findUnique({ where: { code }, include: { branch: true } });
    if (!branchCode || !branchCode.isActive || !branchCode.branch.isActive) {
      throw ApiError.badRequest('Invalid or inactive Branch Code.');
    }
    if (branchCode.branch.schoolId !== profile.schoolId) {
      throw ApiError.badRequest('This code does not belong to your selected school.');
    }
    if (branchCode.branchId !== profile.branchId) {
      throw ApiError.badRequest('This code does not belong to your selected branch.');
    }

    await prisma.studentProfile.update({
      where: { userId: actor.id },
      data: { branchVerifiedAt: new Date() },
    });

    return { alreadyVerified: false as const };
  },

  /** The logged-in student's own school/branch + verification status. */
  async myStatus(actor: Actor) {
    if (actor.role !== Role.STUDENT) return null;
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: actor.id },
      include: { school: { select: { name: true } }, branch: { select: { name: true } } },
    });
    if (!profile?.schoolId || !profile.branchId) return null;
    return {
      schoolName: profile.school?.name ?? null,
      branchName: profile.branch?.name ?? null,
      verified: !!profile.branchVerifiedAt,
      verifiedAt: profile.branchVerifiedAt,
    };
  },

  /** Assessment access gate — never true merely because schoolId/branchId
   *  are set (that's just a registration-time selection); only a real
   *  Branch Code verification counts. */
  async studentIsVerified(userId: string): Promise<boolean> {
    const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { branchVerifiedAt: true } });
    return !!profile?.branchVerifiedAt;
  },
};
