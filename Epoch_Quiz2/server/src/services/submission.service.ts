import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AssessmentStatus, QuestionType, Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { parseStrArr, parseIntArr, toJson } from '../utils/json';
import type { Actor } from './assessment.service';
import { assessmentVisibleToStudent } from './assessment.service';
import type {
  SaveAnswerInput,
  SubmitAttemptInput,
  GradeAnswerInput,
  ListSubmissionsQuery,
} from '../validators/submission.validator';

// ── DB types ───────────────────────────────────────────────────

interface DbAnswer {
  id: string; submissionId: string; questionId: string;
  selectedOption: number | null; selectedOptions: string;
  selectedBoolean: boolean | null; textAnswer: string | null;
  timeMs: number | null; isCorrect: boolean | null; marksAwarded: number;
}

interface AssessmentQuestion {
  aqId: string; aqOrder: number; marksOverride: number | null;
  qId: string; type: string; prompt: string; promptImageUrl: string | null;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  optionAImageUrl: string | null; optionBImageUrl: string | null;
  optionCImageUrl: string | null; optionDImageUrl: string | null;
  matchPairs: string | null; marks: number;
  correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null;
  explanation: string | null; explanationImageUrl: string | null; modelAnswer: string | null;
}

interface LoadedSubmission {
  id: string; studentId: string; assessmentId: string; status: string;
  score: number; totalMarks: number; timeTakenSec: number | null;
  startedAt: Date; submittedAt: Date | null;
  aTitle: string; aDescription: string | null; aDuration: number; aPassing: number;
  aCreatedById: string;
  subId: string | null; subName: string | null; subSlug: string | null;
  stName: string | null; stEmail: string | null;
}

// ── Prisma query shapes → flat DB types ────────────────────────

const submissionSelect = {
  id: true, studentId: true, assessmentId: true, status: true, score: true, totalMarks: true,
  timeTakenSec: true, startedAt: true, submittedAt: true,
  assessment: { select: { title: true, description: true, duration: true, passingMarks: true, createdById: true, subject: { select: { id: true, name: true, slug: true } } } },
  student: { select: { name: true, email: true } },
} satisfies Prisma.SubmissionSelect;

function mapLoaded(s: Prisma.SubmissionGetPayload<{ select: typeof submissionSelect }>): LoadedSubmission {
  return {
    id: s.id, studentId: s.studentId, assessmentId: s.assessmentId, status: s.status,
    score: s.score, totalMarks: s.totalMarks, timeTakenSec: s.timeTakenSec,
    startedAt: s.startedAt, submittedAt: s.submittedAt,
    aTitle: s.assessment.title, aDescription: s.assessment.description, aDuration: s.assessment.duration,
    aPassing: s.assessment.passingMarks, aCreatedById: s.assessment.createdById,
    subId: s.assessment.subject?.id ?? null, subName: s.assessment.subject?.name ?? null, subSlug: s.assessment.subject?.slug ?? null,
    stName: s.student.name, stEmail: s.student.email,
  };
}

async function loadSubmissionFlat(id: string): Promise<LoadedSubmission | null> {
  const s = await prisma.submission.findUnique({ where: { id }, select: submissionSelect });
  return s ? mapLoaded(s) : null;
}

const aqQuestionSelect = {
  id: true, type: true, prompt: true, promptImageUrl: true,
  optionA: true, optionB: true, optionC: true, optionD: true,
  optionAImageUrl: true, optionBImageUrl: true, optionCImageUrl: true, optionDImageUrl: true,
  matchPairs: true, marks: true, correctAnswer: true, correctOptions: true, correctBoolean: true,
  explanation: true, explanationImageUrl: true, modelAnswer: true,
} satisfies Prisma.QuestionSelect;

async function loadAssessmentQuestions(assessmentId: string): Promise<AssessmentQuestion[]> {
  const rows = await prisma.assessmentQuestion.findMany({
    where: { assessmentId }, orderBy: { order: 'asc' },
    select: { id: true, order: true, marksOverride: true, question: { select: aqQuestionSelect } },
  });
  return rows.map(r => ({
    aqId: r.id, aqOrder: r.order, marksOverride: r.marksOverride,
    qId: r.question.id, type: r.question.type, prompt: r.question.prompt, promptImageUrl: r.question.promptImageUrl,
    optionA: r.question.optionA, optionB: r.question.optionB, optionC: r.question.optionC, optionD: r.question.optionD,
    optionAImageUrl: r.question.optionAImageUrl, optionBImageUrl: r.question.optionBImageUrl,
    optionCImageUrl: r.question.optionCImageUrl, optionDImageUrl: r.question.optionDImageUrl,
    matchPairs: r.question.matchPairs, marks: r.question.marks,
    correctAnswer: r.question.correctAnswer, correctOptions: r.question.correctOptions, correctBoolean: r.question.correctBoolean,
    explanation: r.question.explanation, explanationImageUrl: r.question.explanationImageUrl, modelAnswer: r.question.modelAnswer,
  }));
}

function loadAnswers(submissionId: string): Promise<DbAnswer[]> {
  return prisma.answer.findMany({ where: { submissionId } });
}

// ── helpers ────────────────────────────────────────────────────

function getOptionsWithImages(aq: AssessmentQuestion): { text: string; imageUrl: string | null }[] | null {
  const pairs: [string | null, string | null][] = [
    [aq.optionA, aq.optionAImageUrl], [aq.optionB, aq.optionBImageUrl],
    [aq.optionC, aq.optionCImageUrl], [aq.optionD, aq.optionDImageUrl],
  ];
  const filtered = pairs.filter(([t]) => t) as [string, string | null][];
  return filtered.length ? filtered.map(([text, imageUrl]) => ({ text, imageUrl: imageUrl ?? null })) : null;
}

function durationLeft(startedAt: Date, durationMin: number) {
  const expiresAt    = new Date(new Date(startedAt).getTime() + durationMin * 60_000);
  const remainingSec = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return { expiresAt, remainingSec };
}

function gradeAnswer(
  type: string, marks: number,
  correctAnswer: string | null, correctOptions: string, correctBoolean: boolean | null,
  selectedOption: number | null, selectedOptions: number[], selectedBoolean: boolean | null, textAnswer: string | null,
): { isCorrect: boolean | null; marksAwarded: number } {
  if (type === QuestionType.MCQ_SINGLE) {
    if (selectedOption === null) return { isCorrect: false, marksAwarded: 0 };
    const letter  = (['A', 'B', 'C', 'D'] as const)[selectedOption] ?? null;
    const correct = letter !== null && letter === correctAnswer;
    return { isCorrect: correct, marksAwarded: correct ? marks : 0 };
  }
  if (type === QuestionType.MCQ_MULTIPLE) {
    if (!selectedOptions.length) return { isCorrect: false, marksAwarded: 0 };
    const LETTERS: string[] = ['A', 'B', 'C', 'D'];
    const correctLetters = parseStrArr(correctOptions);
    const selLetters: string[] = [];
    for (const i of selectedOptions) { const l = LETTERS[i]; if (l) selLetters.push(l); }
    const correct =
      correctLetters.length === selLetters.length &&
      correctLetters.every((l: string) => selLetters.includes(l)) &&
      selLetters.every((l: string) => correctLetters.includes(l));
    return { isCorrect: correct, marksAwarded: correct ? marks : 0 };
  }
  if (type === QuestionType.TRUE_FALSE) {
    if (selectedBoolean === null) return { isCorrect: false, marksAwarded: 0 };
    const correct = correctBoolean !== null && selectedBoolean === correctBoolean;
    return { isCorrect: correct, marksAwarded: correct ? marks : 0 };
  }
  if (type === QuestionType.FILL_IN_BLANK) {
    if (!textAnswer?.trim()) return { isCorrect: false, marksAwarded: 0 };
    const correct = correctAnswer !== null && textAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    return { isCorrect: correct, marksAwarded: correct ? marks : 0 };
  }
  return { isCorrect: null, marksAwarded: 0 };
}

function answerMap(answers: DbAnswer[]): Map<string, DbAnswer> {
  const m = new Map<string, DbAnswer>();
  for (const a of answers) m.set(a.questionId, a);
  return m;
}

async function loadOwnInProgress(actor: Actor, submissionId: string) {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, studentId: true, assessmentId: true, status: true, startedAt: true, totalMarks: true, assessment: { select: { duration: true } } },
  });
  if (!s) throw ApiError.notFound('Submission not found');
  if (!isAdminRole(actor.role) && s.studentId !== actor.id) throw ApiError.forbidden('You can only modify your own attempt');
  if (s.status !== SubmissionStatus.IN_PROGRESS) throw ApiError.badRequest('This attempt is no longer in progress');
  return { ...s, duration: s.assessment.duration };
}

function shapeSubmission(s: LoadedSubmission, aqs: AssessmentQuestion[], answers: DbAnswer[], revealAnswers: boolean) {
  const byQ   = answerMap(answers);
  const score = Number(s.score   ?? 0);
  const total = Number(s.totalMarks ?? 0);
  const pct   = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;

  const questions = aqs.map((aq: AssessmentQuestion) => {
    const a    = byQ.get(aq.qId) ?? null;
    const opts = getOptionsWithImages(aq);
    let matchPairs: unknown = null;
    try { matchPairs = aq.matchPairs ? JSON.parse(aq.matchPairs) : null; } catch { matchPairs = null; }

    return {
      order:          aq.aqOrder,
      questionId:     aq.qId,
      type:           aq.type,
      prompt:         aq.prompt,
      promptImageUrl: aq.promptImageUrl ?? null,
      options:        opts,
      matchPairs:     aq.type === QuestionType.MATCH_THE_COLUMN ? matchPairs : null,
      marks:          aq.marksOverride ?? aq.marks,
      yourAnswer: a ? {
        selectedOption:  a.selectedOption,
        selectedOptions: parseIntArr(a.selectedOptions),
        selectedBoolean: a.selectedBoolean,
        textAnswer:      a.textAnswer,
        timeMs:          a.timeMs,
      } : null,
      ...(revealAnswers ? {
        correctAnswer:       aq.correctAnswer,
        correctOptions:      parseStrArr(aq.correctOptions),
        correctBoolean:      aq.correctBoolean,
        modelAnswer:         aq.modelAnswer,
        explanation:         aq.explanation ?? null,
        explanationImageUrl: aq.explanationImageUrl ?? null,
        isCorrect:           a?.isCorrect ?? null,
        marksAwarded:        a?.marksAwarded ?? 0,
      } : {}),
    };
  });

  return {
    id: s.id, status: s.status, score, totalMarks: total, percent: pct,
    startedAt: s.startedAt, submittedAt: s.submittedAt, timeTakenSec: s.timeTakenSec,
    assessment: {
      id: s.assessmentId, title: s.aTitle, description: s.aDescription,
      duration: s.aDuration, passingMarks: s.aPassing,
      subject: s.subId ? { id: s.subId, name: s.subName, slug: s.subSlug } : null,
    },
    student: { id: s.studentId, name: s.stName, email: s.stEmail },
    questions,
  };
}

async function finalizeSubmission(submissionId: string) {
  const s = await loadSubmissionFlat(submissionId);
  if (!s) throw ApiError.notFound('Submission not found');

  const aqs = await loadAssessmentQuestions(s.assessmentId);

  if (s.status !== SubmissionStatus.IN_PROGRESS) {
    const answers = await loadAnswers(submissionId);
    return shapeSubmission(s, aqs, answers, true);
  }

  const existingAnswers = await loadAnswers(submissionId);
  const byQ = answerMap(existingAnswers);

  const effRows = await prisma.assessmentQuestion.findMany({ where: { assessmentId: s.assessmentId }, select: { questionId: true, marksOverride: true } });
  const effMap = new Map<string, number | null>();
  for (const r of effRows) effMap.set(r.questionId, r.marksOverride);

  let totalScore = 0;
  let hasUngradedDescriptive = false;

  await prisma.$transaction(async (txc) => {
    for (const aq of aqs) {
      const a           = byQ.get(aq.qId) ?? null;
      const marks       = effMap.get(aq.qId) ?? aq.marks;
      const needsManual = aq.type === QuestionType.DESCRIPTIVE || aq.type === QuestionType.MATCH_THE_COLUMN;

      const { isCorrect, marksAwarded } = gradeAnswer(
        aq.type, marks,
        aq.correctAnswer, aq.correctOptions, aq.correctBoolean,
        a?.selectedOption ?? null,
        parseIntArr(a?.selectedOptions ?? '[]'),
        a?.selectedBoolean ?? null,
        a?.textAnswer ?? null,
      );
      totalScore += marksAwarded;
      if (needsManual && a) hasUngradedDescriptive = true;

      if (a) {
        await txc.answer.update({ where: { id: a.id }, data: { isCorrect, marksAwarded } });
      } else {
        await txc.answer.create({
          data: { submissionId, questionId: aq.qId, selectedOptions: '[]', isCorrect: needsManual ? null : false, marksAwarded: 0 },
        });
      }
    }

    const submittedAt  = new Date();
    const timeTakenSec = Math.max(0, Math.floor((submittedAt.getTime() - new Date(s.startedAt).getTime()) / 1000));
    const status       = hasUngradedDescriptive ? SubmissionStatus.SUBMITTED : SubmissionStatus.GRADED;

    await txc.submission.update({ where: { id: submissionId }, data: { score: totalScore, submittedAt, timeTakenSec, status } });
  });

  const finalSub     = await loadSubmissionFlat(submissionId);
  const finalAnswers = await loadAnswers(submissionId);
  return shapeSubmission(finalSub!, aqs, finalAnswers, true);
}

async function recomputeSubmissionScore(txc: Prisma.TransactionClient, submissionId: string): Promise<void> {
  const rows = await txc.answer.findMany({
    where: { submissionId }, select: { marksAwarded: true, isCorrect: true, question: { select: { type: true } } },
  });
  const score = rows.reduce((sum, a) => sum + a.marksAwarded, 0);
  const stillUngraded = rows.some(
    a => (a.question.type === QuestionType.DESCRIPTIVE || a.question.type === QuestionType.MATCH_THE_COLUMN) && a.isCorrect === null,
  );
  const status = stillUngraded ? SubmissionStatus.SUBMITTED : SubmissionStatus.GRADED;
  await txc.submission.update({ where: { id: submissionId }, data: { score, status } });
}

// ── service ───────────────────────────────────────────────────

export const SubmissionService = {
  async start(actor: Actor, assessmentId: string) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('Only students can start an assessment attempt');

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, title: true, description: true, duration: true, totalMarks: true, passingMarks: true, status: true, subject: { select: { id: true, name: true, slug: true } } },
    });
    if (!assessment) throw ApiError.notFound('Assessment not found');
    if (assessment.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
    if (!(await assessmentVisibleToStudent(actor.id, assessmentId))) throw ApiError.notFound('Assessment not found');

    const aqs = await loadAssessmentQuestions(assessmentId);
    if (!aqs.length) throw ApiError.badRequest('This assessment has no questions yet');

    let submission = await prisma.submission.findUnique({
      where: { assessmentId_studentId: { assessmentId, studentId: actor.id } },
      select: { id: true, status: true, startedAt: true, totalMarks: true },
    });

    if (submission && submission.status !== SubmissionStatus.IN_PROGRESS) {
      throw ApiError.conflict('You have already submitted this assessment');
    }

    if (!submission) {
      const totalMarks = aqs.reduce((sum, aq) => sum + (aq.marksOverride ?? aq.marks), 0);
      submission = await prisma.submission.create({
        data: { assessmentId, studentId: actor.id, status: SubmissionStatus.IN_PROGRESS, score: 0, totalMarks, timeTakenSec: 0 },
        select: { id: true, status: true, startedAt: true, totalMarks: true },
      });
    }

    const { expiresAt, remainingSec } = durationLeft(submission.startedAt, assessment.duration);
    if (remainingSec === 0) {
      const finalized = await finalizeSubmission(submission.id);
      return { autoSubmitted: true, submission: finalized };
    }

    const savedAnswers = await prisma.answer.findMany({
      where: { submissionId: submission.id },
      select: { questionId: true, selectedOption: true, selectedOptions: true, selectedBoolean: true, textAnswer: true },
    });

    const questions = aqs.map((aq) => ({
      order:          aq.aqOrder,
      questionId:     aq.qId,
      type:           aq.type,
      prompt:         aq.prompt,
      promptImageUrl: aq.promptImageUrl ?? null,
      options:        (aq.type === QuestionType.MCQ_SINGLE || aq.type === QuestionType.MCQ_MULTIPLE)
                        ? getOptionsWithImages(aq) : null,
      matchPairs:     aq.type === QuestionType.MATCH_THE_COLUMN && aq.matchPairs
                        ? JSON.parse(aq.matchPairs) : null,
      marks:          aq.marksOverride ?? aq.marks,
    }));

    const existing = savedAnswers.map((a) => ({
      questionId:      a.questionId,
      selectedOption:  a.selectedOption,
      selectedOptions: parseIntArr(a.selectedOptions),
      selectedBoolean: a.selectedBoolean,
      textAnswer:      a.textAnswer,
    }));

    return {
      submission: {
        id: submission.id, status: submission.status, startedAt: submission.startedAt,
        expiresAt, remainingSec, totalMarks: submission.totalMarks,
        assessment: {
          id: assessment.id, title: assessment.title, description: assessment.description,
          duration: assessment.duration,
          subject: assessment.subject
            ? { id: assessment.subject.id, name: assessment.subject.name, slug: assessment.subject.slug }
            : null,
        },
        questions,
        savedAnswers: existing,
      },
    };
  },

  async saveAnswer(actor: Actor, submissionId: string, input: SaveAnswerInput) {
    const s = await loadOwnInProgress(actor, submissionId);
    const { remainingSec } = durationLeft(s.startedAt, s.duration);
    if (remainingSec === 0) {
      await finalizeSubmission(submissionId);
      throw ApiError.badRequest('Time is up — attempt was auto-submitted');
    }

    const question = await prisma.question.findFirst({
      where: { id: input.questionId, assessments: { some: { assessmentId: s.assessmentId } } },
      select: { id: true, type: true, marks: true, correctAnswer: true, correctOptions: true, correctBoolean: true },
    });
    if (!question) throw ApiError.badRequest('Question is not part of this assessment');

    const effRow = await prisma.assessmentQuestion.findUnique({
      where: { assessmentId_questionId: { assessmentId: s.assessmentId, questionId: input.questionId } },
      select: { marksOverride: true },
    });
    const marks   = effRow?.marksOverride ?? question.marks;
    const selOpts = input.selectedOptions ?? [];
    const { isCorrect, marksAwarded } = gradeAnswer(
      question.type, marks, question.correctAnswer, question.correctOptions, question.correctBoolean,
      input.selectedOption ?? null, selOpts, input.selectedBoolean ?? null, input.textAnswer ?? null,
    );

    const fields = {
      selectedOption:  input.selectedOption ?? null,
      selectedOptions: toJson(selOpts),
      selectedBoolean: input.selectedBoolean ?? null,
      textAnswer:      input.textAnswer ?? null,
      timeMs:          input.timeMs ?? null,
      isCorrect, marksAwarded,
    };
    await prisma.answer.upsert({
      where:  { submissionId_questionId: { submissionId, questionId: input.questionId } },
      create: { submissionId, questionId: input.questionId, ...fields },
      update: fields,
    });
    return { ok: true };
  },

  async submit(actor: Actor, submissionId: string, input: SubmitAttemptInput) {
    const s = await loadOwnInProgress(actor, submissionId);

    if (input.answers && input.answers.length > 0) {
      const qIds     = input.answers.map((a: SaveAnswerInput) => a.questionId);
      const validQs  = await prisma.question.findMany({
        where: { id: { in: qIds }, assessments: { some: { assessmentId: s.assessmentId } } }, select: { id: true },
      });
      const validIds = new Set(validQs.map((r) => r.id));
      const unknown  = input.answers.find((a: SaveAnswerInput) => !validIds.has(a.questionId));
      if (unknown) throw ApiError.badRequest(`Question not in this assessment: ${unknown.questionId}`);

      const effRows  = await prisma.assessmentQuestion.findMany({
        where: { assessmentId: s.assessmentId, questionId: { in: qIds } }, select: { questionId: true, marksOverride: true },
      });
      const effMap   = new Map<string, number | null>();
      for (const r of effRows) effMap.set(r.questionId, r.marksOverride);

      const qRows   = await prisma.question.findMany({
        where: { id: { in: qIds } }, select: { id: true, type: true, marks: true, correctAnswer: true, correctOptions: true, correctBoolean: true },
      });
      const qMap    = new Map<string, typeof qRows[number]>();
      for (const r of qRows) qMap.set(r.id, r);

      for (const a of input.answers) {
        const question = qMap.get(a.questionId)!;
        const marks    = effMap.get(a.questionId) ?? question.marks;
        const selOpts  = a.selectedOptions ?? [];
        const { isCorrect, marksAwarded } = gradeAnswer(
          question.type, marks, question.correctAnswer, question.correctOptions, question.correctBoolean,
          a.selectedOption ?? null, selOpts, a.selectedBoolean ?? null, a.textAnswer ?? null,
        );
        const fields = {
          selectedOption:  a.selectedOption ?? null,
          selectedOptions: toJson(selOpts),
          selectedBoolean: a.selectedBoolean ?? null,
          textAnswer:      a.textAnswer ?? null,
          timeMs:          a.timeMs ?? null,
          isCorrect, marksAwarded,
        };
        await prisma.answer.upsert({
          where:  { submissionId_questionId: { submissionId, questionId: a.questionId } },
          create: { submissionId, questionId: a.questionId, ...fields },
          update: fields,
        });
      }
    }
    return finalizeSubmission(submissionId);
  },

  async findById(actor: Actor, id: string) {
    const s = await loadSubmissionFlat(id);
    if (!s) throw ApiError.notFound('Submission not found');

    if (!isAdminRole(actor.role)) {
      if (actor.role === Role.TEACHER) {
        if (s.aCreatedById !== actor.id) throw ApiError.forbidden('You can only view submissions for your own assessments');
      } else {
        if (s.studentId !== actor.id) throw ApiError.notFound('Submission not found');
      }
    }

    const aqs     = await loadAssessmentQuestions(s.assessmentId);
    const answers = await loadAnswers(id);
    return shapeSubmission(s, aqs, answers, s.status !== SubmissionStatus.IN_PROGRESS);
  },

  async listMine(actor: Actor, query: ListSubmissionsQuery) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('listMine is for students only');
    const { page, limit, status, assessmentId } = query;

    const where: Prisma.SubmissionWhereInput = {
      studentId: actor.id,
      ...(status && { status }),
      ...(assessmentId && { assessmentId }),
    };
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total] = await Promise.all([
      prisma.submission.findMany({
        where, orderBy: { startedAt: 'desc' }, skip, take,
        select: { id: true, status: true, score: true, totalMarks: true, timeTakenSec: true, startedAt: true, submittedAt: true, assessment: { select: { id: true, title: true, subject: { select: { id: true, name: true, slug: true } } } } },
      }),
      prisma.submission.count({ where }),
    ]);

    const items = rows.map((s) => {
      const score = s.score ?? 0; const totalMarks = s.totalMarks ?? 0;
      return {
        id: s.id, status: s.status, score, totalMarks,
        percent: totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0,
        startedAt: s.startedAt, submittedAt: s.submittedAt, timeTakenSec: s.timeTakenSec,
        assessment: { id: s.assessment.id, title: s.assessment.title, subject: s.assessment.subject ? { id: s.assessment.subject.id, name: s.assessment.subject.name, slug: s.assessment.subject.slug } : null },
      };
    });
    return { items, meta: pageMeta(total, page, limit) };
  },

  async list(actor: Actor, query: ListSubmissionsQuery) {
    if (actor.role === Role.STUDENT) throw ApiError.forbidden('Students should use /submissions/me');
    const { page, limit, status, assessmentId, studentId } = query;

    const where: Prisma.SubmissionWhereInput = {
      ...(status && { status }),
      ...(assessmentId && { assessmentId }),
      ...(studentId && { studentId }),
      ...(actor.role === Role.TEACHER && { assessment: { createdById: actor.id } }),
    };
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total] = await Promise.all([
      prisma.submission.findMany({
        where, orderBy: { startedAt: 'desc' }, skip, take,
        select: { id: true, status: true, score: true, totalMarks: true, timeTakenSec: true, startedAt: true, submittedAt: true, assessment: { select: { id: true, title: true, subject: { select: { id: true, name: true, slug: true } } } }, student: { select: { id: true, name: true, email: true } } },
      }),
      prisma.submission.count({ where }),
    ]);

    const items = rows.map((s) => {
      const score = s.score ?? 0; const totalMarks = s.totalMarks ?? 0;
      return {
        id: s.id, status: s.status, score, totalMarks,
        percent: totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0,
        startedAt: s.startedAt, submittedAt: s.submittedAt, timeTakenSec: s.timeTakenSec,
        assessment: { id: s.assessment.id, title: s.assessment.title, subject: s.assessment.subject ? { id: s.assessment.subject.id, name: s.assessment.subject.name, slug: s.assessment.subject.slug } : null },
        student: { id: s.student.id, name: s.student.name, email: s.student.email },
      };
    });
    return { items, meta: pageMeta(total, page, limit) };
  },

  async grade(actor: Actor, submissionId: string, questionId: string, input: GradeAnswerInput) {
    if (actor.role !== Role.TEACHER && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can grade');
    }
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, assessmentId: true, assessment: { select: { createdById: true } } },
    });
    if (!submission) throw ApiError.notFound('Submission not found');
    if (actor.role === Role.TEACHER && submission.assessment.createdById !== actor.id) {
      throw ApiError.forbidden('You can only grade submissions for your own assessments');
    }
    if (submission.status === SubmissionStatus.IN_PROGRESS) {
      throw ApiError.badRequest('Cannot grade a submission that is still in progress');
    }

    const answer = await prisma.answer.findUnique({
      where: { submissionId_questionId: { submissionId, questionId } },
      select: { id: true, question: { select: { type: true } } },
    });
    if (!answer) throw ApiError.notFound('Answer not found');
    if (answer.question.type !== QuestionType.DESCRIPTIVE) {
      throw ApiError.badRequest('Only descriptive answers require manual grading');
    }

    const aq = await prisma.assessmentQuestion.findUnique({
      where: { assessmentId_questionId: { assessmentId: submission.assessmentId, questionId } },
      select: { marksOverride: true, question: { select: { marks: true } } },
    });
    const effective = aq?.marksOverride ?? aq?.question.marks ?? 0;
    if (input.marksAwarded > effective) throw ApiError.badRequest(`marksAwarded cannot exceed ${effective}`);

    await prisma.$transaction(async (txc) => {
      await txc.answer.update({
        where: { id: answer.id },
        data: { marksAwarded: input.marksAwarded, isCorrect: input.isCorrect ?? input.marksAwarded > 0 },
      });
      await recomputeSubmissionScore(txc, submissionId);
    });

    const finalSub = await loadSubmissionFlat(submissionId);
    const finalAqs = await loadAssessmentQuestions(submission.assessmentId);
    const finalAns = await loadAnswers(submissionId);
    return shapeSubmission(finalSub!, finalAqs, finalAns, true);
  },
};
