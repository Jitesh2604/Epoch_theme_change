import { prisma } from '../lib/prisma';
import { UserStatus } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';
import {
  fetchPracticeAnswerRows, buildAttemptTotals, round,
  startOfWeek, weekKey, monthKey, addWeeks, addMonths,
  WEEKLY_BUCKETS, MONTHLY_BUCKETS,
  type PracticeAnalyticsFilters, type PracticeAnswerRow, type TrendPoint,
} from './practiceAnalyticsShared.service';

/**
 * Admin Analytics — Feature 4: Question Analytics.
 *
 * Platform-wide, grouped by individual question — the finest grain any
 * analytics feature in this app computes. Built on the exact same bulk
 * fetch and per-attempt time-allocation bookkeeping Feature 3 uses (see
 * practiceAnalyticsShared.service.ts) — grouping by questionId instead of
 * subject/chapter is the only new computation here. Because time-allocation
 * and correct/wrong/skip counting are strictly additive/linear, and
 * per-question is the finest possible grain, every other view this feature
 * needs (question-type performance, difficulty analysis, chapter analysis,
 * top-N rankings) is a pure re-summing of this one per-question array —
 * done client-side (see questionInsightsEngine.ts / QuestionAnalyticsPage.tsx)
 * rather than as separate backend aggregations, so nothing here duplicates
 * Feature 3's subject/chapter math, it's mathematically guaranteed to
 * reconcile with it.
 *
 * Practice Olympiad only (quizType !== OLYMPIAD, status === SUBMITTED) —
 * never touches Submission (Assessment) or leaderboard data.
 */

export type QuestionAnalyticsFilters = PracticeAnalyticsFilters;

export interface QuestionOverviewRow {
  questionId: string;
  promptPreview: string;
  subjectId: string | null;
  subjectName: string;
  chapterId: string | null;
  chapterName: string | null;
  difficulty: string;
  questionType: string;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  successRatePercent: number;
  wrongRatePercent: number;
  skipRatePercent: number;
  /** Sum (not average) of this question's allocated time across every
   *  attempt — kept alongside the average so the client can weight-average
   *  correctly when it re-groups by chapter/type/difficulty (summing
   *  per-question averages directly would silently under-weight questions
   *  with more attempts). */
  totalTimeSpentSec: number;
  averageTimeSpentSec: number;
  lastAttemptedDate: Date;
}

interface QuestionAcc {
  questionId: string;
  subjectExternalId: string | null;
  chapterExternalId: string | null;
  bookExternalId: string | null;
  difficulty: string;
  questionType: string;
  prompt: string;
  correct: number; wrong: number; skipped: number;
  timeSpentSec: number;
  lastAttemptedDate: Date;
}

async function getQuestionOverview(filters: QuestionAnalyticsFilters): Promise<QuestionOverviewRow[]> {
  const rows = await fetchPracticeAnswerRows(filters);
  if (!rows.length) return [];

  const attemptTotals = buildAttemptTotals(rows);

  const byQuestion = new Map<string, QuestionAcc>();
  for (const r of rows) {
    let acc = byQuestion.get(r.questionId);
    if (!acc) {
      acc = {
        questionId: r.questionId,
        subjectExternalId: r.question.subjectExternalId,
        chapterExternalId: r.question.chapterExternalId,
        bookExternalId: r.question.bookExternalId,
        difficulty: r.question.difficulty,
        questionType: r.question.type,
        prompt: r.question.prompt,
        correct: 0, wrong: 0, skipped: 0, timeSpentSec: 0,
        lastAttemptedDate: r.attempt.startTime,
      };
      byQuestion.set(r.questionId, acc);
    }
    if (r.isSkipped) acc.skipped += 1;
    else if (r.isCorrect === true) acc.correct += 1;
    else if (r.isCorrect === false) acc.wrong += 1;

    // Each row is exactly one question in one attempt — the finest grain,
    // so its time share is simply that attempt's total time divided evenly
    // across every question it contained (the same proportional-share
    // formula analytics.service.ts/subjectAnalytics.service.ts use, applied
    // at the per-row level instead of pre-summed per group).
    const attempt = attemptTotals.get(r.attemptId)!;
    acc.timeSpentSec += attempt.questionCount > 0 ? attempt.timeTakenSec / attempt.questionCount : 0;

    if (r.attempt.startTime > acc.lastAttemptedDate) acc.lastAttemptedDate = r.attempt.startTime;
  }

  const [subjectNames, chapterNames] = await Promise.all([
    ContentMeta.subjects(),
    ContentMeta.chapterNames([...new Set([...byQuestion.values()].map(a => a.bookExternalId).filter((id): id is string => id !== null))]),
  ]);

  return [...byQuestion.values()].map(acc => {
    const totalAttempts = acc.correct + acc.wrong + acc.skipped;
    const answered = acc.correct + acc.wrong;
    const successRatePercent = answered > 0 ? round((acc.correct / answered) * 100) : 0;
    const wrongRatePercent = answered > 0 ? round((acc.wrong / answered) * 100) : 0;
    const skipRatePercent = totalAttempts > 0 ? round((acc.skipped / totalAttempts) * 100) : 0;
    const averageTimeSpentSec = totalAttempts > 0 ? round(acc.timeSpentSec / totalAttempts) : 0;

    return {
      questionId: acc.questionId,
      promptPreview: acc.prompt.slice(0, 100),
      subjectId: acc.subjectExternalId,
      subjectName: acc.subjectExternalId ? (subjectNames.get(acc.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : UNKNOWN_SUBJECT_NAME,
      chapterId: acc.chapterExternalId,
      chapterName: acc.chapterExternalId ? (chapterNames.get(acc.chapterExternalId) ?? UNKNOWN_TOPIC_NAME) : null,
      difficulty: acc.difficulty,
      questionType: acc.questionType,
      totalAttempts,
      totalCorrect: acc.correct,
      totalWrong: acc.wrong,
      totalSkipped: acc.skipped,
      successRatePercent, wrongRatePercent, skipRatePercent,
      totalTimeSpentSec: round(acc.timeSpentSec),
      averageTimeSpentSec,
      lastAttemptedDate: acc.lastAttemptedDate,
    };
  });
}

export interface QuestionTrends {
  attemptsOverTime: TrendPoint[];
  successRateOverTime: TrendPoint[];
  skipRateOverTime: TrendPoint[];
}

/** Same week/month bucketing technique as subjectAnalytics.service.ts's
 *  getSubjectTrends, scoped to one questionId instead of one subjectId. */
async function getQuestionTrends(questionId: string, granularity: 'weekly' | 'monthly', filters: QuestionAnalyticsFilters): Promise<QuestionTrends> {
  const questionRows: PracticeAnswerRow[] = await fetchPracticeAnswerRows({ ...filters, questionId });

  const numBuckets = granularity === 'weekly' ? WEEKLY_BUCKETS : MONTHLY_BUCKETS;
  const keyOf = granularity === 'weekly' ? weekKey : monthKey;
  const bucketStart = granularity === 'weekly'
    ? startOfWeek(addWeeks(new Date(), -(numBuckets - 1)))
    : new Date(addMonths(new Date(), -(numBuckets - 1)).getFullYear(), addMonths(new Date(), -(numBuckets - 1)).getMonth(), 1);

  const orderedKeys: string[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const d = granularity === 'weekly' ? addWeeks(bucketStart, i) : addMonths(bucketStart, i);
    orderedKeys.push(keyOf(d));
  }

  const byBucket = new Map<string, { correct: number; wrong: number; skipped: number; attempts: number }>();
  for (const key of orderedKeys) byBucket.set(key, { correct: 0, wrong: 0, skipped: 0, attempts: 0 });

  for (const r of questionRows) {
    const key = keyOf(r.attempt.startTime);
    const bucket = byBucket.get(key);
    if (!bucket) continue; // outside the trend window
    if (r.isSkipped) bucket.skipped += 1;
    else if (r.isCorrect === true) bucket.correct += 1;
    else if (r.isCorrect === false) bucket.wrong += 1;
    bucket.attempts += 1;
  }

  const attemptsOverTime: TrendPoint[] = [];
  const successRateOverTime: TrendPoint[] = [];
  const skipRateOverTime: TrendPoint[] = [];
  for (const key of orderedKeys) {
    const b = byBucket.get(key)!;
    const answered = b.correct + b.wrong;
    attemptsOverTime.push({ date: key, count: b.attempts });
    successRateOverTime.push({ date: key, count: answered > 0 ? round((b.correct / answered) * 100) : 0 });
    skipRateOverTime.push({ date: key, count: b.attempts > 0 ? round((b.skipped / b.attempts) * 100) : 0 });
  }

  return { attemptsOverTime, successRateOverTime, skipRateOverTime };
}

/**
 * Feature 7: total size of the Practice question bank matching the given
 * structural filters — NOT derivable from getQuestionOverview() above,
 * since that array is built by iterating answer rows: a question with zero
 * attempts ever produces no row at all. This is the one query needed to
 * tell "attempted questions" (the array length) apart from "questions that
 * exist" (this count) — used for the Total Questions / Never Attempted
 * KPIs. dateFrom/dateTo don't apply (a bank count isn't attempt-scoped).
 */
async function getBankCount(filters: QuestionAnalyticsFilters): Promise<number> {
  return prisma.question.count({
    where: {
      status: UserStatus.ACTIVE,
      ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
      ...(filters.subjectExternalId && { subjectExternalId: filters.subjectExternalId }),
      ...(filters.chapterExternalId && { chapterExternalId: filters.chapterExternalId }),
      ...(filters.difficulty && { difficulty: filters.difficulty }),
      ...(filters.questionType && { type: filters.questionType }),
    },
  });
}

export const QuestionAnalyticsService = {
  getQuestionOverview,
  getQuestionTrends,
  getBankCount,
};
