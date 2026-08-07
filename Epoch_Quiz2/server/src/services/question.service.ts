import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { QuestionType, Role, DEFAULT_LANGUAGE } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { parseStrArr, toJson } from '../utils/json';
import { ContentService, ContentMeta } from './content.service';
import { SettingsService } from './settings.service';
import type { Actor } from './assessment.service';
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
  ListQuestionsQuery,
} from '../validators/question.validator';

// ── Query shape ────────────────────────────────────────────────
//
// This is the Practice/Olympiad question bank ONLY — it reads and writes
// `prisma.question` exclusively. Assessment questions live in a physically
// separate table (`AssessmentQuestionBank`) with their own CRUD in
// `assessmentQuestion.service.ts`, so the two modules can never see or
// touch each other's content.

const questionInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.QuestionInclude;

type QuestionWithRel = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

const IDX_TO_LETTER = ['A', 'B', 'C', 'D'] as const;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

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

function toPublic(row: QuestionWithRel, subjectNames?: Map<string, string>) {
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
    promptImageUrl: row.promptImageUrl,
    options:        opts.length > 0 ? opts : null,
    // Per-letter, matching `options`' A/B/C/D order — not filtered/compacted
    // like `opts` above, so a caller can always address "option B's image"
    // by letter regardless of which option text fields are empty.
    optionImageUrls: {
      A: row.optionAImageUrl, B: row.optionBImageUrl,
      C: row.optionCImageUrl, D: row.optionDImageUrl,
    },
    correctOption:  correctIdx >= 0 ? correctIdx : null,
    correctOptions: correctIndices,
    correctBoolean: row.correctBoolean,
    correctAnswer:  row.correctAnswer,
    modelAnswer:    row.modelAnswer,
    matchPairs,
    explanation:    row.explanation,
    explanationImageUrl: row.explanationImageUrl,
    marks:          row.marks,
    negativeMarks:  row.negativeMarks,
    difficulty:     row.difficulty,
    language:       row.language,
    tags,
    status:         row.status,
    subject:        row.subjectExternalId
      ? { id: row.subjectExternalId, name: subjectNames?.get(row.subjectExternalId) ?? null, slug: slugify(subjectNames?.get(row.subjectExternalId) ?? '') || null }
      : null,
    subjectExternalId: row.subjectExternalId,
    classExternalId:   row.classExternalId,
    chapterExternalId: row.chapterExternalId,
    bookExternalId:    row.bookExternalId,
    educationBoard: row.educationBoard,
    createdBy:      { id: row.createdBy.id, name: row.createdBy.name, email: row.createdBy.email },
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
  };
}

// ── helpers ────────────────────────────────────────────────────

/**
 * Validate a subject EXTERNAL id against the live (cached) Content API. When the
 * API is unconfigured we cannot validate, so we accept the value as-is rather
 * than block question authoring.
 */
async function ensureSubjectExists(subjectExternalId: string): Promise<void> {
  if (!ContentService.isConfigured()) return;
  if (!(await ContentMeta.subjectExists(subjectExternalId))) {
    throw ApiError.badRequest(`Subject not found: ${subjectExternalId}`);
  }
}

/**
 * Validate academic external ids supplied on a question payload against the
 * live catalog. Only the class dimension is validated against the API (books
 * and chapters are per-book lookups the list endpoints don't expose cheaply);
 * they are stored as-is. No local catalog tables exist anymore.
 */
async function validateAcademicFks(input: { classExternalId?: string | null }): Promise<void> {
  if (input.classExternalId && ContentService.isConfigured()) {
    if (!(await ContentMeta.classExists(input.classExternalId))) {
      throw ApiError.badRequest(`Class not found: ${input.classExternalId}`);
    }
  }
}

async function loadQuestionOwned(id: string, actor: Actor, mode: 'read' | 'write'): Promise<QuestionWithRel> {
  const row = await prisma.question.findUnique({ where: { id }, include: questionInclude });
  if (!row) throw ApiError.notFound('Question not found');
  if (isAdminRole(actor.role)) return row;
  if (mode === 'write') throw ApiError.forbidden('You can only modify questions you created');
  throw ApiError.forbidden('You do not have access to this question');
}

// ── service ───────────────────────────────────────────────────

export const QuestionService = {
  async create(actor: Actor, input: CreateQuestionInput) {
    if (!isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only admins can create questions');
    }
    if (input.subjectExternalId) await ensureSubjectExists(input.subjectExternalId);
    await validateAcademicFks(input);

    const marks = input.marks ?? (Number(await SettingsService.get('assessment.defaultMarks')) || 1);

    const data: Prisma.QuestionUncheckedCreateInput = {
      type:              input.type,
      prompt:            input.prompt,
      promptImageUrl:    input.promptImageUrl ?? null,
      marks,
      difficulty:        input.difficulty,
      subjectExternalId: input.subjectExternalId ?? null,
      classExternalId:   input.classExternalId   ?? null,
      chapterExternalId: input.chapterExternalId ?? null,
      bookExternalId:    input.bookExternalId    ?? null,
      educationBoard:    input.educationBoard ?? null,
      createdById:    actor.id,
      correctOptions: '[]',
      tags:           toJson(input.tags ?? []),
      status:         'ACTIVE',
      language:       DEFAULT_LANGUAGE,
      negativeMarks:  0,
      explanation:         input.explanation ?? null,
      explanationImageUrl: input.explanationImageUrl ?? null,
    };

    if (input.type === QuestionType.MCQ_SINGLE) {
      Object.assign(data, buildOptionFields(input.options), { correctAnswer: IDX_TO_LETTER[input.correctOption] ?? null });
      data.optionAImageUrl = input.optionAImageUrl ?? null;
      data.optionBImageUrl = input.optionBImageUrl ?? null;
      data.optionCImageUrl = input.optionCImageUrl ?? null;
      data.optionDImageUrl = input.optionDImageUrl ?? null;
    } else if (input.type === QuestionType.MCQ_MULTIPLE) {
      Object.assign(data, buildOptionFields(input.options));
      data.correctOptions = toJson(input.correctOptions.map((i: number) => IDX_TO_LETTER[i]).filter(Boolean));
      data.optionAImageUrl = input.optionAImageUrl ?? null;
      data.optionBImageUrl = input.optionBImageUrl ?? null;
      data.optionCImageUrl = input.optionCImageUrl ?? null;
      data.optionDImageUrl = input.optionDImageUrl ?? null;
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
    return toPublic(created, await ContentMeta.subjects());
  },

  async list(actor: Actor, query: ListQuestionsQuery) {
    const { page, limit, type, difficulty, search, mine } = query;
    const subjectExternalId   = (query as Record<string, unknown>).subjectExternalId  as string | undefined;
    const tag                 = (query as Record<string, unknown>).tag                as string | undefined;

    if (actor.role === Role.STUDENT) throw ApiError.forbidden('Students cannot browse the question bank');

    const where: Prisma.QuestionWhereInput = {
      ...(type && { type }),
      ...(difficulty && { difficulty }),
      ...(subjectExternalId && { subjectExternalId }),
      ...(search && { prompt: { contains: search } }),
    };

    // Question Bank is a shared, central repository (per QuestionBankPage's
    // own subtitle) — teachers and admins both see every question by default,
    // scoped to just their own via `mine` if requested.
    if (mine) where.createdById = actor.id;

    const { skip, take } = pageToSkipTake(page, limit);

    let [rows, total] = await Promise.all([
      prisma.question.findMany({ where, include: questionInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.question.count({ where }),
    ]);

    if (tag) {
      rows = rows.filter((r) => parseStrArr(r.tags).includes(tag));
      total = rows.length;
    }

    const subjectNames = await ContentMeta.subjects();
    return { items: rows.map((r) => toPublic(r, subjectNames)), meta: pageMeta(total, page, limit) };
  },

  async findById(actor: Actor, id: string) {
    const row = await loadQuestionOwned(id, actor, 'read');
    return toPublic(row, await ContentMeta.subjects());
  },

  async update(actor: Actor, id: string, input: UpdateQuestionInput) {
    const existing = await loadQuestionOwned(id, actor, 'write');
    if (input.subjectExternalId) await ensureSubjectExists(input.subjectExternalId);
    await validateAcademicFks(input);

    const data: Prisma.QuestionUncheckedUpdateInput = {};
    if (input.prompt            !== undefined) data.prompt = input.prompt;
    if (input.marks             !== undefined) data.marks = input.marks;
    if (input.difficulty        !== undefined) data.difficulty = input.difficulty;
    if (input.tags              !== undefined) data.tags = toJson(input.tags);
    if (input.subjectExternalId !== undefined) data.subjectExternalId = input.subjectExternalId;
    if (input.classExternalId   !== undefined) data.classExternalId = input.classExternalId;
    if (input.chapterExternalId !== undefined) data.chapterExternalId = input.chapterExternalId;
    if (input.bookExternalId    !== undefined) data.bookExternalId = input.bookExternalId;
    if (input.educationBoard    !== undefined) data.educationBoard = input.educationBoard;
    if (input.promptImageUrl      !== undefined) data.promptImageUrl = input.promptImageUrl;
    if (input.explanation         !== undefined) data.explanation = input.explanation;
    if (input.explanationImageUrl !== undefined) data.explanationImageUrl = input.explanationImageUrl;

    if ((existing.type === QuestionType.MCQ_SINGLE || existing.type === QuestionType.MCQ_MULTIPLE) && input.options !== undefined) {
      Object.assign(data, buildOptionFields(input.options));
    }
    if (existing.type === QuestionType.MCQ_SINGLE || existing.type === QuestionType.MCQ_MULTIPLE) {
      if (input.optionAImageUrl !== undefined) data.optionAImageUrl = input.optionAImageUrl;
      if (input.optionBImageUrl !== undefined) data.optionBImageUrl = input.optionBImageUrl;
      if (input.optionCImageUrl !== undefined) data.optionCImageUrl = input.optionCImageUrl;
      if (input.optionDImageUrl !== undefined) data.optionDImageUrl = input.optionDImageUrl;
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

    await prisma.question.update({ where: { id }, data });

    const updated = await prisma.question.findUnique({ where: { id }, include: questionInclude });
    return toPublic(updated!, await ContentMeta.subjects());
  },

  async remove(actor: Actor, id: string) {
    await loadQuestionOwned(id, actor, 'write');
    await prisma.question.delete({ where: { id } });
  },
};
