import { q, q1, run, newId, tx, cr, cq1, parseStrArr, toJson } from '../lib/db';
import { QuestionType, AttemptStatus } from '../lib/enums';
import type { PoolConnection } from 'mysql2/promise';
import { ApiError } from '../utils/ApiError';
import type {
  StartPracticeInput,
  StartOlympiadInput,
  SaveAttemptAnswerInput,
  SubmitAttemptInput,
} from '../validators/quiz.validator';

// ── Types ─────────────────────────────────────────────────────────────

interface DbQuestion {
  id: string; type: QuestionType; prompt: string;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null;
  explanation: string | null; marks: number; negativeMarks: number;
  difficulty: string; subjectId: string | null; status: string;
}

interface DbAttemptAnswer {
  id: string; attemptId: string; questionId: string;
  selectedOption: string | null; selectedOptions: string;
  textAnswer: string | null; isCorrect: boolean | null;
  marksAwarded: number; isSkipped: boolean; isMarkedReview: boolean;
}

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

function getOptions(q: DbQuestion): { letter: string; text: string }[] {
  return ([['A', q.optionA], ['B', q.optionB], ['C', q.optionC], ['D', q.optionD]] as [string, string | null][])
    .filter(([, t]) => t)
    .map(([l, t]) => ({ letter: l, text: t! }));
}

function sanitizeQuestion(q: DbQuestion, order: number) {
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

function gradeOne(q: DbQuestion, ans: AnswerLike): { isCorrect: boolean | null; marksAwarded: number } {
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
  const existing = await q1<{ id: string }>(
    "SELECT id FROM quizzes WHERE subjectId = ? AND quizType = 'PRACTICE' AND questionSelection = 'AUTO_RANDOM' LIMIT 1",
    [subjectId],
  );
  if (existing) return existing.id;

  const admin = await q1<{ id: string }>(
    "SELECT id FROM users WHERE role IN ('SUPER_ADMIN','PUBLICATION_ADMIN') ORDER BY createdAt ASC LIMIT 1",
  );
  const subject = await q1<{ name: string }>('SELECT name FROM subjects WHERE id = ?', [subjectId]);

  const quizId = newId();
  await run(
    `INSERT INTO quizzes (id, title, quizType, questionSelection, subjectId, status, createdById, leaderboardEnabled, duration, createdAt, updatedAt)
     VALUES (?, ?, 'PRACTICE', 'AUTO_RANDOM', ?, 'PUBLISHED', ?, 1, 0, NOW(), NOW())`,
    [quizId, `Practice · ${subject?.name ?? subjectId}`, subjectId, admin?.id ?? fallbackUserId],
  );
  return quizId;
}

/** Gets or lazy-creates the shared per-class Olympiad quiz record. */
async function getOrCreateOlympiadQuiz(classId: string | null, fallbackUserId: string): Promise<string> {
  const existing = await q1<{ id: string }>(
    "SELECT id FROM quizzes WHERE quizType = 'OLYMPIAD' AND classId <=> ? LIMIT 1",
    [classId],
  );
  if (existing) return existing.id;

  const admin = await q1<{ id: string }>(
    "SELECT id FROM users WHERE role IN ('SUPER_ADMIN','PUBLICATION_ADMIN') ORDER BY createdAt ASC LIMIT 1",
  );
  const cls = classId ? await q1<{ name: string }>('SELECT name FROM classes WHERE id = ?', [classId]) : null;

  const quizId = newId();
  await run(
    `INSERT INTO quizzes (id, title, quizType, questionSelection, classId, status, createdById, leaderboardEnabled, duration, createdAt, updatedAt)
     VALUES (?, ?, 'OLYMPIAD', 'AUTO_RANDOM', ?, 'PUBLISHED', ?, 1, 0, NOW(), NOW())`,
    [quizId, `Olympiad${cls ? ` · ${cls.name}` : ''}`, classId, admin?.id ?? fallbackUserId],
  );
  return quizId;
}

interface StudentAcademic { profileId: string | null; classId: string | null; educationBoard: string | null }

/** The academic context used to scope a student's quizzes. */
async function readStudentProfile(studentId: string): Promise<StudentAcademic> {
  const row = await q1<{ id: string; classId: string | null; educationBoard: string | null }>(
    'SELECT id, classId, educationBoard FROM student_profiles WHERE userId = ?', [studentId],
  );
  return { profileId: row?.id ?? null, classId: row?.classId ?? null, educationBoard: row?.educationBoard ?? null };
}

/**
 * Scope clause used by both practice and olympiad: a question matches if it is
 * the student's own class/board OR untagged (global). It is NEVER from another
 * class or board.
 */
function classBoardFilter(classId: string | null, board: string | null): { cond: string; params: unknown[] } {
  let cond = '';
  const params: unknown[] = [];
  if (classId) { cond += ' AND (classId = ? OR classId IS NULL)';              params.push(classId); }
  if (board)   { cond += ' AND (educationBoard = ? OR educationBoard IS NULL)'; params.push(board); }
  return { cond, params };
}

/** Olympiad questions-per-subject: DB-configurable via settings, default 5. */
async function getOlympiadPerSubject(): Promise<number> {
  const row = await q1<{ value: string }>(
    "SELECT value FROM settings WHERE `key` = 'olympiad.questionsPerSubject' LIMIT 1",
  );
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

// ── Build result from a completed attempt ─────────────────────────────

async function buildResult(attemptId: string) {
  const attempt = await q1<{
    id: string; score: number; percentage: number; correctAnswers: number;
    wrongAnswers: number; skipped: number; timeTakenSec: number;
  }>('SELECT * FROM quiz_attempts WHERE id = ?', [attemptId]);
  if (!attempt) throw ApiError.notFound('Attempt not found');

  const answers = await q<DbAttemptAnswer & {
    prompt: string; marks: number; difficulty: string; explanation: string | null;
    optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
    correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null; qtype: string;
  }>(
    `SELECT aa.*,
            q.prompt, q.marks, q.difficulty, q.explanation,
            q.optionA, q.optionB, q.optionC, q.optionD,
            q.correctAnswer, q.correctOptions, q.correctBoolean,
            q.type AS qtype
     FROM attempt_answers aa
     JOIN questions q ON q.id = aa.questionId
     WHERE aa.attemptId = ?
     ORDER BY aa.createdAt ASC`,
    [attemptId],
  );

  const totalMarks = answers.reduce((s, a) => s + a.marks, 0);

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
        type:           a.qtype,
        correctAnswer:  a.correctAnswer,
        correctOptions: parseStrArr(a.correctOptions),
        correctBoolean: a.correctBoolean,
      },
      question: {
        prompt:      a.prompt,
        options:     ([['A', a.optionA], ['B', a.optionB], ['C', a.optionC], ['D', a.optionD]] as [string, string | null][])
                       .filter(([, t]) => t).map(([l, t]) => ({ letter: l, text: t! })),
        marks:       a.marks,
        difficulty:  a.difficulty,
        explanation: a.explanation,
      },
    })),
  };
}

// ── Service ───────────────────────────────────────────────────────────

/**
 * Create a new quiz attempt for (quizId, studentId). The attempt number is
 * MAX(existing)+1, which is not atomic — if a student triggers "start" twice in
 * quick succession (double-click / duplicate request) both requests can pick the
 * same number and collide on the unique key. We retry a few times on the
 * duplicate-key error so start never fails for that reason.
 */
async function createQuizAttempt(quizId: string, studentId: string): Promise<{ attemptId: string; attemptNumber: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await q1<{ attemptNumber: number }>(
      'SELECT attemptNumber FROM quiz_attempts WHERE quizId = ? AND studentId = ? ORDER BY attemptNumber DESC LIMIT 1',
      [quizId, studentId],
    );
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;
    const attemptId = newId();
    try {
      await run(
        `INSERT INTO quiz_attempts (id, quizId, studentId, attemptNumber, startTime, status, score, correctAnswers, wrongAnswers, skipped, percentage, timeTakenSec, isSubmitted, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, NOW(), 'IN_PROGRESS', 0, 0, 0, 0, 0, 0, 0, NOW(), NOW())`,
        [attemptId, quizId, studentId, attemptNumber],
      );
      return { attemptId, attemptNumber };
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY' && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a quiz attempt number');
}

export const QuizService = {
  async getSubjectsWithQuestions() {
    const typePlaceholders = GRADABLE_TYPES.map(() => '?').join(',');
    const counts = await q<{ subjectId: string; difficulty: string; cnt: number }>(
      `SELECT subjectId, difficulty, COUNT(*) AS cnt
       FROM questions
       WHERE status = 'ACTIVE' AND type IN (${typePlaceholders}) AND subjectId IS NOT NULL
       GROUP BY subjectId, difficulty`,
      GRADABLE_TYPES,
    );

    const subjectIds = [...new Set(counts.map(c => c.subjectId))];
    if (!subjectIds.length) return [];

    const subjects = await q<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM subjects WHERE id IN (?) AND status = 'ACTIVE' ORDER BY name ASC`,
      [subjectIds],
    );

    return subjects.map(s => {
      const sc     = counts.filter(c => c.subjectId === s.id);
      const easy   = sc.find(c => c.difficulty === 'EASY')?.cnt   ?? 0;
      const medium = sc.find(c => c.difficulty === 'MEDIUM')?.cnt ?? 0;
      const hard   = sc.find(c => c.difficulty === 'HARD')?.cnt   ?? 0;
      return { ...s, questionCount: +easy + +medium + +hard, easyCount: +easy, mediumCount: +medium, hardCount: +hard };
    });
  },

  async startPractice(studentId: string, input: StartPracticeInput) {
    const subject = await q1<{ id: string; name: string; slug: string; kind: string }>(
      'SELECT id, name, slug, kind FROM subjects WHERE id = ?', [input.subjectId],
    );
    if (!subject) throw ApiError.notFound('Subject not found');
    if (subject.kind !== 'SUBJECT') {
      throw ApiError.badRequest('This category is an Olympiad mode — use the Olympiad flow, not subject practice.');
    }

    // Scope to the student's class AND board (never other classes/boards).
    const profile = await readStudentProfile(studentId);
    const { cond: scopeCond, params: scopeParams } = classBoardFilter(profile.classId, profile.educationBoard);

    const typePlaceholders = GRADABLE_TYPES.map(() => '?').join(',');
    const diffCond   = input.difficulty ? ' AND difficulty = ?' : '';
    const diffParam  = input.difficulty ? [input.difficulty] : [];
    const chapCond   = input.chapterId ? ' AND chapterId = ?' : '';
    const chapParam  = input.chapterId ? [input.chapterId] : [];

    const allQuestions = await q<DbQuestion>(
      `SELECT * FROM questions
       WHERE subjectId = ? AND status = 'ACTIVE' AND type IN (${typePlaceholders})${scopeCond}${diffCond}${chapCond}`,
      [input.subjectId, ...GRADABLE_TYPES, ...scopeParams, ...diffParam, ...chapParam],
    );

    if (!allQuestions.length) throw ApiError.badRequest('No questions available for this subject / class / board / difficulty');

    const selected   = shuffleArray(allQuestions).slice(0, input.questionCount);
    const quizId     = await getOrCreatePracticeQuiz(input.subjectId, studentId);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId);

    // Pre-create skipped answer stubs for all selected questions
    for (const sq of selected) {
      await run(
        `INSERT INTO attempt_answers (id, attemptId, questionId, selectedOptions, isSkipped, isMarkedReview, marksAwarded, createdAt, updatedAt)
         VALUES (?, ?, ?, '[]', 1, 0, 0, NOW(), NOW())`,
        [newId(), attemptId, sq.id],
      );
    }

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
    const attempt = await q1<{ studentId: string; status: string }>(
      'SELECT studentId, status FROM quiz_attempts WHERE id = ?', [attemptId],
    );
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw ApiError.badRequest('Attempt is already finalised');

    const question = await q1<DbQuestion>('SELECT * FROM questions WHERE id = ?', [input.questionId]);
    if (!question) throw ApiError.notFound('Question not found');

    const hasAnswer = !!input.selectedOption || !!(input.selectedOptions?.length) || !!input.textAnswer;
    const isSkipped = input.isSkipped ?? !hasAnswer;

    const answerData = {
      selectedOption:  input.selectedOption  ?? null,
      selectedOptions: toJson(input.selectedOptions ?? []),
      textAnswer:      input.textAnswer      ?? null,
      timeSpentSec:    input.timeSpentSec    ?? null,
      isSkipped:       isSkipped ? 1 : 0,
      isMarkedReview:  input.isMarkedReview  ? 1 : 0,
    };

    const { isCorrect, marksAwarded } = gradeOne(question, {
      selectedOption:  answerData.selectedOption,
      selectedOptions: input.selectedOptions ?? [],
      textAnswer:      answerData.textAnswer,
      isSkipped,
    });

    await run(
      `INSERT INTO attempt_answers (id, attemptId, questionId, selectedOption, selectedOptions, textAnswer, timeSpentSec, isSkipped, isMarkedReview, isCorrect, marksAwarded, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         selectedOption = VALUES(selectedOption), selectedOptions = VALUES(selectedOptions),
         textAnswer = VALUES(textAnswer), timeSpentSec = VALUES(timeSpentSec),
         isSkipped = VALUES(isSkipped), isMarkedReview = VALUES(isMarkedReview),
         isCorrect = VALUES(isCorrect), marksAwarded = VALUES(marksAwarded), updatedAt = NOW()`,
      [
        newId(), attemptId, input.questionId,
        answerData.selectedOption, answerData.selectedOptions, answerData.textAnswer,
        answerData.timeSpentSec, answerData.isSkipped, answerData.isMarkedReview,
        isCorrect, marksAwarded,
      ],
    );

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
    const attempt = await q1<{ id: string; studentId: string; status: string; quizId: string; startTime: Date }>(
      'SELECT id, studentId, status, quizId, startTime FROM quiz_attempts WHERE id = ?', [attemptId],
    );
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');

    if (attempt.status === AttemptStatus.SUBMITTED) return buildResult(attemptId);

    const answers = await q<DbAttemptAnswer & { marks: number; qtype: string; correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null }>(
      `SELECT aa.*, q.marks, q.type AS qtype, q.correctAnswer, q.correctOptions, q.correctBoolean
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.questionId
       WHERE aa.attemptId = ?`,
      [attemptId],
    );

    let score = 0, correct = 0, wrong = 0, skipped = 0;

    await tx(async (conn: PoolConnection) => {
      for (const ans of answers) {
        const noAnswer = Boolean(ans.isSkipped) ||
          (!ans.selectedOption && !parseStrArr(ans.selectedOptions).length && !ans.textAnswer);

        if (noAnswer) {
          skipped++;
          await cr(conn,
            'UPDATE attempt_answers SET isSkipped = 1, isCorrect = NULL, marksAwarded = 0, updatedAt = NOW() WHERE id = ?',
            [ans.id],
          );
          continue;
        }

        const question: DbQuestion = {
          id: ans.questionId, type: ans.qtype as QuestionType,
          prompt: '', promptImageUrl: null, optionA: null, optionB: null, optionC: null, optionD: null,
          correctAnswer: ans.correctAnswer, correctOptions: ans.correctOptions,
          correctBoolean: ans.correctBoolean, explanation: null,
          marks: ans.marks, negativeMarks: 0, difficulty: '', subjectId: null, status: 'ACTIVE',
        } as any;

        const { isCorrect, marksAwarded } = gradeOne(question, {
          selectedOption:  ans.selectedOption,
          selectedOptions: parseStrArr(ans.selectedOptions),
          textAnswer:      ans.textAnswer,
          isSkipped:       false,
        });

        score += marksAwarded;
        if (isCorrect === true) correct++;
        else if (isCorrect === false) wrong++;

        await cr(conn,
          'UPDATE attempt_answers SET isCorrect = ?, marksAwarded = ?, isSkipped = 0, updatedAt = NOW() WHERE id = ?',
          [isCorrect, marksAwarded, ans.id],
        );
      }

      const totalMarks   = answers.reduce((s, a) => s + a.marks, 0);
      const timeTakenSec = input.timeTakenSec ?? Math.floor((Date.now() - new Date(attempt.startTime).getTime()) / 1000);
      const percentage   = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

      await cr(conn,
        `UPDATE quiz_attempts SET status = 'SUBMITTED', score = ?, correctAnswers = ?, wrongAnswers = ?,
         skipped = ?, percentage = ?, timeTakenSec = ?, endTime = NOW(), isSubmitted = 1, updatedAt = NOW()
         WHERE id = ?`,
        [score, correct, wrong, skipped, percentage, timeTakenSec, attemptId],
      );

      // Upsert leaderboard — keep best score per (quiz, student)
      const lbEntry = await cq1<{ score: number }>(conn,
        'SELECT score FROM leaderboard WHERE quizId = ? AND studentId = ?',
        [attempt.quizId, studentId],
      );
      if (!lbEntry || score > lbEntry.score) {
        await cr(conn,
          `INSERT INTO leaderboard (id, quizId, studentId, attemptId, score, percentage, timeTakenSec, attemptDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             attemptId = VALUES(attemptId), score = VALUES(score),
             percentage = VALUES(percentage), timeTakenSec = VALUES(timeTakenSec),
             attemptDate = NOW(), updatedAt = NOW()`,
          [newId(), attempt.quizId, studentId, attemptId, score, percentage, input.timeTakenSec ?? 0],
        );
      }
    });

    return buildResult(attemptId);
  },

  async getAttempt(attemptId: string, studentId: string) {
    const attempt = await q1<{ id: string; studentId: string; status: string; startTime: Date }>(
      'SELECT id, studentId, status, startTime FROM quiz_attempts WHERE id = ?', [attemptId],
    );
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.studentId !== studentId) throw ApiError.forbidden('Not your attempt');

    if (attempt.status === AttemptStatus.SUBMITTED) return buildResult(attemptId);

    const answers = await q<DbAttemptAnswer & { prompt: string; marks: number; difficulty: string }>(
      `SELECT aa.*, q.prompt, q.marks, q.difficulty, q.type AS qtype,
              q.optionA, q.optionB, q.optionC, q.optionD
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.questionId
       WHERE aa.attemptId = ?
       ORDER BY aa.createdAt ASC`,
      [attemptId],
    );

    return {
      attemptId: attempt.id,
      status:    attempt.status,
      startTime: attempt.startTime,
      questions: answers.map((a, i) => sanitizeQuestion(a as unknown as DbQuestion, i + 1)),
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

    const subjects = await q<{ id: string; name: string; slug: string }>(
      `SELECT s.id, s.name, s.slug FROM student_subjects ss
       JOIN subjects s ON s.id = ss.subjectId
       WHERE ss.studentProfileId = ? AND s.kind = 'SUBJECT' AND s.status = 'ACTIVE'
       ORDER BY s.name`,
      [profile.profileId ?? '__none__'],
    );
    if (!subjects.length) {
      throw ApiError.badRequest('Add your subjects in your profile to start an Olympiad.');
    }

    const perSubject = input.perSubject ?? await getOlympiadPerSubject();
    const { cond: scopeCond, params: scopeParams } = classBoardFilter(profile.classId, profile.educationBoard);
    const typePlaceholders = GRADABLE_TYPES.map(() => '?').join(',');

    // Balanced pull: up to `perSubject` random questions from each subject,
    // strictly within the student's class + board.
    const picked: DbQuestion[] = [];
    const distribution: { subjectId: string; subject: string; count: number }[] = [];
    for (const subj of subjects) {
      const rows = await q<DbQuestion>(
        `SELECT * FROM questions
         WHERE subjectId = ? AND status = 'ACTIVE' AND type IN (${typePlaceholders})${scopeCond}
         ORDER BY RAND() LIMIT ?`,
        [subj.id, ...GRADABLE_TYPES, ...scopeParams, perSubject],
      );
      picked.push(...rows);
      distribution.push({ subjectId: subj.id, subject: subj.name, count: rows.length });
    }
    if (!picked.length) {
      throw ApiError.badRequest('No questions available for your class/board in your selected subjects yet.');
    }

    const selected = shuffleArray(picked);
    const quizId   = await getOrCreateOlympiadQuiz(profile.classId, studentId);

    const { attemptId, attemptNumber } = await createQuizAttempt(quizId, studentId);
    for (const sq of selected) {
      await run(
        `INSERT INTO attempt_answers (id, attemptId, questionId, selectedOptions, isSkipped, isMarkedReview, marksAwarded, createdAt, updatedAt)
         VALUES (?, ?, ?, '[]', 1, 0, 0, NOW(), NOW())`,
        [newId(), attemptId, sq.id],
      );
    }

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
    const rows = await q<{
      attemptId: string; attemptNumber: number; status: string; score: number;
      percentage: number; correctAnswers: number; wrongAnswers: number; skipped: number;
      timeTakenSec: number; startTime: Date; endTime: Date | null; quizTitle: string; questionCount: number;
    }>(
      `SELECT qa.id AS attemptId, qa.attemptNumber, qa.status, qa.score, qa.percentage,
              qa.correctAnswers, qa.wrongAnswers, qa.skipped, qa.timeTakenSec,
              qa.startTime, qa.endTime, q.title AS quizTitle,
              (SELECT COUNT(*) FROM attempt_answers aa WHERE aa.attemptId = qa.id) AS questionCount
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quizId
       WHERE qa.studentId = ? AND q.quizType = 'OLYMPIAD'
       ORDER BY qa.startTime DESC`,
      [studentId],
    );
    return rows.map(r => ({
      attemptId:      r.attemptId,
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
      quizTitle:      r.quizTitle,
      questionCount:  Number(r.questionCount),
    }));
  },
};
