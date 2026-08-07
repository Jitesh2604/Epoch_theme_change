import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role, SubmissionStatus, AssessmentStatus } from '../lib/enums';
import { parseIntArr } from '../utils/json';
import {
  round, startOfWeek, weekKey, monthKey, yearKey, addWeeks, addMonths, addYears,
  WEEKLY_BUCKETS, MONTHLY_BUCKETS, YEARLY_BUCKETS, type TrendPoint,
} from '../utils/analyticsShared';

export {
  round, startOfWeek, weekKey, monthKey, yearKey, addWeeks, addMonths, addYears,
  WEEKLY_BUCKETS, MONTHLY_BUCKETS, YEARLY_BUCKETS, type TrendPoint,
};

/**
 * Admin Analytics — Feature 5: Assessment Analytics — shared plumbing.
 *
 * The Assessment-side equivalent of practiceAnalyticsShared.service.ts, over
 * the structurally separate Assessment/Submission/Answer/AssessmentQuestion
 * Bank schema (never Quiz/QuizAttempt/AttemptAnswer/Question — those two
 * schemas are deliberately never joined anywhere in this app). Feeds
 * assessmentOverview.service.ts (Submission-level) and
 * assessmentQuestionAnalytics.service.ts (Answer-level).
 *
 * Only SUBMITTED/GRADED submissions are ever scored/timed — an IN_PROGRESS
 * submission has score=0 and timeTakenSec=0 by construction (never
 * finalized), so counting it in an average/time-allocation calculation would
 * corrupt the numbers. "Total/Incomplete Attempts" KPIs are the only place
 * IN_PROGRESS rows are counted, straight off fetchSubmissions before any
 * score/time-based reduction — see assessmentOverview.service.ts.
 */

/** Submissions that count toward scoring/analytics — mirrors leaderboard.
 *  service.ts's COUNTABLE constant exactly (kept as a separate copy since
 *  that file doesn't export it, but the definition must stay identical). */
export const COUNTABLE_SUBMISSION_STATUSES = [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED];

export interface AssessmentAnalyticsFilters {
  classExternalId?: string;
  subjectExternalId?: string;
  assessmentId?: string;
  /** Assessment lifecycle status (Draft/Published/Archived) — the single
   *  field both the spec's "Status" and "Published/Draft" filters map to. */
  status?: AssessmentStatus;
  dateFrom?: string;
  dateTo?: string;
  /** Scope to one student's own submissions — added for Feature 6's
   *  per-student assessment detail view (fetchSubmissions({ studentId })).
   *  Feature 5 never sets this; platform/class/assessment views stay
   *  unfiltered by student. */
  studentId?: string;
}

function buildSubmissionWhere(filters: AssessmentAnalyticsFilters): Prisma.SubmissionWhereInput {
  return {
    ...(filters.assessmentId && { assessmentId: filters.assessmentId }),
    ...(filters.studentId && { studentId: filters.studentId }),
    ...((filters.dateFrom || filters.dateTo) && {
      startedAt: {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      },
    }),
    assessment: {
      ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
      ...(filters.subjectExternalId && { subjectExternalId: filters.subjectExternalId }),
      ...(filters.status && { status: filters.status }),
    },
  };
}

/** Bulk Submission-level fetch — every status included (Total/Incomplete
 *  Attempts KPIs need IN_PROGRESS counted); callers filter to
 *  COUNTABLE_SUBMISSION_STATUSES themselves wherever a score/time/pass-rate
 *  computation needs only finalized attempts. Feeds KPIs, the Assessment
 *  Performance Table, Participation, Class-wise Performance, Time
 *  Analytics, and Trends — one fetch, many re-groupings. */
export async function fetchSubmissions(filters: AssessmentAnalyticsFilters) {
  return prisma.submission.findMany({
    where: buildSubmissionWhere(filters),
    select: {
      id: true, studentId: true, assessmentId: true, status: true, score: true, totalMarks: true,
      timeTakenSec: true, startedAt: true, submittedAt: true,
      student: { select: { id: true, name: true } },
      assessment: {
        select: {
          id: true, title: true, status: true, passingMarks: true,
          subjectExternalId: true, classExternalId: true, duration: true,
          resultsPublished: true, resultPublishAt: true,
        },
      },
    },
  });
}

export type AssessmentSubmissionRow = Awaited<ReturnType<typeof fetchSubmissions>>[number];

/** Bulk Answer-level fetch, scoped to finalized (SUBMITTED/GRADED)
 *  submissions only — an in-progress submission's timeTakenSec is 0 (never
 *  finalized), so including its answers would corrupt the proportional
 *  time-allocation math below. Feeds Question Analysis and Subject-wise
 *  Performance. */
export async function fetchAnswers(filters: AssessmentAnalyticsFilters) {
  return prisma.answer.findMany({
    where: {
      submission: { ...buildSubmissionWhere(filters), status: { in: COUNTABLE_SUBMISSION_STATUSES } },
    },
    select: {
      questionId: true, isCorrect: true, marksAwarded: true, submissionId: true,
      selectedOption: true, selectedOptions: true, selectedBoolean: true, textAnswer: true,
      submission: { select: { studentId: true, assessmentId: true, startedAt: true, timeTakenSec: true } },
      question: { select: { subjectExternalId: true, chapterExternalId: true, bookExternalId: true, difficulty: true, type: true, marks: true, prompt: true } },
    },
  });
}

export type AssessmentAnswerRow = Awaited<ReturnType<typeof fetchAnswers>>[number];

export interface SubmissionTotals { questionCount: number; timeTakenSec: number }

/** Per-submission question count + timeTakenSec — the Assessment-side
 *  analogue of buildAttemptTotals, used for the identical proportional
 *  time-split technique already proven on the Practice side (a submission's
 *  real timeTakenSec, split evenly across whichever questions/subjects it
 *  touched — same linear-math reasoning, same formula, different table). */
export function buildSubmissionTotals(answerRows: AssessmentAnswerRow[]): Map<string, SubmissionTotals> {
  const totals = new Map<string, SubmissionTotals>();
  for (const r of answerRows) {
    const cur = totals.get(r.submissionId);
    if (cur) cur.questionCount += 1;
    else totals.set(r.submissionId, { questionCount: 1, timeTakenSec: r.submission.timeTakenSec });
  }
  return totals;
}

/**
 * Unlike Practice's AttemptAnswer, Answer has no isSkipped column — every
 * question in an assessment gets an Answer row at grading time regardless
 * of whether the student touched it (finalizeSubmission), and an untouched
 * gradable question is graded isCorrect:false, indistinguishable from a
 * genuine wrong answer by isCorrect alone. "Skipped" is derived here from
 * the answer's actual content being blank — the only reliable signal.
 */
export function isAnswerBlank(a: Pick<AssessmentAnswerRow, 'selectedOption' | 'selectedOptions' | 'selectedBoolean' | 'textAnswer'>): boolean {
  return a.selectedOption === null
    && parseIntArr(a.selectedOptions).length === 0
    && a.selectedBoolean === null
    && !(a.textAnswer && a.textAnswer.trim());
}

/**
 * Batched, N+1-free equivalent of assessment.service.ts's
 * assessmentVisibleToStudent — same assignment rule (direct
 * AssessmentAssignedStudent row OR the student's own class matches an
 * AssessmentAssignedClass row), generalized to count distinct assigned
 * students across many assessments at once instead of checking one student
 * at a time. Three queries total regardless of how many assessments are in
 * view: direct assignments, assigned classes, and one User lookup resolving
 * every distinct assigned class to its students.
 */
export async function resolveAssignedStudentCounts(assessmentIds: string[]): Promise<Map<string, number>> {
  if (!assessmentIds.length) return new Map();

  const [directRows, classRows] = await Promise.all([
    prisma.assessmentAssignedStudent.findMany({
      where: { assessmentId: { in: assessmentIds } },
      select: { assessmentId: true, studentId: true },
    }),
    prisma.assessmentAssignedClass.findMany({
      where: { assessmentId: { in: assessmentIds } },
      select: { assessmentId: true, classExternalId: true },
    }),
  ]);

  const directByAssessment = new Map<string, Set<string>>();
  for (const r of directRows) {
    const set = directByAssessment.get(r.assessmentId) ?? new Set<string>();
    set.add(r.studentId);
    directByAssessment.set(r.assessmentId, set);
  }

  const classesByAssessment = new Map<string, string[]>();
  for (const r of classRows) {
    const list = classesByAssessment.get(r.assessmentId) ?? [];
    list.push(r.classExternalId);
    classesByAssessment.set(r.assessmentId, list);
  }

  const distinctClassIds = [...new Set(classRows.map(r => r.classExternalId))];
  const studentsByClass = new Map<string, string[]>();
  if (distinctClassIds.length) {
    const students = await prisma.user.findMany({
      where: { role: Role.STUDENT, studentProfile: { classExternalId: { in: distinctClassIds } } },
      select: { id: true, studentProfile: { select: { classExternalId: true } } },
    });
    for (const s of students) {
      const classId = s.studentProfile?.classExternalId;
      if (!classId) continue;
      const list = studentsByClass.get(classId) ?? [];
      list.push(s.id);
      studentsByClass.set(classId, list);
    }
  }

  const result = new Map<string, number>();
  for (const assessmentId of assessmentIds) {
    const assignedSet = new Set<string>(directByAssessment.get(assessmentId) ?? []);
    for (const classId of classesByAssessment.get(assessmentId) ?? []) {
      for (const studentId of studentsByClass.get(classId) ?? []) assignedSet.add(studentId);
    }
    result.set(assessmentId, assignedSet.size);
  }
  return result;
}
