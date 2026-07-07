import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AssessmentStatus, Role } from '../lib/enums';
import { isAdminRole } from '../utils/roles';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  ListAssessmentsQuery,
  AssignAssessmentInput,
} from '../validators/assessment.validator';

export interface Actor {
  id: string;
  role: Role;
}

// ── Query shape ───────────────────────────────────────────────

const assessmentInclude = {
  subject:   { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  _count:    { select: { questions: true, submissions: true } },
} satisfies Prisma.AssessmentInclude;

type AssessmentWithRel = Prisma.AssessmentGetPayload<{ include: typeof assessmentInclude }>;

function toPublic(a: AssessmentWithRel) {
  return {
    id:            a.id,
    title:         a.title,
    description:   a.description,
    duration:      a.duration,
    totalMarks:    a.totalMarks,
    passingMarks:  a.passingMarks,
    status:        a.status,
    publishedAt:   a.publishedAt,
    subject:       a.subject ? { id: a.subject.id, name: a.subject.name, slug: a.subject.slug } : null,
    createdBy:     { id: a.createdBy.id, name: a.createdBy.name, email: a.createdBy.email },
    questionCount: a._count.questions,
    attempts:      a._count.submissions,
    createdAt:     a.createdAt,
    updatedAt:     a.updatedAt,
  };
}

async function ensureSubjectExists(subjectId: string): Promise<void> {
  const s = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!s) throw ApiError.badRequest(`Subject not found: ${subjectId}`);
}

async function ensureClassExists(classId: string): Promise<void> {
  const c = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
  if (!c) throw ApiError.badRequest(`Class not found: ${classId}`);
}

/** A student's own class (null if the profile has none yet). */
async function getStudentClassId(studentId: string): Promise<string | null> {
  const row = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { classId: true } });
  return row?.classId ?? null;
}

/**
 * A published assessment is visible to a student only when it is assigned to
 * them directly, or to a class they belong to. Unassigned/unpublished ones
 * are invisible — students never see the whole published catalogue.
 */
export async function assessmentVisibleToStudent(studentId: string, assessmentId: string): Promise<boolean> {
  const direct = await prisma.assessmentAssignedStudent.count({ where: { assessmentId, studentId } });
  if (direct > 0) return true;

  const classId = await getStudentClassId(studentId);
  if (!classId) return false;
  const byClass = await prisma.assessmentAssignedClass.count({ where: { assessmentId, classId } });
  return byClass > 0;
}

/**
 * Replace-set the assignment rows for an assessment. Only the dimensions passed
 * are touched (classIds and/or studentIds). Validates every id first.
 */
async function writeAssignments(
  txc: Prisma.TransactionClient,
  assessmentId: string,
  classIds?: string[],
  studentIds?: string[],
): Promise<void> {
  if (classIds !== undefined) {
    const unique = [...new Set(classIds)];
    if (unique.length) {
      const found = await txc.class.findMany({ where: { id: { in: unique } }, select: { id: true } });
      const foundSet = new Set(found.map(r => r.id));
      const missing = unique.find(id => !foundSet.has(id));
      if (missing) throw ApiError.badRequest(`Class not found: ${missing}`);
    }
    await txc.assessmentAssignedClass.deleteMany({ where: { assessmentId } });
    if (unique.length)
      await txc.assessmentAssignedClass.createMany({ data: unique.map(classId => ({ assessmentId, classId })), skipDuplicates: true });
  }

  if (studentIds !== undefined) {
    const unique = [...new Set(studentIds)];
    if (unique.length) {
      const found = await txc.user.findMany({ where: { id: { in: unique }, role: Role.STUDENT }, select: { id: true } });
      const foundSet = new Set(found.map(r => r.id));
      const missing = unique.find(id => !foundSet.has(id));
      if (missing) throw ApiError.badRequest(`Student not found: ${missing}`);
    }
    await txc.assessmentAssignedStudent.deleteMany({ where: { assessmentId } });
    if (unique.length)
      await txc.assessmentAssignedStudent.createMany({ data: unique.map(studentId => ({ assessmentId, studentId })), skipDuplicates: true });
  }
}

async function loadAuthorized(id: string, actor: Actor, mode: 'read' | 'write'): Promise<AssessmentWithRel> {
  const a = await prisma.assessment.findUnique({ where: { id }, include: assessmentInclude });
  if (!a) throw ApiError.notFound('Assessment not found');

  if (isAdminRole(actor.role)) return a;

  if (actor.role === Role.TEACHER) {
    if (a.createdById !== actor.id) throw ApiError.forbidden('You can only access assessments you created');
    return a;
  }

  // STUDENT
  if (mode === 'write') throw ApiError.forbidden('Students cannot modify assessments');
  if (a.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
  if (!(await assessmentVisibleToStudent(actor.id, id))) throw ApiError.notFound('Assessment not found');
  return a;
}

// ── service ───────────────────────────────────────────────────

export const AssessmentService = {
  async create(actor: Actor, input: CreateAssessmentInput) {
    if (actor.role !== Role.TEACHER && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can create assessments');
    }
    if (input.subjectId) await ensureSubjectExists(input.subjectId);
    if (input.classId)   await ensureClassExists(input.classId);

    const created = await prisma.$transaction(async (txc) => {
      const a = await txc.assessment.create({
        data: {
          title:        input.title,
          description:  input.description ?? null,
          duration:     input.duration,
          totalMarks:   0,
          passingMarks: input.passingMarks ?? 0,
          status:       AssessmentStatus.DRAFT,
          subjectId:    input.subjectId ?? null,
          classId:      input.classId ?? null,
          createdById:  actor.id,
        },
      });
      if (input.assignedClassIds !== undefined || input.assignedStudentIds !== undefined) {
        await writeAssignments(txc, a.id, input.assignedClassIds, input.assignedStudentIds);
      }
      return a;
    });

    const full = await prisma.assessment.findUnique({ where: { id: created.id }, include: assessmentInclude });
    return toPublic(full!);
  },

  /** Replace-set the class/student assignment for an assessment (owner/admin only). */
  async assign(actor: Actor, id: string, input: AssignAssessmentInput) {
    await loadAuthorized(id, actor, 'write');
    await prisma.$transaction(async (txc) => {
      await writeAssignments(txc, id, input.classIds, input.studentIds);
    });
    return this.getAssignments(actor, id);
  },

  /** Current assignment (assigned classes + students) for teacher/admin UI. */
  async getAssignments(actor: Actor, id: string) {
    await loadAuthorized(id, actor, 'write');
    const [classes, students] = await Promise.all([
      prisma.class.findMany({
        where: { assessmentAssignedClasses: { some: { assessmentId: id } } },
        select: { id: true, name: true }, orderBy: [{ serial: 'asc' }, { name: 'asc' }],
      }),
      prisma.user.findMany({
        where: { assessmentAssignedStudents: { some: { assessmentId: id } } },
        select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
      }),
    ]);
    return { classes, students };
  },

  async list(actor: Actor, query: ListAssessmentsQuery) {
    const { page, limit, status, subjectId, search, mine } = query;

    const where: Prisma.AssessmentWhereInput = {
      ...(status && { status }),
      ...(subjectId && { subjectId }),
    };
    const and: Prisma.AssessmentWhereInput[] = [];
    if (search) and.push({ OR: [{ title: { contains: search } }, { description: { contains: search } }] });

    if (actor.role === Role.TEACHER) {
      where.createdById = actor.id;
    } else if (actor.role === Role.STUDENT) {
      // Students only see PUBLISHED assessments assigned to them (directly or via their class).
      const classId = await getStudentClassId(actor.id);
      where.status = AssessmentStatus.PUBLISHED;
      and.push({
        OR: [
          { assignedStudents: { some: { studentId: actor.id } } },
          ...(classId ? [{ assignedClasses: { some: { classId } } }] : []),
        ],
      });
    } else if (isAdminRole(actor.role) && mine) {
      where.createdById = actor.id;
    }
    if (and.length) where.AND = and;

    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total] = await Promise.all([
      prisma.assessment.findMany({ where, include: assessmentInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.assessment.count({ where }),
    ]);

    return { items: rows.map(toPublic), meta: pageMeta(total, page, limit) };
  },

  async findById(actor: Actor, id: string) {
    const a = await loadAuthorized(id, actor, 'read');
    return toPublic(a);
  },

  async update(actor: Actor, id: string, input: UpdateAssessmentInput) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.ARCHIVED) {
      throw ApiError.badRequest('Archived assessments cannot be edited');
    }
    if (input.subjectId) await ensureSubjectExists(input.subjectId);

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        ...(input.title        !== undefined && { title: input.title }),
        ...(input.description  !== undefined && { description: input.description }),
        ...(input.duration     !== undefined && { duration: input.duration }),
        ...(input.subjectId    !== undefined && { subjectId: input.subjectId }),
        ...(input.passingMarks !== undefined && { passingMarks: input.passingMarks }),
      },
      include: assessmentInclude,
    });
    return toPublic(updated);
  },

  async remove(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing._count.submissions > 0) {
      throw ApiError.conflict('Cannot delete an assessment that has student submissions; archive it instead');
    }
    await prisma.assessment.delete({ where: { id } });
  },

  async publish(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.PUBLISHED) throw ApiError.badRequest('Assessment is already published');
    if (existing.status === AssessmentStatus.ARCHIVED)  throw ApiError.badRequest('Archived assessments cannot be published — unarchive first');
    if (existing._count.questions === 0)                throw ApiError.badRequest('Cannot publish an assessment with no questions');

    const updated = await prisma.assessment.update({
      where: { id }, data: { status: AssessmentStatus.PUBLISHED, publishedAt: new Date() }, include: assessmentInclude,
    });
    return toPublic(updated);
  },

  async unpublish(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status !== AssessmentStatus.PUBLISHED) throw ApiError.badRequest('Only published assessments can be unpublished');
    const updated = await prisma.assessment.update({
      where: { id }, data: { status: AssessmentStatus.DRAFT, publishedAt: null }, include: assessmentInclude,
    });
    return toPublic(updated);
  },

  async archive(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.ARCHIVED) throw ApiError.badRequest('Assessment is already archived');
    const updated = await prisma.assessment.update({
      where: { id }, data: { status: AssessmentStatus.ARCHIVED, publishedAt: null }, include: assessmentInclude,
    });
    return toPublic(updated);
  },
};
