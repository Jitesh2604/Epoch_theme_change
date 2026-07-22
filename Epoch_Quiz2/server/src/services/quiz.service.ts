import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { QuestionType, AttemptStatus, QuizType, QuizStatus } from '../lib/enums';
import { PracticeConfig } from '../config/practiceConfig';
import { parseStrArr, toJson } from '../utils/json';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { ContentMeta } from './content.service';
import type {
  StartPracticeInput,
  PreviewPracticeInput,
  StartOlympiadInput,
  SaveAttemptAnswerInput,
  SubmitAttemptInput,
  SaveProgressInput,
  ListQuizAttemptsInput,
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

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

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
async function getOrCreatePracticeQuiz(subjectExternalId: string, subjectName: string | null, fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { subjectExternalId, quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM' }, select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: `Practice · ${subjectName ?? subjectExternalId}`,
      quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', subjectExternalId,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: true, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

/** Gets or lazy-creates the shared per-class Olympiad quiz record. */
async function getOrCreateOlympiadQuiz(classExternalId: string | null, className: string | null, fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { quizType: QuizType.OLYMPIAD, classExternalId }, select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: `Olympiad${className ? ` · ${className}` : ''}`,
      quizType: QuizType.OLYMPIAD, questionSelection: 'AUTO_RANDOM', classExternalId,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: true, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

interface StudentAcademic { profileId: string | null; classExternalId: string | null; educationBoard: string | null }

/** The academic context used to scope a student's quizzes. */
async function readStudentProfile(studentId: string): Promise<StudentAcademic> {
  const row = await prisma.studentProfile.findUnique({
    where: { userId: studentId }, select: { id: true, classExternalId: true, educationBoard: true },
  });
  return { profileId: row?.id ?? null, classExternalId: row?.classExternalId ?? null, educationBoard: row?.educationBoard ?? null };
}

/**
 * Scope filter used by both practice and olympiad: a question matches if it is
 * the student's own class/board OR untagged (global). It is NEVER from another
 * class or board. Class is matched by the Content API external id.
 */
function classBoardAnd(classExternalId: string | null, board: string | null): Prisma.QuestionWhereInput[] {
  const and: Prisma.QuestionWhereInput[] = [];
  if (classExternalId) and.push({ OR: [{ classExternalId }, { classExternalId: null }] });
  if (board)           and.push({ OR: [{ educationBoard: board }, { educationBoard: null }] });
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
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { select: { id: true, title: true, quizType: true, subjectExternalId: true } } },
  });
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

  // Resolve the subject so a history "view detail" page has the same
  // title/subject/attempt-number/timing context the history list itself
  // already shows — buildResult previously only returned score + answers,
  // with nothing identifying which quiz/attempt this even was.
  const subExtId    = attempt.quiz?.subjectExternalId ?? null;
  const subjectName = subExtId ? (await ContentMeta.subjects()).get(subExtId) ?? subExtId : null;

  return {
    attemptId:      attempt.id,
    attemptNumber:  attempt.attemptNumber,
    quiz: {
      id:       attempt.quiz?.id ?? attempt.quizId,
      title:    attempt.quiz?.title ?? 'Quiz',
      quizType: attempt.quiz?.quizType ?? null,
      subject:  subExtId ? { id: subExtId, name: subjectName ?? subExtId } : null,
    },
    startTime:      attempt.startTime,
    endTime:        attempt.endTime,
    questionCount:  answers.length,
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
/**
 * Allocate the next `attemptNumber` for a (quiz, student) pair and create the
 * attempt row — concurrency-safe.
 *
 * The naive "read MAX(attemptNumber) then INSERT MAX+1" is a race: requests
 * fired at once (double-click, React StrictMode double-mount) both read the same
 * value and collide on the `quiz_attempts_quizId_studentId_attemptNumber_key`
 * unique constraint (Prisma P2002).
 *
 * We use optimistic concurrency control: compute the next number, try to INSERT,
 * and on the unique-key race recompute and retry. A small randomised back-off
 * disperses a lock-step herd so retries converge quickly. This holds no locks
 * (unlike `SELECT … FOR UPDATE`, whose gap locks deadlock under contention) and
 * ties up no extra connections, so it degrades gracefully under load while
 * guaranteeing strictly-sequential numbers (1, 2, 3, …) with no collisions.
 */
const ATTEMPT_ALLOC_MAX_RETRIES = 25;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function createQuizAttempt(
  quizId: string, studentId: string, timeLimitSec: number | null = null,
): Promise<{ attemptId: string; attemptNumber: number }> {
  for (let attempt = 0; ; attempt++) {
    const last = await prisma.quizAttempt.findFirst({
      where: { quizId, studentId }, orderBy: { attemptNumber: 'desc' }, select: { attemptNumber: true },
    });
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;
    try {
      const created = await prisma.quizAttempt.create({
        data: { quizId, studentId, attemptNumber, status: AttemptStatus.IN_PROGRESS, timeLimitSec },
        select: { id: true },
      });
      return { attemptId: created.id, attemptNumber };
    } catch (err) {
      const isUniqueRace = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueRace && attempt < ATTEMPT_ALLOC_MAX_RETRIES) {
        await sleep(5 + Math.floor(Math.random() * 25)); // 5–30 ms jitter
        continue;
      }
      throw err;
    }
  }
}

/**
 * Rolls an in-progress pause into totalPausedSec — the "resume" half of
 * pause/resume, mirroring submission.service.ts's resolveResume(). A no-op
 * when the attempt isn't currently paused.
 */
function resolveResumeSec(pausedAt: Date | null, totalPausedSec: number): number {
  if (!pausedAt) return totalPausedSec;
  return totalPausedSec + Math.max(0, Math.floor((Date.now() - pausedAt.getTime()) / 1000));
}

export const QuizService = {
  /**
   * Subjects with at least one gradable question, scoped to `studentId`'s own
   * class/board when given (same rule as `classBoardAnd` — a question counts
   * if it's the student's class/board or untagged/global). Without this scope
   * a student could see a subject/difficulty combo here that `previewPractice`
   * / `startPractice` then rejects with "No questions available", because
   * those calls apply the class/board scope but this listing didn't.
   */
  async getSubjectsWithQuestions(studentId?: string) {
    const profile = studentId ? await readStudentProfile(studentId) : null;
    const scopeAnd = profile ? classBoardAnd(profile.classExternalId, profile.educationBoard) : [];

    const counts = await prisma.question.groupBy({
      by: ['subjectExternalId', 'difficulty'],
      where: {
        status: 'ACTIVE', type: { in: GRADABLE_TYPES }, subjectExternalId: { not: null },
        ...(scopeAnd.length && { AND: scopeAnd }),
      },
      _count: { _all: true },
    });

    const subjectIds = [...new Set(counts.map(c => c.subjectExternalId).filter((id): id is string => id != null))];
    if (!subjectIds.length) return [];

    // Resolve subject display names from the live (cached) Content API. Subjects
    // no longer exist locally, so a subject with questions but no live catalog
    // entry falls back to its external id as the name.
    const subjectNames = await ContentMeta.subjects();

    return subjectIds
      .map(extId => {
        const name = subjectNames.get(extId) ?? extId;
        const sc     = counts.filter(c => c.subjectExternalId === extId);
        const easy   = sc.find(c => c.difficulty === 'EASY')?._count._all   ?? 0;
        const medium = sc.find(c => c.difficulty === 'MEDIUM')?._count._all ?? 0;
        const hard   = sc.find(c => c.difficulty === 'HARD')?._count._all   ?? 0;
        return { id: extId, name, slug: slugify(name), questionCount: easy + medium + hard, easyCount: easy, mediumCount: medium, hardCount: hard };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Read-only quiz-overview data for the confirm screen shown before an
   * attempt exists — same subject/difficulty resolution as `startPractice`,
   * but creates nothing (no attempt row, no time-limit clock started).
   *
   * Always previews a fresh hypothetical attempt, even if the student has a
   * paused one open on this subject — Start Quiz always starts new. Resuming
   * a paused attempt is a separate, explicit action (see listPaused/
   * getAttempt), never something Start Quiz does automatically.
   */
  async previewPractice(studentId: string, input: PreviewPracticeInput) {
    const subjectNames = await ContentMeta.subjects();
    const subjectName = subjectNames.get(input.subjectExternalId) ?? null;
    const mode = await prisma.olympiadMode.findFirst({ where: { id: input.subjectExternalId }, select: { id: true } });
    if (mode) {
      throw ApiError.badRequest('This category is an Olympiad mode — use the Olympiad flow, not subject practice.');
    }

    const profile = await readStudentProfile(studentId);
    const scopeAnd = classBoardAnd(profile.classExternalId, profile.educationBoard);

    const matching = await prisma.question.findMany({
      where: {
        subjectExternalId: input.subjectExternalId, status: 'ACTIVE', type: { in: GRADABLE_TYPES },
        difficulty: input.difficulty,
        ...(scopeAnd.length && { AND: scopeAnd }),
      },
      select: { marks: true },
    });
    if (!matching.length) throw ApiError.badRequest('No questions available for this subject / class / board / difficulty');

    const config       = PracticeConfig[input.difficulty];
    const questionCount = Math.min(config.questionCount, matching.length);
    const avgMarks      = matching.reduce((s, q) => s + q.marks, 0) / matching.length;

    return {
      subject:          { id: input.subjectExternalId, name: subjectName ?? input.subjectExternalId },
      difficulty:        input.difficulty,
      questionCount,
      timeLimitSec:      config.timeLimitMinutes * 60,
      totalMarks:        Math.round(questionCount * avgMarks * 100) / 100,
      marksPerQuestion:  Math.round(avgMarks * 100) / 100,
      negativeMarking:   false,
    };
  },

  async startPractice(studentId: string, input: StartPracticeInput) {
    // input.subjectExternalId is a Content API subject external id. Resolve its
    // display name and reject Olympiad modes (which are app-owned, not subjects).
    const subjectNames = await ContentMeta.subjects();
    const subjectName = subjectNames.get(input.subjectExternalId) ?? null;
    const mode = await prisma.olympiadMode.findFirst({ where: { id: input.subjectExternalId }, select: { id: true } });
    if (mode) {
      throw ApiError.badRequest('This category is an Olympiad mode — use the Olympiad flow, not subject practice.');
    }

    const quizId = await getOrCreatePracticeQuiz(input.subjectExternalId, subjectName, studentId);

    // Always starts a brand-new attempt, even if the student already has one
    // paused on this subject — Start Quiz and Resume are deliberately
    // separate actions (see listPaused). Practice/Olympiad have always
    // allowed multiple attempts over time (attemptNumber increments), so
    // this is consistent with that, not a new allowance.

    // Scope to the student's class AND board (never other classes/boards).
    const profile = await readStudentProfile(studentId);
    const scopeAnd = classBoardAnd(profile.classExternalId, profile.educationBoard);

    const allQuestions = await prisma.question.findMany({
      where: {
        subjectExternalId: input.subjectExternalId, status: 'ACTIVE', type: { in: GRADABLE_TYPES },
        ...(input.difficulty && { difficulty: input.difficulty }),
        ...(input.chapterExternalId && { chapterExternalId: input.chapterExternalId }),
        ...(scopeAnd.length && { AND: scopeAnd }),
      },
    });

    if (!allQuestions.length) throw ApiError.badRequest('No questions available for this subject / class / board / difficulty');

    // Question count and time limit are backend-controlled per difficulty —
    // the client never supplies or overrides these values.
    const config       = PracticeConfig[input.difficulty];
    const timeLimitSec = config.timeLimitMinutes * 60;

    const subject = { id: input.subjectExternalId, name: subjectName ?? input.subjectExternalId, slug: slugify(subjectName ?? input.subjectExternalId), kind: 'SUBJECT' };
    const selected = shuffleArray(allQuestions).slice(0, config.questionCount);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId, timeLimitSec);

    // Pre-create skipped answer stubs for all selected questions.
    await prisma.attemptAnswer.createMany({
      data: selected.map(sq => ({ attemptId, questionId: sq.id, selectedOptions: '[]', isSkipped: true, isMarkedReview: false, marksAwarded: 0 })),
    });

    return {
      attemptId,
      attemptNumber,
      quizId,
      subject,
      difficulty:    input.difficulty,
      questionCount: selected.length,
      timeLimitSec,
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

    // Submitting locks the question in — isSubmitted flips true and any
    // in-progress draft (from the pause/progress autosave) is cleared since
    // the real, graded answer now supersedes it.
    const fields = {
      selectedOption, selectedOptions, textAnswer, timeSpentSec, isSkipped, isMarkedReview, isCorrect, marksAwarded,
      isSubmitted: true, draftSelectedOption: null, draftSelectedOptions: null, draftTextAnswer: null,
    };
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

  /**
   * Debounced continuous autosave (paused omitted) and the explicit Pause
   * action (paused: true) share this one call — mirrors
   * SubmissionService.pause(). Never grades or locks a question; that only
   * happens via saveAnswer.
   */
  async saveProgress(attemptId: string, studentId: string, input: SaveProgressInput) {
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, select: { studentId: true, status: true } });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.badRequest('Attempt is already finalised');

    await prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        currentQuestionIndex: input.currentQuestionIndex,
        ...(input.paused ? { pausedAt: new Date() } : {}),
      },
    });

    if (input.draft) {
      const existing = await prisma.attemptAnswer.findUnique({
        where: { attemptId_questionId: { attemptId, questionId: input.draft.questionId } },
        select: { id: true, isSubmitted: true },
      });
      // Only ever draft onto a pre-created stub row for a question that's
      // actually part of this attempt, and only while it's still unlocked.
      if (existing && !existing.isSubmitted) {
        await prisma.attemptAnswer.update({
          where: { id: existing.id },
          data: {
            draftSelectedOption:  input.draft.selectedOption ?? null,
            draftSelectedOptions: input.draft.selectedOptions ? toJson(input.draft.selectedOptions) : null,
            draftTextAnswer:      input.draft.textAnswer ?? null,
          },
        });
      }
    }

    return { ok: true };
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
    });

    return buildResult(attemptId);
  },

  async getAttempt(attemptId: string, studentId: string) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true, studentId: true, status: true, startTime: true, attemptNumber: true, quizId: true, timeLimitSec: true,
        pausedAt: true, totalPausedSec: true, currentQuestionIndex: true,
        quiz: { select: { subjectExternalId: true } },
      },
    });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');

    if (attempt.status === AttemptStatus.SUBMITTED) return buildResult(attemptId);

    // Re-entering an IN_PROGRESS attempt (refresh, or startPractice/
    // startOlympiad finding one already open) doubles as "resume": roll any
    // paused interval into totalPausedSec and clear pausedAt.
    let totalPausedSec = attempt.totalPausedSec;
    if (attempt.pausedAt) {
      totalPausedSec = resolveResumeSec(attempt.pausedAt, attempt.totalPausedSec);
      await prisma.quizAttempt.update({ where: { id: attemptId }, data: { pausedAt: null, totalPausedSec } });
    }
    // Shift the timer anchor forward by the accumulated paused time so the
    // client's existing useCountdown(startTime, timeLimitSec) formula needs
    // no changes — it just receives an already-adjusted startTime.
    const effectiveStartTime = new Date(attempt.startTime.getTime() + totalPausedSec * 1000);

    const answers = await prisma.attemptAnswer.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
      include: {
        question: {
          select: {
            id: true, type: true, prompt: true, marks: true, difficulty: true,
            optionA: true, optionB: true, optionC: true, optionD: true,
            correctAnswer: true, correctOptions: true, correctBoolean: true, explanation: true,
          },
        },
      },
    });

    // Resolve the subject so the client renders identically whether the attempt
    // arrives via router state (from /start) or is re-fetched here on refresh /
    // direct navigation. Missing this `subject` was crashing the play page.
    const subExtId    = attempt.quiz?.subjectExternalId ?? null;
    const subjectName = subExtId ? (await ContentMeta.subjects()).get(subExtId) ?? subExtId : 'Practice';
    const questions   = answers.map((a, i) => sanitizeQuestion(a.question, i + 1));

    return {
      attemptId:     attempt.id,
      attemptNumber: attempt.attemptNumber,
      quizId:        attempt.quizId,
      subject:       { id: subExtId, name: subjectName, slug: slugify(subjectName) },
      difficulty:    null,
      questionCount: questions.length,
      timeLimitSec:  attempt.timeLimitSec,
      totalMarks:    answers.reduce((sum, a) => sum + a.question.marks, 0),
      status:        attempt.status,
      startTime:     effectiveStartTime,
      currentQuestionIndex: attempt.currentQuestionIndex,
      questions,
      savedAnswers: answers.map(a => ({
        questionId:      a.questionId,
        selectedOption:  a.selectedOption,
        selectedOptions: parseStrArr(a.selectedOptions),
        textAnswer:      a.textAnswer,
        isSkipped:       Boolean(a.isSkipped),
        isMarkedReview:  Boolean(a.isMarkedReview),
        isSubmitted:     Boolean(a.isSubmitted),
        draftSelectedOption:  a.draftSelectedOption,
        draftSelectedOptions: parseStrArr(a.draftSelectedOptions ?? '[]'),
        draftTextAnswer:      a.draftTextAnswer,
        // Only meaningful once isSubmitted — lets a resumed session show the
        // exact same feedback panel a fresh submit would, without asking the
        // client to re-derive grading from raw correct-answer data.
        isCorrect:      a.isCorrect,
        marksAwarded:   a.marksAwarded,
        feedback: Boolean(a.isSubmitted) ? {
          correctAnswer:  a.question.correctAnswer,
          correctOptions: parseStrArr(a.question.correctOptions),
          correctBoolean: a.question.correctBoolean,
          explanation:    a.question.explanation,
          options:        getOptions(a.question),
        } : null,
      })),
    };
  },

  // ── Olympiad: mixed quiz across the student's selected subjects ──────────
  async startOlympiad(studentId: string, input: StartOlympiadInput) {
    const profile = await readStudentProfile(studentId);

    // The student's chosen subjects are stored as Content API external ids.
    const chosen = await prisma.studentSubject.findMany({
      where: { studentProfileId: profile.profileId ?? '__none__' },
      select: { subjectExternalId: true },
    });
    if (!chosen.length) {
      throw ApiError.badRequest('Add your subjects in your profile to start an Olympiad.');
    }
    const subjectNames = await ContentMeta.subjects();
    const subjects = chosen
      .map(c => ({ id: c.subjectExternalId, name: subjectNames.get(c.subjectExternalId) ?? c.subjectExternalId }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const perSubject = input.perSubject ?? await getOlympiadPerSubject();

    // Always builds a brand-new mixed set, even if the student already has a
    // paused Olympiad attempt open — Start/Attempt Olympiad and Resume are
    // deliberately separate actions (see listPaused). Resuming a specific
    // paused attempt goes through getAttempt directly, keyed by its own id.
    const className = await ContentMeta.className(profile.classExternalId);
    const quizId = await getOrCreateOlympiadQuiz(profile.classExternalId, className, studentId);

    const scopeAnd = classBoardAnd(profile.classExternalId, profile.educationBoard);

    // Balanced pull: up to `perSubject` random questions from each subject,
    // strictly within the student's class + board.
    const picked: QuizQuestion[] = [];
    const distribution: { subjectId: string; subject: string; count: number }[] = [];
    for (const subj of subjects) {
      const rows = await prisma.question.findMany({
        where: {
          subjectExternalId: subj.id, status: 'ACTIVE', type: { in: GRADABLE_TYPES },
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
      quizType:       r.quiz.quizType,
      questionCount:  r._count.answers,
    }));
  },

  /**
   * The student's own paused/in-progress attempts, across both Practice and
   * Olympiad — the data behind the "Resume Paused Quizzes" section. Start
   * Quiz / Attempt Olympiad never surface or touch these automatically;
   * resuming one is always an explicit click through this list (see
   * getAttempt, called directly with the attemptId). Capped at a fixed
   * count rather than paginated — this is a small home-page widget, not a
   * full report, but the cap keeps it bounded regardless of how many stack
   * up over time.
   */
  async listPaused(studentId: string) {
    const rows = await prisma.quizAttempt.findMany({
      where: { studentId, status: AttemptStatus.IN_PROGRESS },
      orderBy: { startTime: 'desc' },
      take: 20,
      include: {
        quiz: { select: { id: true, title: true, quizType: true, subjectExternalId: true } },
        _count: { select: { answers: true } },
      },
    });
    if (!rows.length) return [];

    const subjectNames = await ContentMeta.subjects();
    return rows.map(r => ({
      attemptId:            r.id,
      attemptNumber:        r.attemptNumber,
      quiz: {
        id:       r.quiz.id,
        title:    r.quiz.title,
        quizType: r.quiz.quizType,
        subject:  r.quiz.subjectExternalId
          ? { id: r.quiz.subjectExternalId, name: subjectNames.get(r.quiz.subjectExternalId) ?? r.quiz.subjectExternalId }
          : null,
      },
      startTime:            r.startTime,
      pausedAt:             r.pausedAt,
      currentQuestionIndex: r.currentQuestionIndex,
      timeLimitSec:         r.timeLimitSec,
      questionCount:        r._count.answers,
    }));
  },

  /**
   * Explicitly abandon a paused attempt (the "Discard" action) — soft-deletes
   * by status, same as any other abandoned attempt, so it still shows up in
   * the admin report rather than disappearing. Only the owning student can
   * discard their own attempt, and only while it's still IN_PROGRESS.
   */
  async discard(attemptId: string, studentId: string) {
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, select: { studentId: true, status: true } });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.badRequest('Attempt is already finalised');

    await prisma.quizAttempt.update({ where: { id: attemptId }, data: { status: AttemptStatus.ABANDONED } });
    return { ok: true };
  },

  /**
   * Admin-only, cross-student report over every Practice/Olympiad attempt —
   * the QuizAttempt equivalent of SubmissionService.list. Unlike
   * getOlympiadAttempts (one student's own history), this is built for
   * scale: real server-side pagination/filtering/sorting, nothing loaded
   * beyond one page. No teacher-scoping branch — Practice/Olympiad quizzes
   * aren't teacher-owned (see getOrCreatePracticeQuiz/getOrCreateOlympiadQuiz,
   * both fall back to an admin createdById).
   */
  async list(query: ListQuizAttemptsInput) {
    const { page, limit, status, quizType, studentId, subjectExternalId, dateFrom, dateTo, sortBy } = query;

    const where: Prisma.QuizAttemptWhereInput = {
      ...(status && { status }),
      ...(studentId && { studentId }),
      ...((quizType || subjectExternalId) && {
        quiz: {
          ...(quizType && { quizType }),
          ...(subjectExternalId && { subjectExternalId }),
        },
      }),
      ...((dateFrom || dateTo) && {
        startTime: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const orderBy: Prisma.QuizAttemptOrderByWithRelationInput =
      sortBy === 'score_desc' ? { score: 'desc' } :
      sortBy === 'score_asc'  ? { score: 'asc' }  :
      sortBy === 'time_desc'  ? { timeTakenSec: 'desc' } :
      sortBy === 'time_asc'   ? { timeTakenSec: 'asc' }  :
      { startTime: 'desc' }; // 'latest' (default)

    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total, subjectNames] = await Promise.all([
      prisma.quizAttempt.findMany({
        where, orderBy, skip, take,
        include: {
          student: { select: { id: true, name: true, email: true } },
          quiz:    { select: { id: true, title: true, quizType: true, subjectExternalId: true } },
        },
      }),
      prisma.quizAttempt.count({ where }),
      ContentMeta.subjects(),
    ]);

    const items = rows.map(r => ({
      id:             r.id,
      attemptNumber:  r.attemptNumber,
      student:        { id: r.student.id, name: r.student.name, email: r.student.email },
      quiz: {
        id:      r.quiz.id,
        title:   r.quiz.title,
        quizType: r.quiz.quizType,
        subject: r.quiz.subjectExternalId
          ? { id: r.quiz.subjectExternalId, name: subjectNames.get(r.quiz.subjectExternalId) ?? r.quiz.subjectExternalId }
          : null,
      },
      status:         r.status,
      startTime:      r.startTime,
      endTime:        r.endTime,
      timeTakenSec:   r.timeTakenSec,
      score:          r.score,
      percentage:     r.percentage,
      correctAnswers: r.correctAnswers,
      wrongAnswers:   r.wrongAnswers,
      skipped:        r.skipped,
      isSubmitted:    r.isSubmitted,
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },
};
