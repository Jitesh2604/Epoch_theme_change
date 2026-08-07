import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { QuestionType, AttemptStatus, QuizType, QuizStatus, Difficulty } from '../lib/enums';
import { PracticeConfig } from '../config/practiceConfig';
import { parseStrArr, toJson } from '../utils/json';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { ContentMeta, UNKNOWN_SUBJECT_NAME } from './content.service';
import { RevisionService } from './revision.service';
import { REVISION_SECONDS_PER_QUESTION } from '../config/revisionConfig';
import type {
  StartPracticeInput,
  PreviewPracticeInput,
  StartOlympiadInput,
  PreviewMixedPracticeInput,
  StartMixedPracticeInput,
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

// Exported for Feature A1 (Admin Dashboard) — reused as-is to check whether
// Practice/Olympiad has any question it could actually draw from, the same
// definition every start*/preview* method here already scopes against.
export const GRADABLE_TYPES: QuestionType[] = [
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
      title: `Practice · ${subjectName ?? UNKNOWN_SUBJECT_NAME}`,
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

/**
 * Gets or lazy-creates the shared Mixed Subjects Practice quiz record — one
 * global row (not per-subject, not per-class), discriminated by having no
 * subject at all. Safe: getOrCreatePracticeQuiz/getOrCreateOlympiadQuiz above
 * are the only other writers of Quiz rows anywhere in the server.
 */
async function getOrCreateMixedPracticeQuiz(fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { subjectExternalId: null, quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM' }, select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: 'Mixed Subjects Practice',
      quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', subjectExternalId: null,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: true, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

/**
 * Gets or lazy-creates the shared "Retry Practice" quiz record — one global
 * row (like getOrCreateMixedPracticeQuiz), used for every Feature 12 retry
 * session regardless of which subject(s) the source attempt's wrong/skipped
 * questions came from. A retry set can legitimately span several subjects
 * (e.g. retrying a Mixed Subjects Practice attempt's mistakes), so — same
 * reasoning as Mixed Subjects Practice — there's no single subjectExternalId
 * to hang a quiz off of.
 */
async function getOrCreateRetryPracticeQuiz(fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { subjectExternalId: null, quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', title: 'Retry Practice' },
    select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: 'Retry Practice',
      quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', subjectExternalId: null,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: false, duration: 0,
    },
    select: { id: true },
  });
  return quiz.id;
}

/**
 * Time budget for a Feature 12 retry session — there's no PracticeConfig
 * entry for "retry" (that table is keyed by Difficulty, and a retry set can
 * mix difficulties), so this is its own documented per-question allowance
 * instead. Tune here only.
 */
const RETRY_SECONDS_PER_QUESTION = 90;

/**
 * Gets or lazy-creates the shared "Revision Session" quiz record — one
 * global row, same reasoning as getOrCreateRetryPracticeQuiz (a revision set
 * can span several subjects/difficulties). Its title is also the marker
 * submitAttempt() checks to know a just-submitted attempt is a Revision
 * Session, so RevisionService.recordSessionCompletion runs for it and not
 * for ordinary Practice/Mixed/Retry attempts.
 */
async function getOrCreateRevisionQuiz(fallbackUserId: string): Promise<string> {
  const existing = await prisma.quiz.findFirst({
    where: { subjectExternalId: null, quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', title: 'Revision Session' },
    select: { id: true },
  });
  if (existing) return existing.id;

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'PUBLICATION_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });

  const quiz = await prisma.quiz.create({
    data: {
      title: 'Revision Session',
      quizType: QuizType.PRACTICE, questionSelection: 'AUTO_RANDOM', subjectExternalId: null,
      status: QuizStatus.PUBLISHED, createdById: admin?.id ?? fallbackUserId, leaderboardEnabled: false, duration: 0,
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

/**
 * Balanced pull across every Practice subject for Mixed Subjects Practice:
 * find every subject with a gradable, scoped question at this difficulty,
 * pull up to an even share from each, flatten, reshuffle, and trim to the
 * same total PracticeConfig[difficulty] gives a single-subject Practice
 * attempt — so a mixed attempt costs the same time/question budget, just
 * sourced from multiple subjects instead of one.
 */
async function pickMixedQuestions(
  classExternalId: string | null, board: string | null, difficulty: Difficulty,
): Promise<QuizQuestion[]> {
  const scopeAnd = classBoardAnd(classExternalId, board);
  const baseWhere = {
    status: 'ACTIVE' as const, type: { in: GRADABLE_TYPES }, difficulty,
    ...(scopeAnd.length && { AND: scopeAnd }),
  };

  const subjectRows = await prisma.question.findMany({
    where: { ...baseWhere, subjectExternalId: { not: null } },
    select: { subjectExternalId: true },
    distinct: ['subjectExternalId'],
  });
  const subjectIds = subjectRows.map(r => r.subjectExternalId!);
  if (!subjectIds.length) return [];

  const target     = PracticeConfig[difficulty].questionCount;
  const perSubject = Math.max(1, Math.ceil(target / subjectIds.length));

  const picked: QuizQuestion[] = [];
  for (const subjectExternalId of subjectIds) {
    const rows = await prisma.question.findMany({ where: { ...baseWhere, subjectExternalId } });
    picked.push(...shuffleArray(rows).slice(0, perSubject));
  }

  return shuffleArray(picked).slice(0, target);
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
          // Feature 12 (Practice Review & Mistake Analysis) — per-question
          // subject, needed for the Review screen's Subject filter on Mixed/
          // Retry attempts, which span more than one subject. Everything
          // else here was already selected; this is the one addition.
          subjectExternalId: true,
        },
      },
    },
  });

  const totalMarks = answers.reduce((s, a) => s + a.question.marks, 0);

  // Resolve the subject so a history "view detail" page has the same
  // title/subject/attempt-number/timing context the history list itself
  // already shows — buildResult previously only returned score + answers,
  // with nothing identifying which quiz/attempt this even was.
  const subjectNames = await ContentMeta.subjects();
  const subExtId    = attempt.quiz?.subjectExternalId ?? null;
  const subjectName = subExtId ? subjectNames.get(subExtId) ?? UNKNOWN_SUBJECT_NAME : null;

  return {
    attemptId:      attempt.id,
    attemptNumber:  attempt.attemptNumber,
    quiz: {
      id:       attempt.quiz?.id ?? attempt.quizId,
      title:    attempt.quiz?.title ?? 'Quiz',
      quizType: attempt.quiz?.quizType ?? null,
      subject:  subExtId ? { id: subExtId, name: subjectName ?? UNKNOWN_SUBJECT_NAME } : null,
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
    // Feature 12 (Practice Review & Mistake Analysis) — the attempt's original
    // time budget, needed by the client's mistake-classification engine (a
    // "Time Pressure" read compares timeTakenSec against this). Already on
    // the same `attempt` row fetched above; not a new query.
    timeLimitSec:   attempt.timeLimitSec,
    answers: answers.map((a, i) => ({
      order:        i + 1,
      questionId:   a.questionId,
      isCorrect:    a.isCorrect,
      marksAwarded: a.marksAwarded,
      // Feature 12 (Practice Review & Mistake Analysis) — shown "if
      // available" per the spec: AttemptAnswer.timeSpentSec is optional and
      // frequently null (rarely sent by the client — see the note on
      // fetchPracticeAnswerRows in analytics.service.ts), so this is
      // deliberately not relied on for the mistake-classification engine's
      // "Time Pressure" rule, only surfaced here as an optional display value.
      timeSpentSec: a.timeSpentSec,
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
        subject:     a.question.subjectExternalId
          ? { id: a.question.subjectExternalId, name: subjectNames.get(a.question.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME }
          : null,
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
    // entry falls back to UNKNOWN_SUBJECT_NAME, never the raw external id.
    const subjectNames = await ContentMeta.subjects();

    return subjectIds
      .map(extId => {
        const name = subjectNames.get(extId) ?? UNKNOWN_SUBJECT_NAME;
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
   * paused one open on this subject — Start Quiz always starts new.
   */
  async previewPractice(studentId: string, input: PreviewPracticeInput) {
    const subjectNames = await ContentMeta.subjects();
    const subjectName = subjectNames.get(input.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME;
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
      subject:          { id: input.subjectExternalId, name: subjectName },
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
    const subjectName = subjectNames.get(input.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME;
    const mode = await prisma.olympiadMode.findFirst({ where: { id: input.subjectExternalId }, select: { id: true } });
    if (mode) {
      throw ApiError.badRequest('This category is an Olympiad mode — use the Olympiad flow, not subject practice.');
    }

    const quizId = await getOrCreatePracticeQuiz(input.subjectExternalId, subjectName, studentId);

    // Always starts a brand-new attempt, even if the student already has one
    // paused on this subject. Practice/Olympiad have always allowed multiple
    // attempts over time (attemptNumber increments), so this is consistent
    // with that, not a new allowance.

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

    const subject = { id: input.subjectExternalId, name: subjectName, slug: slugify(subjectName), kind: 'SUBJECT' };
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

  // ── Mixed Subjects Practice: a single-difficulty Practice attempt drawn
  //    from a balanced pull across every eligible Practice subject, instead
  //    of one — otherwise identical to Practice (own attempt, own timer,
  //    pause/resume, history). See pickMixedQuestions/getOrCreateMixedPracticeQuiz. ──

  /** Read-only overview for the confirm screen — same contract as previewPractice. */
  async previewMixedPractice(studentId: string, input: PreviewMixedPracticeInput) {
    const profile = await readStudentProfile(studentId);
    const matching = await pickMixedQuestions(profile.classExternalId, profile.educationBoard, input.difficulty);
    if (!matching.length) throw ApiError.badRequest('No practice questions available for your class/board at this difficulty yet.');

    const config        = PracticeConfig[input.difficulty];
    const questionCount = Math.min(config.questionCount, matching.length);
    const avgMarks       = matching.reduce((s, q) => s + q.marks, 0) / matching.length;

    return {
      subject:          { id: 'mixed', name: 'Mixed Subjects Practice' },
      difficulty:        input.difficulty,
      questionCount,
      timeLimitSec:      config.timeLimitMinutes * 60,
      totalMarks:        Math.round(questionCount * avgMarks * 100) / 100,
      marksPerQuestion:  Math.round(avgMarks * 100) / 100,
      negativeMarking:   false,
    };
  },

  async startMixedPractice(studentId: string, input: StartMixedPracticeInput) {
    const quizId  = await getOrCreateMixedPracticeQuiz(studentId);
    const profile = await readStudentProfile(studentId);
    const selected = await pickMixedQuestions(profile.classExternalId, profile.educationBoard, input.difficulty);
    if (!selected.length) throw ApiError.badRequest('No practice questions available for your class/board at this difficulty yet.');

    const config       = PracticeConfig[input.difficulty];
    const timeLimitSec = config.timeLimitMinutes * 60;
    const subject      = { id: 'mixed', name: 'Mixed Subjects Practice', slug: 'mixed-subjects-practice' };

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId, timeLimitSec);

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
      where: { id: attemptId },
      select: { id: true, studentId: true, status: true, quizId: true, startTime: true, quiz: { select: { title: true } } },
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
    // Feature 13 (Revision Center) — collected alongside grading below, no
    // second pass over the answers: only consumed if this turns out to be a
    // Revision Session attempt (checked after the transaction commits).
    const revisionResults: { questionId: string; isCorrect: boolean | null; isSkipped: boolean }[] = [];

    await prisma.$transaction(async (txc) => {
      for (const ans of answers) {
        const noAnswer = Boolean(ans.isSkipped) ||
          (!ans.selectedOption && !parseStrArr(ans.selectedOptions).length && !ans.textAnswer);

        if (noAnswer) {
          skipped++;
          revisionResults.push({ questionId: ans.questionId, isCorrect: null, isSkipped: true });
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
        revisionResults.push({ questionId: ans.questionId, isCorrect, isSkipped: false });

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

    // Feature 13 — a Revision Session attempt (identified the same way
    // Retry is, by its lazy-singleton quiz's title) advances/resets each
    // revised question's spaced-repetition schedule and updates the
    // revision streak. Runs after the attempt's own transaction commits, so
    // a revision-bookkeeping issue never blocks the attempt submission
    // itself; reuses the grading results just computed, no re-fetch.
    if (attempt.quiz?.title === 'Revision Session') {
      await RevisionService.recordSessionCompletion(studentId, revisionResults);
    }

    return buildResult(attemptId);
  },

  async getAttempt(attemptId: string, studentId: string) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true, studentId: true, status: true, startTime: true, attemptNumber: true, quizId: true, timeLimitSec: true,
        pausedAt: true, totalPausedSec: true, currentQuestionIndex: true,
        quiz: { select: { subjectExternalId: true, quizType: true } },
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
    // A null subjectExternalId means either Attempt Olympiad's mixed set or
    // Mixed Subjects Practice — quizType is what tells the two apart.
    const subExtId    = attempt.quiz?.subjectExternalId ?? null;
    const subjectName = subExtId
      ? (await ContentMeta.subjects()).get(subExtId) ?? UNKNOWN_SUBJECT_NAME
      : attempt.quiz?.quizType === QuizType.OLYMPIAD ? 'Practice Olympiad' : 'Mixed Subjects Practice';
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

  /**
   * Feature 12 (Practice Review & Mistake Analysis) — "Practice Incorrect
   * Questions Again". Builds a brand-new attempt from a past attempt's own
   * wrong/skipped questions, reusing the exact same Question rows (no
   * duplication) and never touching the source attempt itself.
   *
   * The scope (`wrong`/`skipped`/`both`) is applied server-side against the
   * source attempt's real AttemptAnswer rows — the client only ever sends
   * `attemptId` + `scope`, never a question-id list, so there is nothing to
   * validate/trust from client input beyond "this attempt belongs to this
   * student and is submitted." This is simpler and safer than accepting an
   * arbitrary question-id list from the client.
   */
  async startRetry(studentId: string, sourceAttemptId: string, scope: 'wrong' | 'skipped' | 'both') {
    const source = await prisma.quizAttempt.findUnique({
      where: { id: sourceAttemptId },
      select: { id: true, studentId: true, status: true },
    });
    if (!source) throw ApiError.notFound('Attempt not found');
    if (source.studentId !== studentId) throw ApiError.forbidden('Not your attempt');
    if (source.status !== AttemptStatus.SUBMITTED) throw ApiError.badRequest('Attempt is not yet submitted');

    const sourceAnswers = await prisma.attemptAnswer.findMany({
      where: { attemptId: sourceAttemptId },
      select: { questionId: true, isCorrect: true, isSkipped: true },
    });

    const matches = (a: (typeof sourceAnswers)[number]) => {
      if (scope === 'wrong')   return a.isCorrect === false;
      if (scope === 'skipped') return Boolean(a.isSkipped);
      return a.isCorrect === false || Boolean(a.isSkipped);
    };
    const questionIds = [...new Set(sourceAnswers.filter(matches).map(a => a.questionId))];
    if (!questionIds.length) {
      throw ApiError.badRequest('No wrong or skipped questions to retry for this attempt.');
    }

    // Re-fetch the actual Question rows fresh (not the source attempt's old
    // snapshot) — same status:'ACTIVE' guard every other start* path applies,
    // so a question retired since the original attempt is simply dropped
    // rather than resurfaced.
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, status: 'ACTIVE' },
    });
    if (!questions.length) {
      throw ApiError.badRequest('None of this attempt\'s wrong/skipped questions are still available to retry.');
    }

    const quizId = await getOrCreateRetryPracticeQuiz(studentId);
    const timeLimitSec = questions.length * RETRY_SECONDS_PER_QUESTION;
    const selected = shuffleArray(questions);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId, timeLimitSec);
    await prisma.attemptAnswer.createMany({
      data: selected.map(sq => ({ attemptId, questionId: sq.id, selectedOptions: '[]', isSkipped: true, isMarkedReview: false, marksAwarded: 0 })),
    });

    return {
      attemptId,
      attemptNumber,
      quizId,
      subject:       { id: 'retry', name: 'Retry: Wrong & Skipped Questions', slug: 'retry-practice' },
      difficulty:    null,
      scope,
      sourceAttemptId,
      questionCount: selected.length,
      timeLimitSec,
      totalMarks:    selected.reduce((s, sq) => s + sq.marks, 0),
      startTime:     new Date(),
      questions:     selected.map((sq, i) => sanitizeQuestion(sq, i + 1)),
    };
  },

  /**
   * Feature 13 (Revision Center & Spaced Revision) — "Start Today's
   * Revision". Reuses the exact same Question rows the Revision Center
   * dashboard already surfaced as due, via RevisionService.getDueQuestionIds
   * (which itself syncs the queue first) — no duplicate discovery logic
   * here, and no new Question records created.
   */
  async startRevisionSession(studentId: string) {
    const questionIds = await RevisionService.getDueQuestionIds(studentId);
    if (!questionIds.length) {
      throw ApiError.badRequest('No revision questions are due right now.');
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, status: 'ACTIVE' },
    });
    if (!questions.length) {
      throw ApiError.badRequest('None of your due revision questions are still available.');
    }

    const quizId = await getOrCreateRevisionQuiz(studentId);
    const timeLimitSec = questions.length * REVISION_SECONDS_PER_QUESTION;
    const selected = shuffleArray(questions);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId, timeLimitSec);
    await prisma.attemptAnswer.createMany({
      data: selected.map(sq => ({ attemptId, questionId: sq.id, selectedOptions: '[]', isSkipped: true, isMarkedReview: false, marksAwarded: 0 })),
    });

    return {
      attemptId,
      attemptNumber,
      quizId,
      subject:       { id: 'revision', name: "Today's Revision", slug: 'revision-session' },
      difficulty:    null,
      questionCount: selected.length,
      timeLimitSec,
      totalMarks:    selected.reduce((s, sq) => s + sq.marks, 0),
      startTime:     new Date(),
      questions:     selected.map((sq, i) => sanitizeQuestion(sq, i + 1)),
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
      .map(c => ({ id: c.subjectExternalId, name: subjectNames.get(c.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const perSubject = input.perSubject ?? await getOlympiadPerSubject();

    // Always builds a brand-new mixed set, even if the student already has a
    // paused Olympiad attempt open.
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
        quiz: { select: { title: true, quizType: true, subjectExternalId: true } },
        _count: { select: { answers: true } },
        // Feature 12 (Practice Review & Mistake Analysis) — Attempt History
        // needs each attempt's difficulty. Not persisted on QuizAttempt/Quiz
        // (only Question carries difficulty), and every non-retry Practice/
        // Mixed/Olympiad attempt is built from one difficulty tier by
        // construction (startPractice/startMixedPractice/startOlympiad all
        // select a single Difficulty per attempt) — one representative row
        // is enough, not a full scan. Retry attempts (which can mix
        // difficulties) are identified by quiz title below instead.
        answers: { select: { question: { select: { difficulty: true } } }, take: 1 },
      },
    });

    const relevantRows = rows.filter(r => {
      const title = (r.quiz.title ?? '').toLowerCase();
      return r.quiz.quizType === QuizType.OLYMPIAD || r.quiz.quizType === QuizType.PRACTICE || title.includes('olympiad') || title.includes('practice');
    });

    const finalRows = relevantRows.length ? relevantRows : rows;
    // Practice quizzes are single-subject (see getOrCreatePracticeQuiz); the
    // mixed Olympiad set has no one subject, so subjectExternalId is null
    // there — the client's Subject filter only applies where this is set.
    const subjectNames = await ContentMeta.subjects();

    return finalRows.map(r => ({
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
      subject:        r.quiz.subjectExternalId
        ? { id: r.quiz.subjectExternalId, name: subjectNames.get(r.quiz.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME }
        : null,
      difficulty:     r.quiz.title === 'Retry Practice' ? 'MIXED' : (r.answers[0]?.question.difficulty ?? null),
    }));
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
          ? { id: r.quiz.subjectExternalId, name: subjectNames.get(r.quiz.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME }
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
