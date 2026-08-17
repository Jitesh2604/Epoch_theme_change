import { Prisma } from '@prisma/client';
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

  /**
   * Find the School catalog row matching `name` exactly, or create it.
   * Registration no longer picks a school from a dropdown (see
   * SchoolRegisterPage.tsx — the field is now free text), so this is the
   * seam that keeps the Admin panel's School catalog (SchoolService.list/
   * create/update/deactivate, unchanged above) as the real source of truth:
   * a typed name that already exists in the catalog reuses that exact row;
   * a genuinely new name gets added to the same catalog, active by default,
   * same as an admin creating one directly via SchoolService.create.
   */
  async findOrCreateSchoolByName(name: string) {
    const trimmed = name.trim();
    let school = await prisma.school.findUnique({ where: { name: trimmed } });
    if (!school) {
      try {
        school = await prisma.school.create({ data: { name: trimmed, isActive: true } });
      } catch (err) {
        // Race: a concurrent registration created the same name a moment
        // ago (School.name is @unique) — re-fetch instead of failing.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          school = await prisma.school.findUnique({ where: { name: trimmed } });
        }
        if (!school) throw err;
      }
    }
    return school;
  },

  // ── Public self-registration ─────────────────────────────────────────────
  // Mirrors AuthService.register's shape (uniqueness checks, hashPassword,
  // avatarHue) but is intentionally a separate code path: School accounts
  // skip the STUDENT-only email-OTP flow entirely and are created PENDING,
  // gated instead on an admin flipping status to ACTIVE via the existing
  // admin user endpoints (PATCH /users/:id) — see auth.service.ts's login()
  // for the role-aware PENDING message.
  async register(input: SchoolRegisterInput): Promise<{ email: string }> {
    const [existingEmail, existingMobile, state] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { mobileNo: input.mobileNo }, select: { id: true } }),
      prisma.schoolState.findUnique({ where: { id: input.stateId } }),
    ]);

    if (existingEmail) throw ApiError.conflict('Email is already registered');
    if (existingMobile) throw ApiError.conflict('Mobile number is already registered');
    if (!state || !state.isActive) throw ApiError.badRequest('Select a valid state');

    const school = await this.findOrCreateSchoolByName(input.schoolName);
    if (!school.isActive) throw ApiError.badRequest('This school is not currently active — contact an administrator.');

    // No branch is selected or created here anymore — branchId stays null
    // until the School Admin creates their own branch(es) later from the
    // School Panel (see branchCode.service.ts's createBranch()).
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
            schoolId:          school.id,
            stateId:           state.id,
            // branchId intentionally omitted — nullable, unset until the
            // School Admin creates a branch themselves.
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
