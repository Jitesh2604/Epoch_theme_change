import { prisma } from '../lib/prisma';
import { Role, UserStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../utils/password';
import { assertMinPasswordLength } from './settings.service';
import type {
  SchoolRegisterInput,
  AdminCreateSchoolInput,
  AdminUpdateSchoolInput,
} from '../validators/school.validator';

export interface SchoolRow {
  id:        string;
  name:      string;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolService = {
  async list(includeInactive = false): Promise<SchoolRow[]> {
    return prisma.school.findMany({
      where:   includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  },

  async create(input: AdminCreateSchoolInput): Promise<SchoolRow> {
    const existing = await prisma.school.findUnique({ where: { name: input.name }, select: { id: true } });
    if (existing) throw ApiError.conflict('A school with this name already exists');

    return prisma.school.create({
      data: { name: input.name, isActive: input.isActive ?? true },
    });
  },

  async update(id: string, input: AdminUpdateSchoolInput): Promise<SchoolRow> {
    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) throw ApiError.notFound('School not found');

    if (input.name && input.name !== school.name) {
      const taken = await prisma.school.findUnique({ where: { name: input.name }, select: { id: true } });
      if (taken) throw ApiError.conflict('A school with this name already exists');
    }

    return prisma.school.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  },

  // Soft delete only — a School has Branches (and Branches may already have
  // approved registrations), so hard-deleting would cascade away data an
  // admin can't easily reconstruct. Deactivating simply removes it from the
  // registration dropdowns (see list()'s isActive filter).
  async deactivate(id: string): Promise<SchoolRow> {
    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) throw ApiError.notFound('School not found');
    return prisma.school.update({ where: { id }, data: { isActive: false } });
  },

  // ── Public self-registration ─────────────────────────────────────────────
  // Mirrors AuthService.register's shape (uniqueness checks, hashPassword,
  // avatarHue) but is intentionally a separate code path: School accounts
  // skip the STUDENT-only email-OTP flow entirely and are created PENDING,
  // gated instead on an admin flipping status to ACTIVE via the existing
  // admin user endpoints (PATCH /users/:id) — see auth.service.ts's login()
  // for the role-aware PENDING message.
  async register(input: SchoolRegisterInput): Promise<{ email: string }> {
    const [existingEmail, existingMobile, school, state, branch] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { mobileNo: input.mobileNo }, select: { id: true } }),
      prisma.school.findUnique({ where: { id: input.schoolId } }),
      prisma.schoolState.findUnique({ where: { id: input.stateId } }),
      prisma.schoolBranch.findUnique({ where: { id: input.branchId } }),
    ]);

    if (existingEmail) throw ApiError.conflict('Email is already registered');
    if (existingMobile) throw ApiError.conflict('Mobile number is already registered');
    if (!school || !school.isActive) throw ApiError.badRequest('Select a valid school');
    if (!state || !state.isActive) throw ApiError.badRequest('Select a valid state');
    if (!branch || !branch.isActive || branch.schoolId !== school.id || branch.stateId !== state.id) {
      throw ApiError.badRequest('Select a valid branch for the chosen school and state');
    }

    await assertMinPasswordLength(input.password);
    const passwordHash = await hashPassword(input.password);
    const avatarHue    = Math.floor(Math.random() * 360);

    const user = await prisma.user.create({
      data: {
        email:           input.email,
        mobileNo:        input.mobileNo,
        passwordHash,
        name:            input.name,
        role:            Role.SCHOOL_ADMIN,
        status:          UserStatus.PENDING,
        avatarHue,
        profileComplete: true,
        schoolRegistration: {
          create: {
            schoolId:          input.schoolId,
            stateId:           input.stateId,
            branchId:          input.branchId,
            contactPersonName: input.contactPersonName,
            contactPhone:      input.contactPhone,
            address:           input.address,
            city:              input.city,
            pincode:           input.pincode,
          },
        },
      },
    });

    return { email: user.email };
  },
};
