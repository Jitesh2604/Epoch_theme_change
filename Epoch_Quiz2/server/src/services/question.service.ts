import { q, q1, run, newId, tx, cr, cq, cq1, parseStrArr, parseIntArr, toJson } from '../lib/db';
import { QuestionType, Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type { PoolConnection } from 'mysql2/promise';
import type { Actor } from './assessment.service';
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
  ListQuestionsQuery,
  AttachQuestionsInput,
  UpdateAssessmentQuestionInput,
  ReorderQuestionsInput,
} from '../validators/question.validator';

// ── Types ──────────────────────────────────────────────────────

interface DbQuestion {
  id: string; type: QuestionType; prompt: string; promptImageUrl: string | null;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  optionAImageUrl: string | null; optionBImageUrl: string | null;
  optionCImageUrl: string | null; optionDImageUrl: string | null;
  correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null;
  explanation: string | null; explanationImageUrl: string | null;
  modelAnswer: string | null; matchPairs: string | null; tags: string;
  marks: number; negativeMarks: number; difficulty: string; language: string;
  status: string; subjectId: string | null; classId: string | null;
  chapterId: string | null; bookId: string | null; educationBoard: string | null;
  createdById: string;
  createdAt: Date; updatedAt: Date;
  subjectName: string | null; subjectSlug: string | null;
  creatorName: string | null; creatorEmail: string | null;
}

const SELECT_QUESTION = `
  SELECT q.*, s.name AS subjectName, s.slug AS subjectSlug,
         u.name AS creatorName, u.email AS creatorEmail
  FROM questions q
  LEFT JOIN subjects s ON s.id = q.subjectId
  LEFT JOIN users u ON u.id = q.createdById`;

const IDX_TO_LETTER = ['A', 'B', 'C', 'D'] as const;

interface OptionFields {
  optionA: string | null; optionB: string | null;
  optionC: string | null; optionD: string | null;
}

/**
 * Columns written by an INSERT of a new question, excluding `correctOptions`
 * and `tags`, which are NOT NULL and are supplied separately via the trailing
 * `COALESCE(?, '[]')` columns so they always default to a valid JSON array.
 */
interface QuestionInsertFields {
  id: string;
  type: QuestionType;
  prompt: string;
  marks: number;
  difficulty: string;
  subjectId: string | null;
  classId: string | null;
  chapterId: string | null;
  bookId: string | null;
  educationBoard: string | null;
  createdById: string;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  correctAnswer?: string | null;
  correctBoolean?: number;
  matchPairs?: string;
  modelAnswer?: string | null;
}

function buildOptionFields(options: string[]): OptionFields {
  return {
    optionA: options[0] ?? null, optionB: options[1] ?? null,
    optionC: options[2] ?? null, optionD: options[3] ?? null,
  };
}

function toPublic(row: DbQuestion) {
  const opts = [row.optionA, row.optionB, row.optionC, row.optionD].filter(Boolean) as string[];
  const tags = parseStrArr(row.tags);

  let matchPairs: { left: string; right: string }[] | null = null;
  try { matchPairs = row.matchPairs ? JSON.parse(row.matchPairs) : null; } catch { matchPairs = null; }

  const correctOptions = parseStrArr(row.correctOptions);
  const correctIndices = correctOptions
    .map((o: string) => IDX_TO_LETTER.indexOf(o as typeof IDX_TO_LETTER[number]))
    .filter((i: number) => i >= 0);

  const correctIdx = row.correctAnswer ? IDX_TO_LETTER.indexOf(row.correctAnswer as typeof IDX_TO_LETTER[number]) : -1;

  return {
    id:             row.id,
    type:           row.type,
    prompt:         row.prompt,
    options:        opts.length > 0 ? opts : null,
    correctOption:  correctIdx >= 0 ? correctIdx : null,
    correctOptions: correctIndices,
    correctBoolean: row.correctBoolean,
    correctAnswer:  row.correctAnswer,
    modelAnswer:    row.modelAnswer,
    matchPairs,
    explanation:    row.explanation,
    marks:          row.marks,
    negativeMarks:  row.negativeMarks,
    difficulty:     row.difficulty,
    language:       row.language,
    tags,
    status:         row.status,
    subject:        row.subjectId ? { id: row.subjectId, name: row.subjectName, slug: row.subjectSlug } : null,
    classId:        row.classId,
    chapterId:      row.chapterId,
    bookId:         row.bookId,
    educationBoard: row.educationBoard,
    createdBy:      { id: row.createdById, name: row.creatorName, email: row.creatorEmail },
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
  };
}

// ── helpers ────────────────────────────────────────────────────

async function ensureSubjectExists(subjectId: string): Promise<void> {
  const s = await q1<{ id: string }>('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!s) throw ApiError.badRequest(`Subject not found: ${subjectId}`);
}

async function ensureExists(table: 'classes' | 'chapters' | 'books', id: string, label: string): Promise<void> {
  const r = await q1<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [id]);
  if (!r) throw ApiError.badRequest(`${label} not found: ${id}`);
}

/** Validate any academic FKs supplied on a question payload. */
async function validateAcademicFks(input: { classId?: string | null; chapterId?: string | null; bookId?: string | null }): Promise<void> {
  if (input.classId)   await ensureExists('classes',  input.classId,   'Class');
  if (input.chapterId) await ensureExists('chapters', input.chapterId, 'Chapter');
  if (input.bookId)    await ensureExists('books',    input.bookId,    'Book');
}

async function loadQuestionOwned(id: string, actor: Actor, mode: 'read' | 'write'): Promise<DbQuestion> {
  const row = await q1<DbQuestion>(`${SELECT_QUESTION} WHERE q.id = ?`, [id]);
  if (!row) throw ApiError.notFound('Question not found');
  if (isAdminRole(actor.role)) return row;
  if (actor.role === Role.TEACHER && row.createdById === actor.id) return row;
  if (mode === 'write') throw ApiError.forbidden('You can only modify questions you created');
  throw ApiError.forbidden('You do not have access to this question');
}

async function loadAssessmentForWrite(id: string, actor: Actor) {
  const a = await q1<{ id: string; status: string; createdById: string }>(
    'SELECT id, status, createdById FROM assessments WHERE id = ?', [id],
  );
  if (!a) throw ApiError.notFound('Assessment not found');
  if (isAdminRole(actor.role)) return a;
  if (actor.role === Role.TEACHER && a.createdById === actor.id) return a;
  throw ApiError.forbidden('You can only modify assessments you created');
}

export async function recalcTotalMarks(assessmentId: string, conn: PoolConnection): Promise<number> {
  const rows = await cq<{ marks: number; marksOverride: number | null }>(conn,
    'SELECT aq.marksOverride, q.marks FROM assessment_questions aq JOIN questions q ON q.id = aq.questionId WHERE aq.assessmentId = ?',
    [assessmentId],
  );
  const total = rows.reduce((sum: number, r: { marks: number; marksOverride: number | null }) => sum + (r.marksOverride ?? r.marks), 0);
  await cr(conn, 'UPDATE assessments SET totalMarks = ?, updatedAt = NOW() WHERE id = ?', [total, assessmentId]);
  return total;
}

// ── service ───────────────────────────────────────────────────

export const QuestionService = {
  async create(actor: Actor, input: CreateQuestionInput) {
    if (actor.role !== Role.TEACHER && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can create questions');
    }
    if (input.subjectId) await ensureSubjectExists(input.subjectId);
    await validateAcademicFks(input);

    const id = newId();
    const base: QuestionInsertFields = {
      id, type: input.type, prompt: input.prompt,
      marks: input.marks, difficulty: input.difficulty,
      subjectId: input.subjectId ?? null,
      classId:   input.classId   ?? null,
      chapterId: input.chapterId ?? null,
      bookId:    input.bookId    ?? null,
      educationBoard: input.educationBoard ?? null,
      createdById: actor.id,
    };

    // `correctOptions` and `tags` are appended separately (see the trailing
    // COALESCE columns below); everything else is spread into `fields`.
    let extra: Partial<QuestionInsertFields> = {};
    let correctOptions: string | null = null;
    const tags = toJson(input.tags ?? []);

    if (input.type === QuestionType.MCQ_SINGLE) {
      extra = { ...buildOptionFields(input.options), correctAnswer: IDX_TO_LETTER[input.correctOption] ?? null };
    } else if (input.type === QuestionType.MCQ_MULTIPLE) {
      extra = buildOptionFields(input.options);
      correctOptions = toJson(input.correctOptions.map((i: number) => IDX_TO_LETTER[i]).filter(Boolean));
    } else if (input.type === QuestionType.TRUE_FALSE) {
      extra = { correctBoolean: input.correctBoolean ? 1 : 0, correctAnswer: input.correctBoolean ? 'TRUE' : 'FALSE' };
    } else if (input.type === QuestionType.FILL_IN_BLANK) {
      extra = { correctAnswer: input.correctAnswer };
    } else if (input.type === QuestionType.MATCH_THE_COLUMN) {
      extra = { matchPairs: toJson(input.matchPairs) };
    } else if (input.type === QuestionType.DESCRIPTIVE) {
      extra = { modelAnswer: input.modelAnswer ?? null };
    }

    const fields: QuestionInsertFields = { ...base, ...extra };
    const cols   = Object.keys(fields).join(', ');
    const pmarks = Object.keys(fields).map(() => '?').join(', ');
    await run(
      `INSERT INTO questions (${cols}, correctOptions, tags, status, language, negativeMarks, createdAt, updatedAt)
       VALUES (${pmarks}, COALESCE(?, '[]'), COALESCE(?, '[]'), 'ACTIVE', 'ENGLISH', 0, NOW(), NOW())`,
      [...Object.values(fields), correctOptions, tags],
    );

    const created = await q1<DbQuestion>(`${SELECT_QUESTION} WHERE q.id = ?`, [id]);
    return toPublic(created!);
  },

  async list(actor: Actor, query: ListQuestionsQuery) {
    const { page, limit, type, difficulty, subjectId, search, mine } = query;
    const tag                = (query as Record<string, unknown>).tag               as string | undefined;
    const excludeAssessmentId = (query as Record<string, unknown>).excludeAssessmentId as string | undefined;

    if (actor.role === Role.STUDENT) throw ApiError.forbidden('Students cannot browse the question bank');

    const conds: string[] = [];
    const params: unknown[] = [];

    if (type)       { conds.push('q.type = ?');       params.push(type); }
    if (difficulty) { conds.push('q.difficulty = ?');  params.push(difficulty); }
    if (subjectId)  { conds.push('q.subjectId = ?');   params.push(subjectId); }
    if (search)     { conds.push('q.prompt LIKE ?');   params.push(`%${search}%`); }
    if (excludeAssessmentId) {
      conds.push('q.id NOT IN (SELECT questionId FROM assessment_questions WHERE assessmentId = ?)');
      params.push(excludeAssessmentId);
    }

    if (actor.role === Role.TEACHER && mine)          { conds.push('q.createdById = ?'); params.push(actor.id); }
    else if (actor.role === Role.TEACHER)              { conds.push('q.createdById = ?'); params.push(actor.id); }
    else if (isAdminRole(actor.role) && mine)          { conds.push('q.createdById = ?'); params.push(actor.id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { skip, take } = pageToSkipTake(page, limit);

    let [rows, countRows] = await Promise.all([
      q<DbQuestion>(`${SELECT_QUESTION} ${where} ORDER BY q.createdAt DESC LIMIT ? OFFSET ?`, [...params, take, skip]),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM questions q ${where}`, params),
    ]);

    if (tag) {
      rows = rows.filter((r: DbQuestion) => parseStrArr(r.tags).includes(tag));
    }

    const total = tag ? rows.length : (countRows[0]?.cnt ?? 0);
    return { items: rows.map(toPublic), meta: pageMeta(total, page, limit) };
  },

  async findById(actor: Actor, id: string) {
    const row = await loadQuestionOwned(id, actor, 'read');
    return toPublic(row);
  },

  async update(actor: Actor, id: string, input: UpdateQuestionInput) {
    const existing = await loadQuestionOwned(id, actor, 'write');
    if (input.subjectId) await ensureSubjectExists(input.subjectId);
    await validateAcademicFks(input);

    const sets: string[] = ['updatedAt = NOW()'];
    const params: unknown[] = [];

    if (input.prompt     !== undefined) { sets.push('prompt = ?');     params.push(input.prompt); }
    if (input.marks      !== undefined) { sets.push('marks = ?');      params.push(input.marks); }
    if (input.difficulty !== undefined) { sets.push('difficulty = ?'); params.push(input.difficulty); }
    if (input.tags       !== undefined) { sets.push('tags = ?');       params.push(toJson(input.tags)); }
    if (input.subjectId  !== undefined) { sets.push('subjectId = ?');  params.push(input.subjectId); }
    if (input.classId    !== undefined) { sets.push('classId = ?');    params.push(input.classId); }
    if (input.chapterId  !== undefined) { sets.push('chapterId = ?');  params.push(input.chapterId); }
    if (input.bookId     !== undefined) { sets.push('bookId = ?');     params.push(input.bookId); }
    if (input.educationBoard !== undefined) { sets.push('educationBoard = ?'); params.push(input.educationBoard); }

    if (existing.type === QuestionType.MCQ_SINGLE && input.options !== undefined) {
      const f = buildOptionFields(input.options);
      sets.push('optionA = ?, optionB = ?, optionC = ?, optionD = ?');
      params.push(f.optionA, f.optionB, f.optionC, f.optionD);
    }
    if (existing.type === QuestionType.MCQ_SINGLE && input.correctOption !== undefined) {
      sets.push('correctAnswer = ?'); params.push(IDX_TO_LETTER[input.correctOption] ?? null);
    }
    if (existing.type === QuestionType.MCQ_MULTIPLE && input.options !== undefined) {
      const f = buildOptionFields(input.options);
      sets.push('optionA = ?, optionB = ?, optionC = ?, optionD = ?');
      params.push(f.optionA, f.optionB, f.optionC, f.optionD);
    }
    if (existing.type === QuestionType.MCQ_MULTIPLE && input.correctOptions !== undefined) {
      sets.push('correctOptions = ?');
      params.push(toJson((input.correctOptions as number[]).map((i: number) => IDX_TO_LETTER[i]).filter(Boolean)));
    }
    if (existing.type === QuestionType.TRUE_FALSE && input.correctBoolean !== undefined) {
      sets.push('correctBoolean = ?, correctAnswer = ?');
      params.push(input.correctBoolean ? 1 : 0, input.correctBoolean ? 'TRUE' : 'FALSE');
    }
    if (existing.type === QuestionType.FILL_IN_BLANK && input.correctAnswer !== undefined) {
      sets.push('correctAnswer = ?'); params.push(input.correctAnswer);
    }
    if (existing.type === QuestionType.MATCH_THE_COLUMN && input.matchPairs !== undefined) {
      sets.push('matchPairs = ?'); params.push(toJson(input.matchPairs));
    }
    if (existing.type === QuestionType.DESCRIPTIVE && input.modelAnswer !== undefined) {
      sets.push('modelAnswer = ?'); params.push(input.modelAnswer);
    }
    params.push(id);

    await tx(async (conn: PoolConnection) => {
      await cr(conn, `UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, params);
      if (input.marks !== undefined && input.marks !== existing.marks) {
        const affected = await cq<{ assessmentId: string }>(conn,
          'SELECT DISTINCT assessmentId FROM assessment_questions WHERE questionId = ? AND marksOverride IS NULL',
          [id],
        );
        for (const a of affected) await recalcTotalMarks(a.assessmentId, conn);
      }
    });

    const updated = await q1<DbQuestion>(`${SELECT_QUESTION} WHERE q.id = ?`, [id]);
    return toPublic(updated!);
  },

  async remove(actor: Actor, id: string) {
    await loadQuestionOwned(id, actor, 'write');

    const answerCount = await q1<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM answers WHERE questionId = ?', [id]);
    if (Number(answerCount?.cnt) > 0) {
      throw ApiError.conflict('Cannot delete a question that has been answered in a submission; remove it from assessments instead');
    }

    const affected = await q<{ assessmentId: string }>(
      'SELECT DISTINCT assessmentId FROM assessment_questions WHERE questionId = ?', [id],
    );

    await tx(async (conn: PoolConnection) => {
      await cr(conn, 'DELETE FROM questions WHERE id = ?', [id]);
      for (const a of affected) await recalcTotalMarks(a.assessmentId, conn);
    });
  },

  // ── Assessment ↔ Question ─────────────────────────────────

  async listForAssessment(actor: Actor, assessmentId: string) {
    await loadAssessmentForWrite(assessmentId, actor);

    const rows = await q<{
      aqId: string; aqOrder: number; marksOverride: number | null;
    } & DbQuestion>(
      `SELECT aq.id AS aqId, aq.\`order\` AS aqOrder, aq.marksOverride,
              ${SELECT_QUESTION.replace('SELECT q.*', 'q.*')}
       FROM assessment_questions aq
       JOIN questions q ON q.id = aq.questionId
       LEFT JOIN subjects s ON s.id = q.subjectId
       LEFT JOIN users u ON u.id = q.createdById
       WHERE aq.assessmentId = ?
       ORDER BY aq.\`order\` ASC`,
      [assessmentId],
    );

    return rows.map((r: typeof rows[number]) => ({
      order:                r.aqOrder,
      assessmentQuestionId: r.aqId,
      marksOverride:        r.marksOverride,
      effectiveMarks:       r.marksOverride ?? r.marks,
      question:             toPublic(r),
    }));
  },

  async attach(actor: Actor, assessmentId: string, input: AttachQuestionsInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const items =
      'questionIds' in input
        ? input.questionIds.map((qid: string) => ({ questionId: qid, marksOverride: null as number | null }))
        : [{ questionId: input.questionId, marksOverride: (input as { marks?: number }).marks ?? null }];

    const qIds = items.map((i: { questionId: string }) => i.questionId);
    const existing = await q<{ id: string }>(
      'SELECT id FROM questions WHERE id IN (?)', [qIds],
    );
    const foundIds = new Set(existing.map((r: { id: string }) => r.id));
    const missing = items.find((i: { questionId: string }) => !foundIds.has(i.questionId));
    if (missing) throw ApiError.badRequest(`Question not found: ${missing.questionId}`);

    const already = await q<{ questionId: string }>(
      'SELECT questionId FROM assessment_questions WHERE assessmentId = ? AND questionId IN (?)',
      [assessmentId, qIds],
    );
    const alreadySet = new Set(already.map((r: { questionId: string }) => r.questionId));
    const toAttach = items.filter((i: { questionId: string }) => !alreadySet.has(i.questionId));

    let attached = 0;
    await tx(async (conn: PoolConnection) => {
      const maxRow = await cq1<{ maxOrd: number | null }>(conn,
        'SELECT MAX(`order`) AS maxOrd FROM assessment_questions WHERE assessmentId = ?', [assessmentId],
      );
      let nextOrder = (maxRow?.maxOrd ?? 0) + 1;

      for (const it of toAttach) {
        await cr(conn,
          'INSERT INTO assessment_questions (id, assessmentId, questionId, `order`, marksOverride) VALUES (?, ?, ?, ?, ?)',
          [newId(), assessmentId, it.questionId, nextOrder++, it.marksOverride],
        );
        attached++;
      }
      if (attached > 0) await recalcTotalMarks(assessmentId, conn);
    });

    return { attached, skipped: alreadySet.size };
  },

  async detach(actor: Actor, assessmentId: string, questionId: string) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const row = await q1<{ id: string }>(
      'SELECT id FROM assessment_questions WHERE assessmentId = ? AND questionId = ?', [assessmentId, questionId],
    );
    if (!row) throw ApiError.notFound('Question is not attached to this assessment');

    await tx(async (conn: PoolConnection) => {
      await cr(conn, 'DELETE FROM assessment_questions WHERE id = ?', [row.id]);
      const remaining = await cq<{ id: string }>(conn,
        'SELECT id FROM assessment_questions WHERE assessmentId = ? ORDER BY `order` ASC', [assessmentId],
      );
      for (let i = 0; i < remaining.length; i++) {
        await cr(conn, 'UPDATE assessment_questions SET `order` = ? WHERE id = ?', [i + 1, remaining[i].id]);
      }
      await recalcTotalMarks(assessmentId, conn);
    });
  },

  async updateAttachment(actor: Actor, assessmentId: string, questionId: string, input: UpdateAssessmentQuestionInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const row = await q1<{ id: string }>(
      'SELECT id FROM assessment_questions WHERE assessmentId = ? AND questionId = ?', [assessmentId, questionId],
    );
    if (!row) throw ApiError.notFound('Question is not attached to this assessment');

    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.marks !== undefined) { sets.push('marksOverride = ?'); params.push(input.marks); }
    if (input.order !== undefined) { sets.push('`order` = ?');      params.push(input.order); }
    params.push(row.id);

    await tx(async (conn: PoolConnection) => {
      if (sets.length) await cr(conn, `UPDATE assessment_questions SET ${sets.join(', ')} WHERE id = ?`, params);
      if (input.marks !== undefined) await recalcTotalMarks(assessmentId, conn);
    });

    return q1('SELECT * FROM assessment_questions WHERE id = ?', [row.id]);
  },

  async reorder(actor: Actor, assessmentId: string, input: ReorderQuestionsInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const orders = new Set<number>();
    for (const o of input.order) {
      if (orders.has(o.order)) throw ApiError.badRequest(`Duplicate order: ${o.order}`);
      orders.add(o.order);
    }

    const current = await q<{ id: string; questionId: string }>(
      'SELECT id, questionId FROM assessment_questions WHERE assessmentId = ?', [assessmentId],
    );
    const byQid = new Map(current.map((r: { id: string; questionId: string }) => [r.questionId, r.id]));

    for (const item of input.order) {
      if (!byQid.has(item.questionId)) throw ApiError.badRequest(`Question not attached: ${item.questionId}`);
    }
    if (input.order.length !== current.length) {
      throw ApiError.badRequest('Reorder payload must include every attached question');
    }

    await tx(async (conn: PoolConnection) => {
      const BASE = current.length + 10_000;
      for (let i = 0; i < current.length; i++) {
        await cr(conn, 'UPDATE assessment_questions SET `order` = ? WHERE id = ?', [BASE + i, current[i].id]);
      }
      for (const item of input.order) {
        await cr(conn, 'UPDATE assessment_questions SET `order` = ? WHERE id = ?', [item.order, byQid.get(item.questionId)!]);
      }
    });
  },
};
