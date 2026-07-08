import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { QuestionType, AttemptStatus, QuizType, QuizStatus } from '../lib/enums';
import { parseStrArr, toJson } from '../utils/json';
import { ApiError } from '../utils/ApiError';
import type {
  StartPracticeInput,
  StartOlympiadInput,
  SaveAttemptAnswerInput,
  SubmitAttemptInput,
} from '../validators/quiz.validator';

// ── Types ─────────────────────────────────────────────────────────────

/** Question fields needed to render/grade a quiz question. */
interface QuizQuestion {
  id: string; type: QuestionType; prompt: string;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null;
  marks: number; difficulty: string;
}

type GradableQuestion = Pick<QuizQuestion, 'type' | 'correctAnswer' | 'correctOptions' | 'correctBoolean' | 'marks'>;

// ── Helpers ────────────────────────────────────────────────────────────

const GRADABLE_TYPES: QuestionType[] = [
  QuestionType.MCQ_SINGLE, QuestionType.MCQ_MULTIPLE,
  QuestionType.TRUE_FALSE, QuestionType.FILL_IN_BLANK,
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getOptions(q: Pick<QuizQuestion, 'optionA' | 'optionB' | 'optionC' | 'optionD'>): { letter: string; text: string }[] {
  return ([['A', q.optionA], ['B', q.optionB], ['C', q.optionC], ['D', q.optionD]] as [string, string | null][])
    .filter(([, t]) => t)
    .map(([l, t]) => ({ letter: l, text: t! }));
}

function sanitizeQuestion(q: QuizQuestion, order: number) {
  return {
    order,
    id:         q.id,
    type:       q.type,
    prompt:     q.prompt,
    options:    (q.type === QuestionType.MCQ_SINGLE || q.type === QuestionType.MCQ_MULTIPLE) ? getOptions(q) : null,
    marks:      q.marks,
    difficulty: q.difficulty,
  };
}

interface AnswerLike {
  selectedOption:  string | null;
  selectedOptions: string[];
  textAnswer:      string | null;
  isSkipped:       boolean;
}

function gradeOne(q: GradableQuestion, ans: AnswerLike): { isCorrect: boolean | null; marksAwarded: number } {
  if (ans.isSkipped) return { isCorrect: null, marksAwarded: 0 };

  switch (q.type) {
    case QuestionType.MCQ_SINGLE: {
      if (!ans.selectedOption) return { isCorrect: false, marksAwarded: 0 };
      const ok = ans.selectedOption === q.correctAnswer;
      return { isCorrect: ok, marksAwarded: ok ? q.marks : 0 };
    }
    case QuestionType.MCQ_MULTIPLE: {
      const correct = parseStrArr(q.correctOptions);
      const sel     = ans.selectedOptions;
      if (!sel.length) return { isCorrect: false, marksAwarded: 0 };
      const ok = correct.length === sel.length && correct.every(c => sel.includes(c)) && sel.every(s => correct.includes(s));
      return { isCorrect: ok, marksAwarded: ok ? q.marks : 0 };
    }
    case QuestionType.TRUE_FALSE: {
      if (!ans.selectedOption) return { isCorrect: false, marksAwarded: 0 };
      const ok = (ans.selectedOption === 'TRUE') === (q.correctBoolean ?? false);
      return { isCorrect: ok, marksAwarded: ok ? q.marks : 0 };
    }
    case QuestionType.FILL_IN_BLANK: {
      if (!ans.textAnswer) return { isCorrect: false, marksAwarded: 0 };
      const ok = ans.textAnswer.trim().toLowerCase() === (q.correctAnswer ?? '').trim().toLowerCase();
      return { isCorrect: ok, marksAwarded: ok ? q.marks : 0 };
    }
    default:
      return { isCorrect: null, marksAwarded: 0 };
  }
}

/** Gets or lazy-creates the shared Practice Quiz record for a subject. */
async function getOrCreatePracticeQuiz(subjectId: string, fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { subjectId, quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM' }, select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });

  const quiz = await prisma.quiz.create({
    data: {
      title: `Practice · ${subject?.name ?? subjectId}`,
      quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', subjectId,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: true, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

/** Gets or lazy-creates the shared per-class Olympiad quiz record. */
async function getOrCreateOlympiadQuiz(classId: string | null, fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { quizType: QuizType.OLYMPIAD, classId }, select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  const cls = classId ? await prisma.class.findUnique({ where: { id: classId }, select: { name: true } }) : null;

  const quiz = await prisma.quiz.create({
    data: {
      title: `Olympiad${cls ? ` · ${cls.name}` : ''}`,
      quizType: QuizType.OLYMPIAD, questionSelection: 'AUTO_RANDOM', classId,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: true, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

interface StudentAcademic { profileId: string | null; classId: string | null; educationBoard: string | null }

/** The academic context used to scope a student's quizzes. */
async function readStudentProfile(studentId: string): Promise<StudentAcademic> {
  const row = await prisma.studentProfile.findUnique({
    where: { userId: studentId }, select: { id: true, classId: true, educationBoard: true },
  });
  return { profileId: row?.id ?? null, classId: row?.classId ?? null, educationBoard: row?.educationBoard ?? null };
}

/**
 * Scope filter used by both practice and olympiad: a question matches if it is
 * the student's own class/board OR untagged (global). It is NEVER from another
 * class or board.
 */
function classBoardAnd(classId: string | null, board: string | null): Prisma.QuestionWhereInput[] {
  const and: Prisma.QuestionWhereInput[] = [];
  if (classId) and.push({ OR: [{ classId }, { classId: null }] });
  if (board)   and.push({ OR: [{ educationBoard: board }, { educationBoard: null }] });
  return and;
}

/** Olympiad questions-per-subject: DB-configurable via settings, default 5. */
async function getOlympiadPerSubject(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'olympiad.questionsPerSubject' }, select: { value: true } });
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

// ── Build result from a completed attempt ─────────────────────────────

async function buildResult(attemptId: string) {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw ApiError.notFound('Attempt not found');

  const answers = await prisma.attemptAnswer.findMany({
    where: { attemptId },
    orderBy: { createdAt: 'asc' },
    include: {
      question: {
        select: {
          type: true, prompt: true, marks: true, difficulty: true, explanation: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          correctAnswer: true, correctOptions: true, correctBoolean: true,
        },
      },
    },
  });

  const totalMarks = answers.reduce((s, a) => s + a.question.marks, 0);

  return {
    attemptId:      attempt.id,
    score:          attempt.score,
    totalMarks,
    percent:        attempt.percentage,
    correctAnswers: attempt.correctAnswers,
    wrongAnswers:   attempt.wrongAnswers,
    skipped:        attempt.skipped,
    timeTakenSec:   attempt.timeTakenSec,
    answers: answers.map((a, i) => ({
      order:        i + 1,
      questionId:   a.questionId,
      isCorrect:    a.isCorrect,
      marksAwarded: a.marksAwarded,
      yourAnswer: {
        selectedOption:  a.selectedOption,
        selectedOptions: parseStrArr(a.selectedOptions),
        textAnswer:      a.textAnswer,
        isSkipped:       Boolean(a.isSkipped),
      },
      correct: {
        type:           a.question.type,
        correctAnswer:  a.question.correctAnswer,
        correctOptions: parseStrArr(a.question.correctOptions),
        correctBoolean: a.question.correctBoolean,
      },
      question: {
        prompt:      a.question.prompt,
        options:     getOptions(a.question),
        marks:       a.question.marks,
        difficulty:  a.question.difficulty,
        explanation: a.question.explanation,
      },
    })),
  };
}

// ── Service ───────────────────────────────────────────────────────────

/**
 * Create a new quiz attempt for (quizId, studentId). The attempt number is
 * MAX(existing)+1, which is not atomic — concurrent "start" requests can pick
 * the same number and collide on the unique key. We retry a few times on the
 * duplicate-key error (P2002) so start never fails for that reason.
 */
async function createQuizAttempt(quizId: string, studentId: string): Promise<{ attemptId: string; attemptNumber: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.quizAttempt.findFirst({
      where: { quizId, studentId }, orderBy: { attemptNumber: 'desc' }, select: { attemptNumber: true },
    });
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;
    try {
      const created = await prisma.quizAttempt.create({
        data: { quizId, studentId, attemptNumber, status: AttemptStatus.IN_PROGRESS },
        select: { id: true },
      });
      return { attemptId: created.id, attemptNumber };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a quiz attempt number');
}

export const QuizService = {
  async getSubjectsWithQuestions() {
    const counts = await prisma.question.groupBy({
      by: ['subjectId', 'difficulty'],
      where: { status: 'ACTIVE', type: { in: GRADABLE_TYPES }, subjectId: { not: null } },
      _count: { _all: true },
    });

    const subjectIds = [...new Set(counts.map(c => c.subjectId).filter((id): id is string => id != null))];
    if (!subjectIds.length) return [];

    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds }, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true },
    });

    return subjects.map(s => {
      const sc     = counts.filter(c => c.subjectId === s.id);
      const easy   = sc.find(c => c.difficulty === 'EASY')?._count._all   ?? 0;
      const medium = sc.find(c => c.difficulty === 'MEDIUM')?._count._all ?? 0;
      const hard   = sc.find(c => c.difficulty === 'HARD')?._count._all   ?? 0;
      return { ...s, questionCount: easy + medium + hard, easyCount: easy, mediumCount: medium, hardCount: hard };
    });
  },

  async startPractice(studentId: string, input: StartPracticeInput) {
    const subject = await prisma.subject.findUnique({
      where: { id: input.subjectId }, select: { id: true, name: true, slug: true, kind: true },
    });
    if (!subject) throw ApiError.notFound('Subject not found');
    if (subject.kind !== 'SUBJECT') {
      throw ApiError.badRequest('This category is an Olympiad mode — use the Olympiad flow, not subject practice.');
    }

    // Scope to the student's class AND board (never other classes/boards).
    const profile = await readStudentProfile(studentId);
    const scopeAnd = classBoardAnd(profile.classId, profile.educationBoard);

    const allQuestions = await prisma.question.findMany({
      where: {
        subjectId: input.subjectId, status: 'ACTIVE', type: { in: GRADABLE_TYPES },
        ...(input.difficulty && { difficulty: input.difficulty }),
        ...(input.chapterId && { chapterId: input.chapterId }),
        ...(scopeAnd.length && { AND: scopeAnd }),
      },
    });

    if (!allQuestions.length) throw ApiError.badRequest('No questions available for this subject / class / board / difficulty');

    const selected = shuffleArray(allQuestions).slice(0, input.questionCount);
    const quizId   = await getOrCreatePracticeQuiz(input.subjectId, studentId);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId);

    // Pre-create skipped answer stubs for all selected questions.
    await prisma.attemptAnswer.createMany({
      data: selected.map(sq => ({ attemptId, questionId: sq.id, selectedOptions: '[]', isSkipped: true, isMarkedReview: false, marksAwarded: 0 })),
    });

    return {
      attemptId,
      attemptNumber,
      quizId,
      subject,
      difficulty:    input.difficulty ?? null,
      questionCount: selected.length,
      totalMarks:    selected.reduce((s, sq) => s + sq.marks, 0),
      startTime:     new Date(),
      questions:     selected.map((sq, i) => sanitizeQuestion(sq, i + 1)),
    };
  },

  async saveAnswer(attemptId: string, studentId: string, input: SaveAttemptAnswerInput) {
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, select: { studentId: true, status: true } });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.badRequest('Attempt is already finalised');

    const question = await prisma.question.findUnique({ where: { id: input.questionId } });
    if (!question) throw ApiError.notFound('Question not found');

    const hasAnswer = !!input.selectedOption || !!(input.selectedOptions?.length) || !!input.textAnswer;
    const isSkipped = input.isSkipped ?? !hasAnswer;

    const selectedOption  = input.selectedOption ?? null;
    const selectedOptions = toJson(input.selectedOptions ?? []);
    const textAnswer      = input.textAnswer ?? null;
    const timeSpentSec    = input.timeSpentSec ?? null;
    const isMarkedReview  = input.isMarkedReview ?? false;

    const { isCorrect, marksAwarded } = gradeOne(question, {
      selectedOption, selectedOptions: input.selectedOptions ?? [], textAnswer, isSkipped,
    });

    const fields = { selectedOption, selectedOptions, textAnswer, timeSpentSec, isSkipped, isMarkedReview, isCorrect, marksAwarded };
    await prisma.attemptAnswer.upsert({
      where:  { attemptId_questionId: { attemptId, questionId: input.questionId } },
      create: { attemptId, questionId: input.questionId, ...fields },
      update: fields,
    });

    return {
      ok: true, isCorrect, marksAwarded,
      feedback: {
        correctAnswer:  question.correctAnswer,
        correctOptions: parseStrArr(question.correctOptions),
        correctBoolean: question.correctBoolean,
        explanation:    question.explanation,
        options:        getOptions(question),
      },
    };
  },

  async submitAttempt(attemptId: string, studentId: string, input: SubmitAttemptInput) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId }, select: { id: true, studentId: true, status: true, quizId: true, startTime: true },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');

    if (attempt.status === AttemptStatus.SUBMITTED) return buildResult(attemptId);

    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId },
      include: {
        question: { select: { type: true, marks: true, correctAnswer: true, correctOptions: true, correctBoolean: true } },
      },
    });

    let score = 0, correct = 0, wrong = 0, skipped = 0;

    await prisma.$transaction(async (txc) => {
      for (const ans of answers) {
        const noAnswer = Boolean(ans.isSkipped) ||
          (!ans.selectedOption && !parseStrArr(ans.selectedOptions).length && !ans.textAnswer);

        if (noAnswer) {
          skipped++;
          await txc.attemptAnswer.update({ where: { id: ans.id }, data: { isSkipped: true, isCorrect: null, marksAwarded: 0 } });
          continue;
        }

        const { isCorrect, marksAwarded } = gradeOne(ans.question, {
          selectedOption:  ans.selectedOption,
          selectedOptions: parseStrArr(ans.selectedOptions),
          textAnswer:      ans.textAnswer,
          isSkipped:       false,
        });

        score += marksAwarded;
        if (isCorrect === true) correct++;
        else if (isCorrect === false) wrong++;

        await txc.attemptAnswer.update({ where: { id: ans.id }, data: { isCorrect, marksAwarded, isSkipped: false } });
      }

      const totalMarks   = answers.reduce((s, a) => s + a.question.marks, 0);
      const timeTakenSec = input.timeTakenSec ?? Math.floor((Date.now() - new Date(attempt.startTime).getTime()) / 1000);
      const percentage   = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

      await txc.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED, score, correctAnswers: correct, wrongAnswers: wrong,
          skipped, percentage, timeTakenSec, endTime: new Date(), isSubmitted: true,
        },
      });

      // Upsert leaderboard — keep best score per (quiz, student).
      const lbEntry = await txc.leaderboard.findUnique({
        where: { quizId_studentId: { quizId: attempt.quizId, studentId } }, select: { score: true },
      });
      if (!lbEntry || score > lbEntry.score) {
        const lbData = { attemptId, score, percentage, timeTakenSec: input.timeTakenSec ?? 0, attemptDate: new Date() };
        await txc.leaderboard.upsert({
          where:  { quizId_studentId: { quizId: attempt.quizId, studentId } },
          create: { quizId: attempt.quizId, studentId, ...lbData },
          update: lbData,
        });
      }
    });

    return buildResult(attemptId);
  },

  async getAttempt(attemptId: string, studentId: string) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId }, select: { id: true, studentId: true, status: true, startTime: true },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');

    if (attempt.status === AttemptStatus.SUBMITTED) return buildResult(attemptId);

    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
      include: {
        question: {
          select: {
            id: true, type: true, prompt: true, marks: true, difficulty: true,
            optionA: true, optionB: true, optionC: true, optionD: true,
            correctAnswer: true, correctOptions: true, correctBoolean: true,
          },
        },
      },
    });

    return {
      attemptId: attempt.id,
      status:    attempt.status,
      startTime: attempt.startTime,
      questions: answers.map((a, i) => sanitizeQuestion(a.question, i + 1)),
      savedAnswers: answers.map(a => ({
        questionId:      a.questionId,
        selectedOption:  a.selectedOption,
        selectedOptions: parseStrArr(a.selectedOptions),
        textAnswer:      a.textAnswer,
        isSkipped:       Boolean(a.isSkipped),
        isMarkedReview:  Boolean(a.isMarkedReview),
      })),
    };
  },

  // ── Olympiad: mixed quiz across the student's selected subjects ──────────
  async startOlympiad(studentId: string, input: StartOlympiadInput) {
    const profile = await readStudentProfile(studentId);

    const subjects = await prisma.subject.findMany({
      where: {
        kind: 'SUBJECT', status: 'ACTIVE',
        studentSubjects: { some: { studentProfileId: profile.profileId ?? '__none__' } },
      },
      orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true },
    });
    if (!subjects.length) {
      throw ApiError.badRequest('Add your subjects in your profile to start an Olympiad.');
    }

    const perSubject = input.perSubject ?? await getOlympiadPerSubject();
    const scopeAnd = classBoardAnd(profile.classId, profile.educationBoard);

    // Balanced pull: up to `perSubject` random questions from each subject,
    // strictly within the student's class + board.
    const picked: QuizQuestion[] = [];
    const distribution: { subjectId: string; subject: string; count: number }[] = [];
    for (const subj of subjects) {
      const rows = await prisma.question.findMany({
        where: {
          subjectId: subj.id, status: 'ACTIVE', type: { in: GRADABLE_TYPES },
          ...(scopeAnd.length && { AND: scopeAnd }),
        },
      });
      const pick = shuffleArray(rows).slice(0, perSubject);
      picked.push(...pick);
      distribution.push({ subjectId: subj.id, subject: subj.name, count: pick.length });
    }
    if (!picked.length) {
      throw ApiError.badRequest('No questions available for your class/board in your selected subjects yet.');
    }

    const selected = shuffleArray(picked);
    const quizId   = await getOrCreateOlympiadQuiz(profile.classId, studentId);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId);
    await prisma.attemptAnswer.createMany({
      data: selected.map(sq => ({ attemptId, questionId: sq.id, selectedOptions: '[]', isSkipped: true, isMarkedReview: false, marksAwarded: 0 })),
    });

    return {
      attemptId,
      attemptNumber,
      quizId,
      mode:          'OLYMPIAD',
      subject:       { id: 'olympiad', name: 'Practice Olympiad', slug: 'practice-olympiad' },
      difficulty:    null,
      perSubject,
      distribution,
      questionCount: selected.length,
      totalMarks:    selected.reduce((s, sq) => s + sq.marks, 0),
      startTime:     new Date(),
      questions:     selected.map((sq, i) => sanitizeQuestion(sq, i + 1)),
    };
  },

  // ── Olympiad: the logged-in student's own attempt history ───────────────
  async getOlympiadAttempts(studentId: string) {
    const rows = await prisma.quizAttempt.findMany({
      where: { studentId },
      orderBy: { startTime: 'desc' },
      include: {
        quiz: { select: { title: true, quizType: true } },
        _count: { select: { answers: true } },
      },
    });

    const relevantRows = rows.filter(r => {
      const title = (r.quiz.title ?? '').toLowerCase();
      return r.quiz.quizType === QuizType.OLYMPIAD || r.quiz.quizType === QuizType.PRACTICE || title.includes('olympiad') || title.includes('practice');
    });

    return (relevantRows.length ? relevantRows : rows).map(r => ({
      attemptId:      r.id,
      attemptNumber:  r.attemptNumber,
      status:         r.status,
      score:          r.score,
      percentage:     r.percentage,
      correctAnswers: r.correctAnswers,
      wrongAnswers:   r.wrongAnswers,
      skipped:        r.skipped,
      timeTakenSec:   r.timeTakenSec,
      startTime:      r.startTime,
      endTime:        r.endTime,
      quizTitle:      r.quiz.title,
      questionCount:  r._count.answers,
    }));
  },
};
