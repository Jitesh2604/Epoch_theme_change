import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AttemptStatus, QuizType, Difficulty, QuestionType } from '../lib/enums';
import { round, startOfWeek, weekKey, monthKey, addWeeks, addMonths, WEEKLY_BUCKETS, MONTHLY_BUCKETS, type TrendPoint } from '../utils/analyticsShared';

export { round, startOfWeek, weekKey, monthKey, addWeeks, addMonths, WEEKLY_BUCKETS, MONTHLY_BUCKETS, type TrendPoint };

/**
 * Shared plumbing for the platform-wide (admin) Practice Olympiad analytics
 * features — Subject Analytics (Feature 3) and Question Analytics
 * (Feature 4). Both need the identical bulk AttemptAnswer fetch (Practice
 * Olympiad only: quizType !== OLYMPIAD, status === SUBMITTED — same scope
 * as every analytics feature in this app) and the identical per-attempt
 * time-allocation bookkeeping and week/month bucketing. Extracted here once
 * a second feature needed them, so neither duplicates the query or the
 * date-bucketing logic — see subjectAnalytics.service.ts and
 * questionAnalytics.service.ts for how each groups these same rows
 * differently (by subject/chapter vs. by individual question).
 */

export interface PracticeAnalyticsFilters {
  classExternalId?: string;
  boardExternalId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Structural filters — map straight onto Question columns, pushed to the
   *  DB to shrink the fetched row count for narrowed views. Derived-metric
   *  filters (success-rate range, skip-rate range, etc.) stay client-side,
   *  same split as every filter in Features 2/3. */
  subjectExternalId?: string;
  chapterExternalId?: string;
  difficulty?: Difficulty;
  questionType?: QuestionType;
  /** Scopes to one exact question — a direct AttemptAnswer.questionId
   *  equality, not nested under `question:`, so it's used alongside (not
   *  instead of) the Question-level structural filters above. */
  questionId?: string;
}

function studentProfileFilter(filters: PracticeAnalyticsFilters): Prisma.UserWhereInput | undefined {
  if (!filters.classExternalId && !filters.boardExternalId) return undefined;
  return {
    studentProfile: {
      ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
      ...(filters.boardExternalId && { boardExternalId: filters.boardExternalId }),
    },
  };
}

function buildAttemptWhere(filters: PracticeAnalyticsFilters): Prisma.QuizAttemptWhereInput {
  const studentFilter = studentProfileFilter(filters);
  return {
    status: AttemptStatus.SUBMITTED,
    quiz: { quizType: { not: QuizType.OLYMPIAD } },
    ...((filters.dateFrom || filters.dateTo) && {
      startTime: {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      },
    }),
    ...(studentFilter && { student: studentFilter }),
  };
}

/** The single bulk fetch every platform-wide practice-analytics feature
 *  builds on. Extended (beyond Feature 3's original shape) with the scalar
 *  `questionId` and `question.type`/`question.prompt` so Feature 4 can group
 *  by individual question and show a prompt preview — Feature 3 simply
 *  doesn't use those extra fields. */
export async function fetchPracticeAnswerRows(filters: PracticeAnalyticsFilters) {
  return prisma.attemptAnswer.findMany({
    where: {
      attempt: buildAttemptWhere(filters),
      ...(filters.questionId && { questionId: filters.questionId }),
      question: {
        ...(filters.subjectExternalId && { subjectExternalId: filters.subjectExternalId }),
        ...(filters.chapterExternalId && { chapterExternalId: filters.chapterExternalId }),
        ...(filters.difficulty && { difficulty: filters.difficulty }),
        ...(filters.questionType && { type: filters.questionType }),
      },
    },
    select: {
      questionId: true, isCorrect: true, isSkipped: true, marksAwarded: true, attemptId: true,
      attempt: { select: { studentId: true, startTime: true, timeTakenSec: true } },
      question: { select: { subjectExternalId: true, marks: true, difficulty: true, chapterExternalId: true, bookExternalId: true, type: true, prompt: true } },
    },
  });
}

export type PracticeAnswerRow = Awaited<ReturnType<typeof fetchPracticeAnswerRows>>[number];

export interface AttemptTotals { questionCount: number; timeTakenSec: number }

/** Per-attempt question count + timeTakenSec — used to proportionally split
 *  a Mixed attempt's real total time across whichever question(s)/subject(s)
 *  it touched. Reused unmodified by every grouping (subject, chapter,
 *  question, type, difficulty) across both features. */
export function buildAttemptTotals(rows: PracticeAnswerRow[]): Map<string, AttemptTotals> {
  const totals = new Map<string, AttemptTotals>();
  for (const r of rows) {
    const cur = totals.get(r.attemptId);
    if (cur) cur.questionCount += 1;
    else totals.set(r.attemptId, { questionCount: 1, timeTakenSec: r.attempt.timeTakenSec });
  }
  return totals;
}

