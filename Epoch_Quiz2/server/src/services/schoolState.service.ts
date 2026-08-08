import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import type {
  AdminCreateSchoolStateInput,
  AdminUpdateSchoolStateInput,
} from '../validators/school.validator';

export interface SchoolStateRow {
  id:        string;
  name:      string;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolStateService = {
  /**
   * With no `schoolId`: the full admin-managed catalog (used to populate a
   * School's Branch when an admin creates one). With `schoolId`: only the
   * states that School actually has an (active) Branch in — this is what
   * drives the registration form's School -> State cascade.
   */
  async list(schoolId?: string, includeInactive = false): Promise<SchoolStateRow[]> {
    if (!schoolId) {
      return prisma.schoolState.findMany({
        where:   includeInactive ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    return prisma.schoolState.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        branches: { some: { schoolId, ...(includeInactive ? {} : { isActive: true }) } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(input: AdminCreateSchoolStateInput): Promise<SchoolStateRow> {
    const existing = await prisma.schoolState.findUnique({ where: { name: input.name }, select: { id: true } });
    if (existing) throw ApiError.conflict('A state with this name already exists');

    return prisma.schoolState.create({
      data: { name: input.name, isActive: input.isActive ?? true },
    });
  },

  async update(id: string, input: AdminUpdateSchoolStateInput): Promise<SchoolStateRow> {
    const state = await prisma.schoolState.findUnique({ where: { id } });
    if (!state) throw ApiError.notFound('State not found');

    if (input.name && input.name !== state.name) {
      const taken = await prisma.schoolState.findUnique({ where: { name: input.name }, select: { id: true } });
      if (taken) throw ApiError.conflict('A state with this name already exists');
    }

    return prisma.schoolState.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  },

  async deactivate(id: string): Promise<SchoolStateRow> {
    const state = await prisma.schoolState.findUnique({ where: { id } });
    if (!state) throw ApiError.notFound('State not found');
    return prisma.schoolState.update({ where: { id }, data: { isActive: false } });
  },
};
