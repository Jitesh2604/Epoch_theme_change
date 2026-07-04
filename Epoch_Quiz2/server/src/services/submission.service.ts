import { q, q1, run, newId, tx, cr, cq, parseStrArr, parseIntArr, toJson } from '../lib/db';

import { AssessmentStatus, QuestionType, Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type { PoolConnection } from 'mysql2/promise';
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

const SELECT_QUESTIONS = `
  SELECT aq.id AS aqId, aq.\`order\` AS aqOrder, aq.marksOverride,
         q.id AS qId, q.type, q.prompt, q.promptImageUrl,
         q.optionA, q.optionB, q.optionC, q.optionD,
         q.optionAImageUrl, q.optionBImageUrl, q.optionCImageUrl, q.optionDImageUrl,
         q.matchPairs, q.marks,
         q.correctAnswer, q.correctOptions, q.correctBoolean,
         q.explanation, q.explanationImageUrl, q.modelAnswer
  FROM assessment_questions aq
  JOIN questions q ON q.id = aq.questionId
  WHERE aq.assessmentId = ?
  ORDER BY aq.\`order\` ASC`;

const SELECT_SUBMISSION = `
  SELECT s.id, s.studentId, s.assessmentId, s.status, s.score, s.totalMarks,
         s.timeTakenSec, s.startedAt, s.submittedAt,
         a.title AS aTitle, a.description AS aDescription, a.duration AS aDuration,
         a.passingMarks AS aPassing, a.createdById AS aCreatedById,
         sub.id AS subId, sub.name AS subName, sub.slug AS subSlug,
         u.name AS stName, u.email AS stEmail
  FROM submissions s
  JOIN assessments a ON a.id = s.assessmentId
  LEFT JOIN subjects sub ON sub.id = a.subjectId
  JOIN users u ON u.id = s.studentId`;

function answerMap(answers: DbAnswer[]): Map<string, DbAnswer> {
  const m = new Map<string, DbAnswer>();
  for (const a of answers) m.set(a.questionId, a);
  return m;
}

async function loadOwnInProgress(actor: Actor, submissionId: string) {
  const s = await q1<{
    id: string; studentId: string; assessmentId: string; status: string;
    startedAt: Date; totalMarks: number; duration: number;
  }>(
    `SELECT s.id, s.studentId, s.assessmentId, s.status, s.startedAt, s.totalMarks, a.duration
     FROM submissions s JOIN assessments a ON a.id = s.assessmentId WHERE s.id = ?`,
    [submissionId],
  );
  if (!s) throw ApiError.notFound('Submission not found');
  if (!isAdminRole(actor.role) && s.studentId !== actor.id) throw ApiError.forbidden('You can only modify your own attempt');
  if (s.status !== SubmissionStatus.IN_PROGRESS) throw ApiError.badRequest('This attempt is no longer in progress');
  return s;
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
  const s = await q1<LoadedSubmission>(`${SELECT_SUBMISSION} WHERE s.id = ?`, [submissionId]);
  if (!s) throw ApiError.notFound('Submission not found');

  const aqs = await q<AssessmentQuestion>(SELECT_QUESTIONS, [s.assessmentId]);

  if (s.status !== SubmissionStatus.IN_PROGRESS) {
    const answers = await q<DbAnswer>('SELECT * FROM answers WHERE submissionId = ?', [submissionId]);
    return shapeSubmission(s, aqs, answers, true);
  }

  const existingAnswers = await q<DbAnswer>('SELECT * FROM answers WHERE submissionId = ?', [submissionId]);
  const byQ = answerMap(existingAnswers);

  const effRows = await q<{ questionId: string; marksOverride: number | null }>(
    'SELECT questionId, marksOverride FROM assessment_questions WHERE assessmentId = ?',
    [s.assessmentId],
  );
  const effMap = new Map<string, number | null>();
  for (const r of effRows) effMap.set(r.questionId, r.marksOverride);

  let totalScore = 0;
  let hasUngradedDescriptive = false;

  await tx(async (conn: PoolConnection) => {
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
        await cr(conn,
          'UPDATE answers SET isCorrect = ?, marksAwarded = ? WHERE id = ?',
          [isCorrect, marksAwarded, a.id],
        );
      } else {
        await cr(conn,
          `INSERT INTO answers (id, submissionId, questionId, selectedOptions, isCorrect, marksAwarded)
           VALUES (?, ?, ?, '[]', ?, 0)`,
          [newId(), submissionId, aq.qId, needsManual ? null : 0],
        );
      }
    }

    const submittedAt  = new Date();
    const timeTakenSec = Math.max(0, Math.floor((submittedAt.getTime() - new Date(s.startedAt).getTime()) / 1000));
    const status       = hasUngradedDescriptive ? SubmissionStatus.SUBMITTED : SubmissionStatus.GRADED;

    await cr(conn,
      'UPDATE submissions SET score = ?, submittedAt = ?, timeTakenSec = ?, status = ? WHERE id = ?',
      [totalScore, submittedAt, timeTakenSec, status, submissionId],
    );
  });

  const finalSub     = await q1<LoadedSubmission>(`${SELECT_SUBMISSION} WHERE s.id = ?`, [submissionId]);
  const finalAnswers = await q<DbAnswer>('SELECT * FROM answers WHERE submissionId = ?', [submissionId]);
  return shapeSubmission(finalSub!, aqs, finalAnswers, true);
}

async function recomputeSubmissionScore(conn: PoolConnection, submissionId: string): Promise<void> {
  const rows = await cq<{ marksAwarded: number; qtype: string; isCorrect: boolean | null }>(conn,
    'SELECT a.marksAwarded, q.type AS qtype, a.isCorrect FROM answers a JOIN questions q ON q.id = a.questionId WHERE a.submissionId = ?',
    [submissionId],
  );
  const score = rows.reduce((sum: number, a: { marksAwarded: number }) => sum + a.marksAwarded, 0);
  const stillUngraded = rows.some(
    (a: { qtype: string; isCorrect: boolean | null }) =>
      (a.qtype === QuestionType.DESCRIPTIVE || a.qtype === QuestionType.MATCH_THE_COLUMN) && a.isCorrect === null,
  );
  const status = stillUngraded ? SubmissionStatus.SUBMITTED : SubmissionStatus.GRADED;
  await cr(conn, 'UPDATE submissions SET score = ?, status = ? WHERE id = ?', [score, status, submissionId]);
}

// ── service ───────────────────────────────────────────────────

export const SubmissionService = {
  async start(actor: Actor, assessmentId: string) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('Only students can start an assessment attempt');

    const assessment = await q1<{
      id: string; title: string; description: string | null; duration: number;
      totalMarks: number; passingMarks: number; status: string;
      subjectId: string | null; subjectName: string | null; subjectSlug: string | null;
    }>(
      `SELECT a.id, a.title, a.description, a.duration, a.totalMarks, a.passingMarks, a.status,
              s.id AS subjectId, s.name AS subjectName, s.slug AS subjectSlug
       FROM assessments a LEFT JOIN subjects s ON s.id = a.subjectId WHERE a.id = ?`,
      [assessmentId],
    );
    if (!assessment) throw ApiError.notFound('Assessment not found');
    if (assessment.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
    if (!(await assessmentVisibleToStudent(actor.id, assessmentId))) throw ApiError.notFound('Assessment not found');

    const aqs = await q<AssessmentQuestion>(SELECT_QUESTIONS, [assessmentId]);
    if (!aqs.length) throw ApiError.badRequest('This assessment has no questions yet');

    let submission = await q1<{ id: string; status: string; startedAt: Date; totalMarks: number }>(
      'SELECT id, status, startedAt, totalMarks FROM submissions WHERE assessmentId = ? AND studentId = ?',
      [assessmentId, actor.id],
    );

    if (submission && submission.status !== SubmissionStatus.IN_PROGRESS) {
      throw ApiError.conflict('You have already submitted this assessment');
    }

    if (!submission) {
      const totalMarks = aqs.reduce((sum: number, aq: AssessmentQuestion) => sum + (aq.marksOverride ?? aq.marks), 0);
      const sid = newId();
      await run(
        "INSERT INTO submissions (id, assessmentId, studentId, status, score, totalMarks, timeTakenSec, startedAt) VALUES (?, ?, ?, 'IN_PROGRESS', 0, ?, 0, NOW())",
        [sid, assessmentId, actor.id, totalMarks],
      );
      submission = await q1<{ id: string; status: string; startedAt: Date; totalMarks: number }>(
        'SELECT id, status, startedAt, totalMarks FROM submissions WHERE id = ?', [sid],
      );
    }

    const { expiresAt, remainingSec } = durationLeft(submission!.startedAt, assessment.duration);
    if (remainingSec === 0) {
      const finalized = await finalizeSubmission(submission!.id);
      return { autoSubmitted: true, submission: finalized };
    }

    const savedAnswers = await q<Pick<DbAnswer, 'questionId' | 'selectedOption' | 'selectedOptions' | 'selectedBoolean' | 'textAnswer'>>(
      'SELECT questionId, selectedOption, selectedOptions, selectedBoolean, textAnswer FROM answers WHERE submissionId = ?',
      [submission!.id],
    );

    const questions = aqs.map((aq: AssessmentQuestion) => ({
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

    const existing = savedAnswers.map((a: { questionId: string; selectedOption: number | null; selectedOptions: string; selectedBoolean: boolean | null; textAnswer: string | null }) => ({
      questionId:      a.questionId,
      selectedOption:  a.selectedOption,
      selectedOptions: parseIntArr(a.selectedOptions),
      selectedBoolean: a.selectedBoolean,
      textAnswer:      a.textAnswer,
    }));

    return {
      submission: {
        id: submission!.id, status: submission!.status, startedAt: submission!.startedAt,
        expiresAt, remainingSec, totalMarks: submission!.totalMarks,
        assessment: {
          id: assessment.id, title: assessment.title, description: assessment.description,
          duration: assessment.duration,
          subject: assessment.subjectId
            ? { id: assessment.subjectId, name: assessment.subjectName, slug: assessment.subjectSlug }
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

    const question = await q1<{ id: string; type: string; marks: number; correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null }>(
      `SELECT q.id, q.type, q.marks, q.correctAnswer, q.correctOptions, q.correctBoolean
       FROM questions q JOIN assessment_questions aq ON aq.questionId = q.id
       WHERE q.id = ? AND aq.assessmentId = ?`,
      [input.questionId, s.assessmentId],
    );
    if (!question) throw ApiError.badRequest('Question is not part of this assessment');

    const effRow = await q1<{ marksOverride: number | null }>(
      'SELECT marksOverride FROM assessment_questions WHERE assessmentId = ? AND questionId = ?',
      [s.assessmentId, input.questionId],
    );
    const marks   = effRow?.marksOverride ?? question.marks;
    const selOpts = input.selectedOptions ?? [];
    const { isCorrect, marksAwarded } = gradeAnswer(
      question.type, marks, question.correctAnswer, question.correctOptions, question.correctBoolean,
      input.selectedOption ?? null, selOpts, input.selectedBoolean ?? null, input.textAnswer ?? null,
    );

    const existing = await q1<{ id: string }>(
      'SELECT id FROM answers WHERE submissionId = ? AND questionId = ?', [submissionId, input.questionId],
    );
    if (existing) {
      await run(
        `UPDATE answers SET selectedOption = ?, selectedOptions = ?, selectedBoolean = ?,
         textAnswer = ?, timeMs = ?, isCorrect = ?, marksAwarded = ? WHERE id = ?`,
        [input.selectedOption ?? null, toJson(selOpts), input.selectedBoolean ?? null,
         input.textAnswer ?? null, input.timeMs ?? null, isCorrect, marksAwarded, existing.id],
      );
    } else {
      await run(
        `INSERT INTO answers (id, submissionId, questionId, selectedOption, selectedOptions, selectedBoolean, textAnswer, timeMs, isCorrect, marksAwarded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), submissionId, input.questionId, input.selectedOption ?? null, toJson(selOpts),
         input.selectedBoolean ?? null, input.textAnswer ?? null, input.timeMs ?? null, isCorrect, marksAwarded],
      );
    }
    return { ok: true };
  },

  async submit(actor: Actor, submissionId: string, input: SubmitAttemptInput) {
    const s = await loadOwnInProgress(actor, submissionId);

    if (input.answers && input.answers.length > 0) {
      const qIds     = input.answers.map((a: SaveAnswerInput) => a.questionId);
      const validQs  = await q<{ id: string }>(
        `SELECT q.id FROM questions q JOIN assessment_questions aq ON aq.questionId = q.id
         WHERE q.id IN (?) AND aq.assessmentId = ?`, [qIds, s.assessmentId],
      );
      const validIds = new Set(validQs.map((r: { id: string }) => r.id));
      const unknown  = input.answers.find((a: SaveAnswerInput) => !validIds.has(a.questionId));
      if (unknown) throw ApiError.badRequest(`Question not in this assessment: ${unknown.questionId}`);

      const effRows  = await q<{ questionId: string; marksOverride: number | null }>(
        'SELECT questionId, marksOverride FROM assessment_questions WHERE assessmentId = ? AND questionId IN (?)',
        [s.assessmentId, qIds],
      );
      const effMap   = new Map<string, number | null>();
      for (const r of effRows) effMap.set(r.questionId, r.marksOverride);

      const qRows   = await q<{ id: string; type: string; marks: number; correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null }>(
        'SELECT id, type, marks, correctAnswer, correctOptions, correctBoolean FROM questions WHERE id IN (?)', [qIds],
      );
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
        const existing = await q1<{ id: string }>(
          'SELECT id FROM answers WHERE submissionId = ? AND questionId = ?', [submissionId, a.questionId],
        );
        if (existing) {
          await run(
            `UPDATE answers SET selectedOption = ?, selectedOptions = ?, selectedBoolean = ?,
             textAnswer = ?, timeMs = ?, isCorrect = ?, marksAwarded = ? WHERE id = ?`,
            [a.selectedOption ?? null, toJson(selOpts), a.selectedBoolean ?? null,
             a.textAnswer ?? null, a.timeMs ?? null, isCorrect, marksAwarded, existing.id],
          );
        } else {
          await run(
            `INSERT INTO answers (id, submissionId, questionId, selectedOption, selectedOptions, selectedBoolean, textAnswer, timeMs, isCorrect, marksAwarded)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newId(), submissionId, a.questionId, a.selectedOption ?? null, toJson(selOpts),
             a.selectedBoolean ?? null, a.textAnswer ?? null, a.timeMs ?? null, isCorrect, marksAwarded],
          );
        }
      }
    }
    return finalizeSubmission(submissionId);
  },

  async findById(actor: Actor, id: string) {
    const s = await q1<LoadedSubmission>(`${SELECT_SUBMISSION} WHERE s.id = ?`, [id]);
    if (!s) throw ApiError.notFound('Submission not found');

    if (!isAdminRole(actor.role)) {
      if (actor.role === Role.TEACHER) {
        if (s.aCreatedById !== actor.id) throw ApiError.forbidden('You can only view submissions for your own assessments');
      } else {
        if (s.studentId !== actor.id) throw ApiError.notFound('Submission not found');
      }
    }

    const aqs     = await q<AssessmentQuestion>(SELECT_QUESTIONS, [s.assessmentId]);
    const answers = await q<DbAnswer>('SELECT * FROM answers WHERE submissionId = ?', [id]);
    return shapeSubmission(s, aqs, answers, s.status !== SubmissionStatus.IN_PROGRESS);
  },

  async listMine(actor: Actor, query: ListSubmissionsQuery) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('listMine is for students only');
    const { page, limit, status, assessmentId } = query;

    const conds = ['s.studentId = ?'];
    const params: unknown[] = [actor.id];
    if (status)       { conds.push('s.status = ?');       params.push(status); }
    if (assessmentId) { conds.push('s.assessmentId = ?'); params.push(assessmentId); }

    const where = `WHERE ${conds.join(' AND ')}`;
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, countRows] = await Promise.all([
      q<{ id: string; status: string; score: number; totalMarks: number; timeTakenSec: number | null; startedAt: Date; submittedAt: Date | null; aId: string; aTitle: string; subId: string | null; subName: string | null; subSlug: string | null }>(
        `SELECT s.id, s.status, s.score, s.totalMarks, s.timeTakenSec, s.startedAt, s.submittedAt,
                a.id AS aId, a.title AS aTitle, sub.id AS subId, sub.name AS subName, sub.slug AS subSlug
         FROM submissions s JOIN assessments a ON a.id = s.assessmentId LEFT JOIN subjects sub ON sub.id = a.subjectId
         ${where} ORDER BY s.startedAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM submissions s ${where}`, params),
    ]);

    const items = rows.map((s: typeof rows[number]) => {
      const score = Number(s.score ?? 0); const total = Number(s.totalMarks ?? 0);
      return {
        id: s.id, status: s.status, score, totalMarks: total,
        percent: total > 0 ? Math.round((score / total) * 10000) / 100 : 0,
        startedAt: s.startedAt, submittedAt: s.submittedAt, timeTakenSec: s.timeTakenSec,
        assessment: { id: s.aId, title: s.aTitle, subject: s.subId ? { id: s.subId, name: s.subName, slug: s.subSlug } : null },
      };
    });
    return { items, meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
  },

  async list(actor: Actor, query: ListSubmissionsQuery) {
    if (actor.role === Role.STUDENT) throw ApiError.forbidden('Students should use /submissions/me');
    const { page, limit, status, assessmentId, studentId } = query;

    const conds: string[] = [];
    const params: unknown[] = [];
    if (status)       { conds.push('s.status = ?');       params.push(status); }
    if (assessmentId) { conds.push('s.assessmentId = ?'); params.push(assessmentId); }
    if (studentId)    { conds.push('s.studentId = ?');    params.push(studentId); }
    if (actor.role === Role.TEACHER) { conds.push('a.createdById = ?'); params.push(actor.id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, countRows] = await Promise.all([
      q<{ id: string; status: string; score: number; totalMarks: number; timeTakenSec: number | null; startedAt: Date; submittedAt: Date | null; aId: string; aTitle: string; subId: string | null; subName: string | null; subSlug: string | null; stId: string; stName: string; stEmail: string }>(
        `SELECT s.id, s.status, s.score, s.totalMarks, s.timeTakenSec, s.startedAt, s.submittedAt,
                a.id AS aId, a.title AS aTitle, sub.id AS subId, sub.name AS subName, sub.slug AS subSlug,
                u.id AS stId, u.name AS stName, u.email AS stEmail
         FROM submissions s JOIN assessments a ON a.id = s.assessmentId
         LEFT JOIN subjects sub ON sub.id = a.subjectId LEFT JOIN users u ON u.id = s.studentId
         ${where} ORDER BY s.startedAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM submissions s JOIN assessments a ON a.id = s.assessmentId ${where}`,
        params,
      ),
    ]);

    const items = rows.map((s: typeof rows[number]) => {
      const score = Number(s.score ?? 0); const total = Number(s.totalMarks ?? 0);
      return {
        id: s.id, status: s.status, score, totalMarks: total,
        percent: total > 0 ? Math.round((score / total) * 10000) / 100 : 0,
        startedAt: s.startedAt, submittedAt: s.submittedAt, timeTakenSec: s.timeTakenSec,
        assessment: { id: s.aId, title: s.aTitle, subject: s.subId ? { id: s.subId, name: s.subName, slug: s.subSlug } : null },
        student: { id: s.stId, name: s.stName, email: s.stEmail },
      };
    });
    return { items, meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
  },

  async grade(actor: Actor, submissionId: string, questionId: string, input: GradeAnswerInput) {
    if (actor.role !== Role.TEACHER && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can grade');
    }
    const submission = await q1<{ id: string; status: string; assessmentId: string; assessmentCreatedById: string }>(
      `SELECT s.id, s.status, s.assessmentId, a.createdById AS assessmentCreatedById
       FROM submissions s JOIN assessments a ON a.id = s.assessmentId WHERE s.id = ?`,
      [submissionId],
    );
    if (!submission) throw ApiError.notFound('Submission not found');
    if (actor.role === Role.TEACHER && submission.assessmentCreatedById !== actor.id) {
      throw ApiError.forbidden('You can only grade submissions for your own assessments');
    }
    if (submission.status === SubmissionStatus.IN_PROGRESS) {
      throw ApiError.badRequest('Cannot grade a submission that is still in progress');
    }

    const answer = await q1<{ id: string; questionType: string }>(
      `SELECT a.id, q.type AS questionType FROM answers a JOIN questions q ON q.id = a.questionId
       WHERE a.submissionId = ? AND a.questionId = ?`,
      [submissionId, questionId],
    );
    if (!answer) throw ApiError.notFound('Answer not found');
    if (answer.questionType !== QuestionType.DESCRIPTIVE) {
      throw ApiError.badRequest('Only descriptive answers require manual grading');
    }

    const aq = await q1<{ marksOverride: number | null; qMarks: number }>(
      `SELECT aq.marksOverride, q.marks AS qMarks FROM assessment_questions aq
       JOIN questions q ON q.id = aq.questionId WHERE aq.assessmentId = ? AND aq.questionId = ?`,
      [submission.assessmentId, questionId],
    );
    const effective = aq?.marksOverride ?? aq?.qMarks ?? 0;
    if (input.marksAwarded > effective) throw ApiError.badRequest(`marksAwarded cannot exceed ${effective}`);

    await tx(async (conn: PoolConnection) => {
      await cr(conn,
        'UPDATE answers SET marksAwarded = ?, isCorrect = ? WHERE id = ?',
        [input.marksAwarded, input.isCorrect ?? input.marksAwarded > 0, answer.id],
      );
      await recomputeSubmissionScore(conn, submissionId);
    });

    const finalSub = await q1<LoadedSubmission>(`${SELECT_SUBMISSION} WHERE s.id = ?`, [submissionId]);
    const finalAqs = await q<AssessmentQuestion>(SELECT_QUESTIONS, [submission.assessmentId]);
    const finalAns = await q<DbAnswer>('SELECT * FROM answers WHERE submissionId = ?', [submissionId]);
    return shapeSubmission(finalSub!, finalAqs, finalAns, true);
  },
};
