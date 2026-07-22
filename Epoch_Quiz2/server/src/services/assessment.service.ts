import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AssessmentStatus, Role } from '../lib/enums';
import { isAdminRole } from '../utils/roles';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { ContentService, ContentMeta } from './content.service';
import { SettingsService } from './settings.service';
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
  createdBy: { select: { id: true, name: true, email: true } },
  _count:    { select: { questions: true, submissions: true } },
} satisfies Prisma.AssessmentInclude;

type AssessmentWithRel = Prisma.AssessmentGetPayload<{ include: typeof assessmentInclude }>;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

/**
 * A submission's results are withheld from the owning student until the
 * admin either flips resultsPublished on, or the configured resultPublishAt
 * date arrives — whichever happens first. Admin/teacher views are never
 * gated by this; only used for the student-facing result shape.
 */
export function isResultVisible(a: { resultsPublished: boolean; resultPublishAt: Date | null }): boolean {
  if (a.resultsPublished) return true;
  if (a.resultPublishAt && Date.now() >= a.resultPublishAt.getTime()) return true;
  return false;
}

function toPublic(a: AssessmentWithRel, subjectNames?: Map<string, string>) {
  const subjectName = a.subjectExternalId ? subjectNames?.get(a.subjectExternalId) ?? null : null;
  return {
    id:            a.id,
    title:         a.title,
    description:   a.description,
    instructions:  a.instructions,
    duration:      a.duration,
    totalMarks:    a.totalMarks,
    passingMarks:  a.passingMarks,
    negativeMarking:    a.negativeMarking,
    negativeMarksValue: a.negativeMarksValue,
    status:        a.status,
    publishedAt:   a.publishedAt,
    resultsPublished: a.resultsPublished,
    resultPublishAt:  a.resultPublishAt,
    resultsVisible:   isResultVisible(a),
    subject:       a.subjectExternalId
      ? { id: a.subjectExternalId, name: subjectName, slug: slugify(subjectName ?? '') || null }
      : null,
    createdBy:     { id: a.createdBy.id, name: a.createdBy.name, email: a.createdBy.email },
    questionCount: a._count.questions,
    attempts:      a._count.submissions,
    createdAt:     a.createdAt,
    updatedAt:     a.updatedAt,
  };
}

/** Validate a subject external id against the live catalog (skip if API off). */
async function ensureSubjectExists(subjectExternalId: string): Promise<void> {
  if (!ContentService.isConfigured()) return;
  if (!(await ContentMeta.subjectExists(subjectExternalId))) throw ApiError.badRequest(`Subject not found: ${subjectExternalId}`);
}

async function ensureClassExists(classExternalId: string): Promise<void> {
  if (!ContentService.isConfigured()) return;
  if (!(await ContentMeta.classExists(classExternalId))) throw ApiError.badRequest(`Class not found: ${classExternalId}`);
}

/** A student's own class external id (null if the profile has none yet). */
async function getStudentClassId(studentId: string): Promise<string | null> {
  const row = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { classExternalId: true } });
  return row?.classExternalId ?? null;
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
  const byClass = await prisma.assessmentAssignedClass.count({ where: { assessmentId, classExternalId: classId } });
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
    if (unique.length && ContentService.isConfigured()) {
      // Validate class external ids against the live catalog.
      const classMap = await ContentMeta.classes();
      const missing = unique.find(id => !classMap.has(String(id)));
      if (missing) throw ApiError.badRequest(`Class not found: ${missing}`);
    }
    await txc.assessmentAssignedClass.deleteMany({ where: { assessmentId } });
    if (unique.length)
      await txc.assessmentAssignedClass.createMany({ data: unique.map(classExternalId => ({ assessmentId, classExternalId })), skipDuplicates: true });
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
    if (input.subjectExternalId) await ensureSubjectExists(input.subjectExternalId);
    if (input.classExternalId)   await ensureClassExists(input.classExternalId);

    const duration = input.duration ?? (Number(await SettingsService.get('assessment.defaultDuration')) || 30);

    const created = await prisma.$transaction(async (txc) => {
      const a = await txc.assessment.create({
        data: {
          title:             input.title,
          description:       input.description ?? null,
          instructions:      input.instructions ?? null,
          duration,
          totalMarks:        0,
          passingMarks:      input.passingMarks ?? 0,
          negativeMarking:    input.negativeMarking ?? false,
          negativeMarksValue: input.negativeMarksValue ?? 0,
          status:            AssessmentStatus.DRAFT,
          resultsPublished:  input.resultsPublished ?? false,
          resultPublishAt:   input.resultPublishAt ?? null,
          subjectExternalId: input.subjectExternalId ?? null,
          classExternalId:   input.classExternalId ?? null,
          createdById:       actor.id,
        },
      });
      if (input.assignedClassIds !== undefined || input.assignedStudentIds !== undefined) {
        await writeAssignments(txc, a.id, input.assignedClassIds, input.assignedStudentIds);
      }
      return a;
    });

    const full = await prisma.assessment.findUnique({ where: { id: created.id }, include: assessmentInclude });
    return toPublic(full!, await ContentMeta.subjects());
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
    const [assignedClasses, students, classMap] = await Promise.all([
      prisma.assessmentAssignedClass.findMany({ where: { assessmentId: id }, select: { classExternalId: true } }),
      prisma.user.findMany({
        where: { assessmentAssignedStudents: { some: { assessmentId: id } } },
        select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
      }),
      ContentMeta.classes(),
    ]);
    const classes = assignedClasses
      .map(c => ({ id: c.classExternalId, name: classMap.get(String(c.classExternalId)) ?? c.classExternalId }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { classes, students };
  },

  async list(actor: Actor, query: ListAssessmentsQuery) {
    const { page, limit, status, search, mine } = query;
    const subjectExternalId = (query as Record<string, unknown>).subjectExternalId as string | undefined;

    const where: Prisma.AssessmentWhereInput = {
      ...(status && { status }),
      ...(subjectExternalId && { subjectExternalId }),
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
          ...(classId ? [{ assignedClasses: { some: { classExternalId: classId } } }] : []),
        ],
      });
    } else if (isAdminRole(actor.role) && mine) {
      where.createdById = actor.id;
    }
    if (and.length) where.AND = and;

    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total, subjectNames] = await Promise.all([
      prisma.assessment.findMany({ where, include: assessmentInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.assessment.count({ where }),
      ContentMeta.subjects(),
    ]);

    return { items: rows.map((r) => toPublic(r, subjectNames)), meta: pageMeta(total, page, limit) };
  },

  async findById(actor: Actor, id: string) {
    const a = await loadAuthorized(id, actor, 'read');
    return toPublic(a, await ContentMeta.subjects());
  },

  async update(actor: Actor, id: string, input: UpdateAssessmentInput) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.ARCHIVED) {
      throw ApiError.badRequest('Archived assessments cannot be edited');
    }
    if (input.subjectExternalId) await ensureSubjectExists(input.subjectExternalId);

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        ...(input.title             !== undefined && { title: input.title }),
        ...(input.description       !== undefined && { description: input.description }),
        ...(input.instructions      !== undefined && { instructions: input.instructions }),
        ...(input.duration          !== undefined && { duration: input.duration }),
        ...(input.subjectExternalId !== undefined && { subjectExternalId: input.subjectExternalId }),
        ...(input.passingMarks      !== undefined && { passingMarks: input.passingMarks }),
        ...(input.negativeMarking      !== undefined && { negativeMarking: input.negativeMarking }),
        ...(input.negativeMarksValue   !== undefined && { negativeMarksValue: input.negativeMarksValue }),
        ...(input.resultsPublished  !== undefined && { resultsPublished: input.resultsPublished }),
        ...(input.resultPublishAt  !== undefined && { resultPublishAt: input.resultPublishAt }),
      },
      include: assessmentInclude,
    });
    return toPublic(updated, await ContentMeta.subjects());
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
    return toPublic(updated, await ContentMeta.subjects());
  },

  async unpublish(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status !== AssessmentStatus.PUBLISHED) throw ApiError.badRequest('Only published assessments can be unpublished');
    const updated = await prisma.assessment.update({
      where: { id }, data: { status: AssessmentStatus.DRAFT, publishedAt: null }, include: assessmentInclude,
    });
    return toPublic(updated, await ContentMeta.subjects());
  },

  async archive(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.ARCHIVED) throw ApiError.badRequest('Assessment is already archived');
    const updated = await prisma.assessment.update({
      where: { id }, data: { status: AssessmentStatus.ARCHIVED, publishedAt: null }, include: assessmentInclude,
    });
    return toPublic(updated, await ContentMeta.subjects());
  },

  async publishResults(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.resultsPublished) throw ApiError.badRequest('Results are already published');
    const updated = await prisma.assessment.update({
      where: { id }, data: { resultsPublished: true }, include: assessmentInclude,
    });
    return toPublic(updated, await ContentMeta.subjects());
  },

  async unpublishResults(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (!existing.resultsPublished) throw ApiError.badRequest('Results are not published');
    const updated = await prisma.assessment.update({
      where: { id }, data: { resultsPublished: false }, include: assessmentInclude,
    });
    return toPublic(updated, await ContentMeta.subjects());
  },
};
