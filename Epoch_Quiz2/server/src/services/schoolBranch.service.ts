import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import type {
  AdminCreateSchoolBranchInput,
  AdminUpdateSchoolBranchInput,
} from '../validators/school.validator';

export interface SchoolBranchRow {
  id:        string;
  schoolId:  string;
  stateId:   string;
  name:      string;
  isActive:  boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolBranchService = {
  // schoolId is always required — Branch is meaningless without a parent
  // School. stateId narrows further, completing the School -> State ->
  // Branch cascade the registration form walks.
  async list(schoolId: string, stateId?: string, includeInactive = false): Promise<SchoolBranchRow[]> {
    return prisma.schoolBranch.findMany({
      where: {
        schoolId,
        ...(stateId && { stateId }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(input: AdminCreateSchoolBranchInput): Promise<SchoolBranchRow> {
    const [school, state] = await Promise.all([
      prisma.school.findUnique({ where: { id: input.schoolId }, select: { id: true } }),
      prisma.schoolState.findUnique({ where: { id: input.stateId }, select: { id: true } }),
    ]);
    if (!school) throw ApiError.badRequest('Select a valid school');
    if (!state) throw ApiError.badRequest('Select a valid state');

    const existing = await prisma.schoolBranch.findFirst({
      where: { schoolId: input.schoolId, stateId: input.stateId, name: input.name },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict('A branch with this name already exists for this school and state');

    return prisma.schoolBranch.create({
      data: {
        schoolId: input.schoolId,
        stateId:  input.stateId,
        name:     input.name,
        isActive: input.isActive ?? true,
      },
    });
  },

  async update(id: string, input: AdminUpdateSchoolBranchInput): Promise<SchoolBranchRow> {
    const branch = await prisma.schoolBranch.findUnique({ where: { id } });
    if (!branch) throw ApiError.notFound('Branch not found');

    if (input.name && input.name !== branch.name) {
      const taken = await prisma.schoolBranch.findFirst({
        where: { schoolId: branch.schoolId, stateId: branch.stateId, name: input.name },
        select: { id: true },
      });
      if (taken) throw ApiError.conflict('A branch with this name already exists for this school and state');
    }

    return prisma.schoolBranch.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  },

  async deactivate(id: string): Promise<SchoolBranchRow> {
    const branch = await prisma.schoolBranch.findUnique({ where: { id } });
    if (!branch) throw ApiError.notFound('Branch not found');
    return prisma.schoolBranch.update({ where: { id }, data: { isActive: false } });
  },
};
