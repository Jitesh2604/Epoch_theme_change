import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { QuestionType, Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { parseStrArr, toJson } from '../utils/json';
import type { Actor } from './assessment.service';
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
  ListQuestionsQuery,
  AttachQuestionsInput,
  UpdateAssessmentQuestionInput,
  ReorderQuestionsInput,
} from '../validators/question.validator';

// ── Query shape ────────────────────────────────────────────────

const questionInclude = {
  subject:   { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.QuestionInclude;

type QuestionWithRel = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

const IDX_TO_LETTER = ['A', 'B', 'C', 'D'] as const;

interface OptionFields {
  optionA: string | null; optionB: string | null;
  optionC: string | null; optionD: string | null;
}

function buildOptionFields(options: string[]): OptionFields {
  return {
    optionA: options[0] ?? null, optionB: options[1] ?? null,
    optionC: options[2] ?? null, optionD: options[3] ?? null,
  };
}

function toPublic(row: QuestionWithRel) {
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
    subject:        row.subject ? { id: row.subject.id, name: row.subject.name, slug: row.subject.slug } : null,
    classId:        row.classId,
    chapterId:      row.chapterId,
    bookId:         row.bookId,
    educationBoard: row.educationBoard,
    createdBy:      { id: row.createdBy.id, name: row.createdBy.name, email: row.createdBy.email },
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
  };
}

// ── helpers ────────────────────────────────────────────────────

async function ensureSubjectExists(subjectId: string): Promise<void> {
  const s = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!s) throw ApiError.badRequest(`Subject not found: ${subjectId}`);
}

/** Validate any academic FKs supplied on a question payload. */
async function validateAcademicFks(input: { classId?: string | null; chapterId?: string | null; bookId?: string | null }): Promise<void> {
  if (input.classId) {
    const r = await prisma.class.findUnique({ where: { id: input.classId }, select: { id: true } });
    if (!r) throw ApiError.badRequest(`Class not found: ${input.classId}`);
  }
  if (input.chapterId) {
    const r = await prisma.chapter.findUnique({ where: { id: input.chapterId }, select: { id: true } });
    if (!r) throw ApiError.badRequest(`Chapter not found: ${input.chapterId}`);
  }
  if (input.bookId) {
    const r = await prisma.book.findUnique({ where: { id: input.bookId }, select: { id: true } });
    if (!r) throw ApiError.badRequest(`Book not found: ${input.bookId}`);
  }
}

async function loadQuestionOwned(id: string, actor: Actor, mode: 'read' | 'write'): Promise<QuestionWithRel> {
  const row = await prisma.question.findUnique({ where: { id }, include: questionInclude });
  if (!row) throw ApiError.notFound('Question not found');
  if (isAdminRole(actor.role)) return row;
  if (actor.role === Role.TEACHER && row.createdById === actor.id) return row;
  if (mode === 'write') throw ApiError.forbidden('You can only modify questions you created');
  throw ApiError.forbidden('You do not have access to this question');
}

async function loadAssessmentForWrite(id: string, actor: Actor) {
  const a = await prisma.assessment.findUnique({ where: { id }, select: { id: true, status: true, createdById: true } });
  if (!a) throw ApiError.notFound('Assessment not found');
  if (isAdminRole(actor.role)) return a;
  if (actor.role === Role.TEACHER && a.createdById === actor.id) return a;
  throw ApiError.forbidden('You can only modify assessments you created');
}

/** Recompute an assessment's total marks from its attached questions. */
export async function recalcTotalMarks(assessmentId: string, client: Prisma.TransactionClient): Promise<number> {
  const rows = await client.assessmentQuestion.findMany({
    where: { assessmentId },
    select: { marksOverride: true, question: { select: { marks: true } } },
  });
  const total = rows.reduce((sum, r) => sum + (r.marksOverride ?? r.question.marks), 0);
  await client.assessment.update({ where: { id: assessmentId }, data: { totalMarks: Math.round(total) } });
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

    const data: Prisma.QuestionUncheckedCreateInput = {
      type:           input.type,
      prompt:         input.prompt,
      marks:          input.marks,
      difficulty:     input.difficulty,
      subjectId:      input.subjectId ?? null,
      classId:        input.classId   ?? null,
      chapterId:      input.chapterId ?? null,
      bookId:         input.bookId    ?? null,
      educationBoard: input.educationBoard ?? null,
      createdById:    actor.id,
      correctOptions: '[]',
      tags:           toJson(input.tags ?? []),
      status:         'ACTIVE',
      language:       'ENGLISH',
      negativeMarks:  0,
    };

    if (input.type === QuestionType.MCQ_SINGLE) {
      Object.assign(data, buildOptionFields(input.options), { correctAnswer: IDX_TO_LETTER[input.correctOption] ?? null });
    } else if (input.type === QuestionType.MCQ_MULTIPLE) {
      Object.assign(data, buildOptionFields(input.options));
      data.correctOptions = toJson(input.correctOptions.map((i: number) => IDX_TO_LETTER[i]).filter(Boolean));
    } else if (input.type === QuestionType.TRUE_FALSE) {
      data.correctBoolean = input.correctBoolean;
      data.correctAnswer  = input.correctBoolean ? 'TRUE' : 'FALSE';
    } else if (input.type === QuestionType.FILL_IN_BLANK) {
      data.correctAnswer = input.correctAnswer;
    } else if (input.type === QuestionType.MATCH_THE_COLUMN) {
      data.matchPairs = toJson(input.matchPairs);
    } else if (input.type === QuestionType.DESCRIPTIVE) {
      data.modelAnswer = input.modelAnswer ?? null;
    }

    const created = await prisma.question.create({ data, include: questionInclude });
    return toPublic(created);
  },

  async list(actor: Actor, query: ListQuestionsQuery) {
    const { page, limit, type, difficulty, subjectId, search, mine } = query;
    const tag                 = (query as Record<string, unknown>).tag                as string | undefined;
    const excludeAssessmentId = (query as Record<string, unknown>).excludeAssessmentId as string | undefined;

    if (actor.role === Role.STUDENT) throw ApiError.forbidden('Students cannot browse the question bank');

    const where: Prisma.QuestionWhereInput = {
      ...(type && { type }),
      ...(difficulty && { difficulty }),
      ...(subjectId && { subjectId }),
      ...(search && { prompt: { contains: search } }),
      ...(excludeAssessmentId && { assessments: { none: { assessmentId: excludeAssessmentId } } }),
    };

    // Teachers only ever see their own questions; admins see all unless `mine`.
    if (actor.role === Role.TEACHER) where.createdById = actor.id;
    else if (isAdminRole(actor.role) && mine) where.createdById = actor.id;

    const { skip, take } = pageToSkipTake(page, limit);

    let [rows, total] = await Promise.all([
      prisma.question.findMany({ where, include: questionInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.question.count({ where }),
    ]);

    if (tag) {
      rows = rows.filter((r) => parseStrArr(r.tags).includes(tag));
      total = rows.length;
    }

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

    const data: Prisma.QuestionUncheckedUpdateInput = {};
    if (input.prompt         !== undefined) data.prompt = input.prompt;
    if (input.marks          !== undefined) data.marks = input.marks;
    if (input.difficulty     !== undefined) data.difficulty = input.difficulty;
    if (input.tags           !== undefined) data.tags = toJson(input.tags);
    if (input.subjectId      !== undefined) data.subjectId = input.subjectId;
    if (input.classId        !== undefined) data.classId = input.classId;
    if (input.chapterId      !== undefined) data.chapterId = input.chapterId;
    if (input.bookId         !== undefined) data.bookId = input.bookId;
    if (input.educationBoard !== undefined) data.educationBoard = input.educationBoard;

    if ((existing.type === QuestionType.MCQ_SINGLE || existing.type === QuestionType.MCQ_MULTIPLE) && input.options !== undefined) {
      Object.assign(data, buildOptionFields(input.options));
    }
    if (existing.type === QuestionType.MCQ_SINGLE && input.correctOption !== undefined) {
      data.correctAnswer = IDX_TO_LETTER[input.correctOption] ?? null;
    }
    if (existing.type === QuestionType.MCQ_MULTIPLE && input.correctOptions !== undefined) {
      data.correctOptions = toJson((input.correctOptions as number[]).map((i: number) => IDX_TO_LETTER[i]).filter(Boolean));
    }
    if (existing.type === QuestionType.TRUE_FALSE && input.correctBoolean !== undefined) {
      data.correctBoolean = input.correctBoolean;
      data.correctAnswer  = input.correctBoolean ? 'TRUE' : 'FALSE';
    }
    if (existing.type === QuestionType.FILL_IN_BLANK && input.correctAnswer !== undefined) {
      data.correctAnswer = input.correctAnswer;
    }
    if (existing.type === QuestionType.MATCH_THE_COLUMN && input.matchPairs !== undefined) {
      data.matchPairs = toJson(input.matchPairs);
    }
    if (existing.type === QuestionType.DESCRIPTIVE && input.modelAnswer !== undefined) {
      data.modelAnswer = input.modelAnswer;
    }

    await prisma.$transaction(async (txc) => {
      await txc.question.update({ where: { id }, data });
      if (input.marks !== undefined && input.marks !== existing.marks) {
        const affected = await txc.assessmentQuestion.findMany({
          where: { questionId: id, marksOverride: null },
          select: { assessmentId: true }, distinct: ['assessmentId'],
        });
        for (const a of affected) await recalcTotalMarks(a.assessmentId, txc);
      }
    });

    const updated = await prisma.question.findUnique({ where: { id }, include: questionInclude });
    return toPublic(updated!);
  },

  async remove(actor: Actor, id: string) {
    await loadQuestionOwned(id, actor, 'write');

    const answerCount = await prisma.answer.count({ where: { questionId: id } });
    if (answerCount > 0) {
      throw ApiError.conflict('Cannot delete a question that has been answered in a submission; remove it from assessments instead');
    }

    const affected = await prisma.assessmentQuestion.findMany({
      where: { questionId: id }, select: { assessmentId: true }, distinct: ['assessmentId'],
    });

    await prisma.$transaction(async (txc) => {
      await txc.question.delete({ where: { id } });
      for (const a of affected) await recalcTotalMarks(a.assessmentId, txc);
    });
  },

  // ── Assessment ↔ Question ─────────────────────────────────

  async listForAssessment(actor: Actor, assessmentId: string) {
    await loadAssessmentForWrite(assessmentId, actor);

    const rows = await prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { order: 'asc' },
      include: { question: { include: questionInclude } },
    });

    return rows.map((r) => ({
      order:                r.order,
      assessmentQuestionId: r.id,
      marksOverride:        r.marksOverride,
      effectiveMarks:       r.marksOverride ?? r.question.marks,
      question:             toPublic(r.question),
    }));
  },

  async attach(actor: Actor, assessmentId: string, input: AttachQuestionsInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const items =
      'questionIds' in input
        ? input.questionIds.map((qid: string) => ({ questionId: qid, marksOverride: null as number | null }))
        : [{ questionId: input.questionId, marksOverride: (input as { marks?: number }).marks ?? null }];

    const qIds = items.map((i) => i.questionId);
    const existing = await prisma.question.findMany({ where: { id: { in: qIds } }, select: { id: true } });
    const foundIds = new Set(existing.map((r) => r.id));
    const missing = items.find((i) => !foundIds.has(i.questionId));
    if (missing) throw ApiError.badRequest(`Question not found: ${missing.questionId}`);

    const already = await prisma.assessmentQuestion.findMany({
      where: { assessmentId, questionId: { in: qIds } }, select: { questionId: true },
    });
    const alreadySet = new Set(already.map((r) => r.questionId));
    const toAttach = items.filter((i) => !alreadySet.has(i.questionId));

    let attached = 0;
    await prisma.$transaction(async (txc) => {
      const maxRow = await txc.assessmentQuestion.aggregate({ where: { assessmentId }, _max: { order: true } });
      let nextOrder = (maxRow._max.order ?? 0) + 1;

      for (const it of toAttach) {
        await txc.assessmentQuestion.create({
          data: { assessmentId, questionId: it.questionId, order: nextOrder++, marksOverride: it.marksOverride },
        });
        attached++;
      }
      if (attached > 0) await recalcTotalMarks(assessmentId, txc);
    });

    return { attached, skipped: alreadySet.size };
  },

  async detach(actor: Actor, assessmentId: string, questionId: string) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const row = await prisma.assessmentQuestion.findUnique({
      where: { assessmentId_questionId: { assessmentId, questionId } }, select: { id: true },
    });
    if (!row) throw ApiError.notFound('Question is not attached to this assessment');

    await prisma.$transaction(async (txc) => {
      await txc.assessmentQuestion.delete({ where: { id: row.id } });
      const remaining = await txc.assessmentQuestion.findMany({
        where: { assessmentId }, orderBy: { order: 'asc' }, select: { id: true },
      });
      for (let i = 0; i < remaining.length; i++) {
        await txc.assessmentQuestion.update({ where: { id: remaining[i].id }, data: { order: i + 1 } });
      }
      await recalcTotalMarks(assessmentId, txc);
    });
  },

  async updateAttachment(actor: Actor, assessmentId: string, questionId: string, input: UpdateAssessmentQuestionInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const row = await prisma.assessmentQuestion.findUnique({
      where: { assessmentId_questionId: { assessmentId, questionId } }, select: { id: true },
    });
    if (!row) throw ApiError.notFound('Question is not attached to this assessment');

    await prisma.$transaction(async (txc) => {
      const data: Prisma.AssessmentQuestionUncheckedUpdateInput = {
        ...(input.marks !== undefined && { marksOverride: input.marks }),
        ...(input.order !== undefined && { order: input.order }),
      };
      if (Object.keys(data).length) await txc.assessmentQuestion.update({ where: { id: row.id }, data });
      if (input.marks !== undefined) await recalcTotalMarks(assessmentId, txc);
    });

    return prisma.assessmentQuestion.findUnique({ where: { id: row.id } });
  },

  async reorder(actor: Actor, assessmentId: string, input: ReorderQuestionsInput) {
    const a = await loadAssessmentForWrite(assessmentId, actor);
    if (a.status === 'ARCHIVED') throw ApiError.badRequest('Archived assessments cannot be modified');

    const orders = new Set<number>();
    for (const o of input.order) {
      if (orders.has(o.order)) throw ApiError.badRequest(`Duplicate order: ${o.order}`);
      orders.add(o.order);
    }

    const current = await prisma.assessmentQuestion.findMany({
      where: { assessmentId }, select: { id: true, questionId: true },
    });
    const byQid = new Map(current.map((r) => [r.questionId, r.id]));

    for (const item of input.order) {
      if (!byQid.has(item.questionId)) throw ApiError.badRequest(`Question not attached: ${item.questionId}`);
    }
    if (input.order.length !== current.length) {
      throw ApiError.badRequest('Reorder payload must include every attached question');
    }

    await prisma.$transaction(async (txc) => {
      // Park all rows at non-colliding order values first (unique constraint on
      // [assessmentId, order]), then set the final positions.
      const BASE = current.length + 10_000;
      for (let i = 0; i < current.length; i++) {
        await txc.assessmentQuestion.update({ where: { id: current[i].id }, data: { order: BASE + i } });
      }
      for (const item of input.order) {
        await txc.assessmentQuestion.update({ where: { id: byQid.get(item.questionId)! }, data: { order: item.order } });
      }
    });
  },
};
