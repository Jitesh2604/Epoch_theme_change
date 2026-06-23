import { q, q1, run, newId } from '../lib/db';
import { AssessmentStatus, Role } from '../lib/enums';
import { isAdminRole } from '../utils/roles';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  ListAssessmentsQuery,
} from '../validators/assessment.validator';

export interface Actor {
  id: string;
  role: Role;
}

// ── DB row type ───────────────────────────────────────────────

interface DbAssessment {
  id: string; title: string; description: string | null; duration: number;
  totalMarks: number; passingMarks: number; status: string;
  publishedAt: Date | null; subjectId: string | null; createdById: string;
  createdAt: Date; updatedAt: Date;
  subjectName: string | null; subjectSlug: string | null;
  creatorName: string | null; creatorEmail: string | null;
  questionCount: number; submissionCount: number;
}

const SELECT_ASSESSMENT = `
  SELECT a.id, a.title, a.description, a.duration, a.totalMarks, a.passingMarks,
         a.status, a.publishedAt, a.subjectId, a.createdById, a.createdAt, a.updatedAt,
         s.name AS subjectName, s.slug AS subjectSlug,
         u.name AS creatorName, u.email AS creatorEmail,
         (SELECT COUNT(*) FROM assessment_questions WHERE assessmentId = a.id) AS questionCount,
         (SELECT COUNT(*) FROM submissions WHERE assessmentId = a.id) AS submissionCount
  FROM assessments a
  LEFT JOIN subjects s ON s.id = a.subjectId
  LEFT JOIN users u ON u.id = a.createdById`;

function toPublic(a: DbAssessment) {
  return {
    id:            a.id,
    title:         a.title,
    description:   a.description,
    duration:      a.duration,
    totalMarks:    a.totalMarks,
    passingMarks:  a.passingMarks,
    status:        a.status,
    publishedAt:   a.publishedAt,
    subject:       a.subjectId ? { id: a.subjectId, name: a.subjectName, slug: a.subjectSlug } : null,
    createdBy:     { id: a.createdById, name: a.creatorName, email: a.creatorEmail },
    questionCount: Number(a.questionCount),
    attempts:      Number(a.submissionCount),
    createdAt:     a.createdAt,
    updatedAt:     a.updatedAt,
  };
}

async function ensureSubjectExists(subjectId: string): Promise<void> {
  const s = await q1<{ id: string }>('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!s) throw ApiError.badRequest(`Subject not found: ${subjectId}`);
}

async function loadAuthorized(id: string, actor: Actor, mode: 'read' | 'write'): Promise<DbAssessment> {
  const a = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
  if (!a) throw ApiError.notFound('Assessment not found');

  if (isAdminRole(actor.role)) return a;

  if (actor.role === Role.TEACHER) {
    if (a.createdById !== actor.id) throw ApiError.forbidden('You can only access assessments you created');
    return a;
  }

  // STUDENT
  if (mode === 'write') throw ApiError.forbidden('Students cannot modify assessments');
  if (a.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
  return a;
}

// ── service ───────────────────────────────────────────────────

export const AssessmentService = {
  async create(actor: Actor, input: CreateAssessmentInput) {
    if (actor.role !== Role.TEACHER && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can create assessments');
    }
    if (input.subjectId) await ensureSubjectExists(input.subjectId);

    const id = newId();
    await run(
      `INSERT INTO assessments (id, title, description, duration, totalMarks, passingMarks, status, subjectId, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, ?, 'DRAFT', ?, ?, NOW(), NOW())`,
      [id, input.title, input.description ?? null, input.duration, input.passingMarks ?? 0, input.subjectId ?? null, actor.id],
    );

    const created = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
    return toPublic(created!);
  },

  async list(actor: Actor, query: ListAssessmentsQuery) {
    const { page, limit, status, subjectId, search, mine } = query;
    const conds: string[] = [];
    const params: unknown[] = [];

    if (status)    { conds.push('a.status = ?');    params.push(status); }
    if (subjectId) { conds.push('a.subjectId = ?'); params.push(subjectId); }
    if (search) {
      conds.push('(a.title LIKE ? OR a.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (actor.role === Role.TEACHER) {
      conds.push('a.createdById = ?'); params.push(actor.id);
    } else if (actor.role === Role.STUDENT) {
      conds.push("a.status = 'PUBLISHED'");
    } else if (isAdminRole(actor.role) && mine) {
      conds.push('a.createdById = ?'); params.push(actor.id);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, countRows] = await Promise.all([
      q<DbAssessment>(`${SELECT_ASSESSMENT} ${where} ORDER BY a.createdAt DESC LIMIT ? OFFSET ?`, [...params, take, skip]),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM assessments a ${where}`, params),
    ]);

    return { items: rows.map(toPublic), meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
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

    const sets: string[] = ['updatedAt = NOW()'];
    const params: unknown[] = [];
    if (input.title        !== undefined) { sets.push('title = ?');        params.push(input.title); }
    if (input.description  !== undefined) { sets.push('description = ?');  params.push(input.description); }
    if (input.duration     !== undefined) { sets.push('duration = ?');     params.push(input.duration); }
    if (input.subjectId    !== undefined) { sets.push('subjectId = ?');    params.push(input.subjectId); }
    if (input.passingMarks !== undefined) { sets.push('passingMarks = ?'); params.push(input.passingMarks); }
    params.push(id);

    await run(`UPDATE assessments SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
    return toPublic(updated!);
  },

  async remove(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (Number(existing.submissionCount) > 0) {
      throw ApiError.conflict('Cannot delete an assessment that has student submissions; archive it instead');
    }
    await run('DELETE FROM assessments WHERE id = ?', [id]);
  },

  async publish(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.PUBLISHED) throw ApiError.badRequest('Assessment is already published');
    if (existing.status === AssessmentStatus.ARCHIVED)  throw ApiError.badRequest('Archived assessments cannot be published — unarchive first');
    if (Number(existing.questionCount) === 0)           throw ApiError.badRequest('Cannot publish an assessment with no questions');

    await run("UPDATE assessments SET status = 'PUBLISHED', publishedAt = NOW(), updatedAt = NOW() WHERE id = ?", [id]);
    const updated = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
    return toPublic(updated!);
  },

  async unpublish(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status !== AssessmentStatus.PUBLISHED) throw ApiError.badRequest('Only published assessments can be unpublished');
    await run("UPDATE assessments SET status = 'DRAFT', publishedAt = NULL, updatedAt = NOW() WHERE id = ?", [id]);
    const updated = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
    return toPublic(updated!);
  },

  async archive(actor: Actor, id: string) {
    const existing = await loadAuthorized(id, actor, 'write');
    if (existing.status === AssessmentStatus.ARCHIVED) throw ApiError.badRequest('Assessment is already archived');
    await run("UPDATE assessments SET status = 'ARCHIVED', publishedAt = NULL, updatedAt = NOW() WHERE id = ?", [id]);
    const updated = await q1<DbAssessment>(`${SELECT_ASSESSMENT} WHERE a.id = ?`, [id]);
    return toPublic(updated!);
  },
};
