import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AttemptStatus, QuizType, Role, Difficulty } from '../lib/enums';
import { ContentMeta } from './content.service';

/**
 * Admin Analytics — Feature 3: Subject Analytics.
 *
 * Platform-wide, grouped by subject — a different axis from Feature 2's
 * per-student view, so it needs a new query (no existing function computes
 * "across every student, grouped by subject"). The ALGORITHM reused here is
 * identical to analytics.service.ts's getSubjectBreakdown/getTopicBreakdown
 * (per-(subject,attempt) slicing, proportional time-allocation for Mixed
 * attempts) — only the query is new, because it spans every student instead
 * of one. Practice Olympiad only (quizType !== OLYMPIAD, status ===
 * SUBMITTED) — never touches Submission (Assessment) or leaderboard data.
 *
 * One bulk AttemptAnswer fetch per filter combination feeds every
 * sub-computation (overview, difficulty breakdown, growth %) in a single
 * pass — chapter breakdown and full trend series are separate, lazy,
 * per-subject-on-demand fetches (only when an admin expands one subject),
 * so nothing here is O(subjects x heavy-computation) up front.
 */

export interface SubjectAnalyticsFilters {
  classExternalId?: string;
  boardExternalId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function studentProfileFilter(filters: SubjectAnalyticsFilters): Prisma.UserWhereInput | undefined {
  if (!filters.classExternalId && !filters.boardExternalId) return undefined;
  return {
    studentProfile: {
      ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
      ...(filters.boardExternalId && { boardExternalId: filters.boardExternalId }),
    },
  };
}

function buildAttemptWhere(filters: SubjectAnalyticsFilters): Prisma.QuizAttemptWhereInput {
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

async function fetchRows(filters: SubjectAnalyticsFilters, subjectExternalId?: string) {
  return prisma.attemptAnswer.findMany({
    where: {
      attempt: buildAttemptWhere(filters),
      ...(subjectExternalId && { question: { subjectExternalId } }),
    },
    select: {
      isCorrect: true, isSkipped: true, marksAwarded: true, attemptId: true,
      attempt: { select: { studentId: true, startTime: true, timeTakenSec: true } },
      question: { select: { subjectExternalId: true, marks: true, difficulty: true, chapterExternalId: true, bookExternalId: true } },
    },
  });
}

type AnswerRow = Awaited<ReturnType<typeof fetchRows>>[number];

interface AttemptTotals { questionCount: number; timeTakenSec: number }

/** Per-attempt question count + timeTakenSec — same bookkeeping helper as
 *  analytics.service.ts's buildAttemptTotals, used to proportionally split
 *  a Mixed attempt's real total time across whichever subject it touched. */
function buildAttemptTotals(rows: AnswerRow[]): Map<string, AttemptTotals> {
  const totals = new Map<string, AttemptTotals>();
  for (const r of rows) {
    const cur = totals.get(r.attemptId);
    if (cur) cur.questionCount += 1;
    else totals.set(r.attemptId, { questionCount: 1, timeTakenSec: r.attempt.timeTakenSec });
  }
  return totals;
}

interface SubjectAttemptSlice {
  subjectExternalId: string;
  attemptId: string;
  studentId: string;
  startTime: Date;
  correct: number; wrong: number; skipped: number;
  scoreInAttempt: number; marksInAttempt: number;
}

/** Groups rows into per-(subject,attempt) slices — identical technique to
 *  analytics.service.ts's getSubjectBreakdown, just not scoped to one
 *  studentId. A Mixed Subjects Practice attempt naturally splits across
 *  every subject it touched; a single-subject attempt's questions all
 *  share one subject — both fall out of the same grouping. */
function buildSubjectSlices(rows: AnswerRow[]): Map<string, SubjectAttemptSlice> {
  const slices = new Map<string, SubjectAttemptSlice>();
  for (const r of rows) {
    const subjectExternalId = r.question.subjectExternalId;
    if (subjectExternalId === null) continue;
    const key = `${subjectExternalId}::${r.attemptId}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = {
        subjectExternalId, attemptId: r.attemptId, studentId: r.attempt.studentId, startTime: r.attempt.startTime,
        correct: 0, wrong: 0, skipped: 0, scoreInAttempt: 0, marksInAttempt: 0,
      };
      slices.set(key, slice);
    }
    if (r.isSkipped) slice.skipped += 1;
    else if (r.isCorrect === true) slice.correct += 1;
    else if (r.isCorrect === false) slice.wrong += 1;
    slice.scoreInAttempt += r.marksAwarded;
    slice.marksInAttempt += r.question.marks;
  }
  return slices;
}

function sliceAccuracy(s: { correct: number; wrong: number }): number {
  const ans = s.correct + s.wrong;
  return ans > 0 ? round((s.correct / ans) * 100) : 0;
}

const DIFFICULTY_BANDS: Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD];

export interface SubjectOverviewRow {
  subjectId: string;
  subjectName: string;
  totalStudentsPracticed: number;
  totalStudentsNeverPracticed: number;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageScore: number;
  averageTimePerQuestionSec: number;
  lastActivityDate: Date | null;
  difficulty: Record<'EASY' | 'MEDIUM' | 'HARD', number | null>;
  growthPercent: number | null;
  participationGrowthPercent: number | null;
}

const GROWTH_WINDOW_DAYS = 30;

async function getSubjectOverview(filters: SubjectAnalyticsFilters): Promise<{ subjects: SubjectOverviewRow[]; totalStudentsOnPlatform: number }> {
  const studentFilter = studentProfileFilter(filters);
  const [rows, totalStudentsOnPlatform, subjectNames] = await Promise.all([
    fetchRows(filters),
    prisma.user.count({ where: { role: Role.STUDENT, ...studentFilter } }),
    ContentMeta.subjects(),
  ]);

  if (!rows.length) return { subjects: [], totalStudentsOnPlatform };

  const attemptTotals = buildAttemptTotals(rows);
  const slices = buildSubjectSlices(rows);

  const bySubject = new Map<string, SubjectAttemptSlice[]>();
  for (const slice of slices.values()) {
    const list = bySubject.get(slice.subjectExternalId);
    if (list) list.push(slice); else bySubject.set(slice.subjectExternalId, [slice]);
  }

  // Difficulty breakdown — same rows, grouped one level further by
  // (subject, difficulty). Doesn't need the Mixed-attempt time-allocation
  // slicing above (accuracy only), so a simpler direct accumulation.
  interface DiffAcc { correct: number; wrong: number }
  const byDifficulty = new Map<string, DiffAcc>(); // key: `${subjectId}::${difficulty}`
  for (const r of rows) {
    const subjectExternalId = r.question.subjectExternalId;
    if (subjectExternalId === null) continue;
    const key = `${subjectExternalId}::${r.question.difficulty}`;
    const acc = byDifficulty.get(key) ?? { correct: 0, wrong: 0 };
    if (r.isCorrect === true) acc.correct += 1;
    else if (r.isCorrect === false) acc.wrong += 1;
    byDifficulty.set(key, acc);
  }

  const now = Date.now();
  const recentStart = now - GROWTH_WINDOW_DAYS * 86_400_000;
  const priorStart = now - GROWTH_WINDOW_DAYS * 2 * 86_400_000;

  const subjects: SubjectOverviewRow[] = [...bySubject.entries()].map(([subjectExternalId, subjectSlices]) => {
    const totalAttempts = subjectSlices.length;
    const totalCorrect = subjectSlices.reduce((s, x) => s + x.correct, 0);
    const totalWrong = subjectSlices.reduce((s, x) => s + x.wrong, 0);
    const totalSkipped = subjectSlices.reduce((s, x) => s + x.skipped, 0);
    const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;
    const answered = totalCorrect + totalWrong;
    const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

    const scores = subjectSlices.map(x => x.scoreInAttempt);
    const averageScore = round(scores.reduce((s, x) => s + x, 0) / totalAttempts);

    const allocatedTimeSec = subjectSlices.reduce((s, x) => {
      const attempt = attemptTotals.get(x.attemptId)!;
      const questionsInThisSubjectForAttempt = x.correct + x.wrong + x.skipped;
      const share = attempt.questionCount > 0 ? questionsInThisSubjectForAttempt / attempt.questionCount : 0;
      return s + attempt.timeTakenSec * share;
    }, 0);
    const averageTimePerQuestionSec = totalQuestionsAttempted > 0 ? round(allocatedTimeSec / totalQuestionsAttempted) : 0;

    const totalStudentsPracticed = new Set(subjectSlices.map(x => x.studentId)).size;
    const lastActivityDate = new Date(Math.max(...subjectSlices.map(x => x.startTime.getTime())));

    const difficulty = Object.fromEntries(
      DIFFICULTY_BANDS.map(band => {
        const acc = byDifficulty.get(`${subjectExternalId}::${band}`);
        const bandAnswered = acc ? acc.correct + acc.wrong : 0;
        return [band, bandAnswered > 0 ? round((acc!.correct / bandAnswered) * 100) : null];
      }),
    ) as Record<'EASY' | 'MEDIUM' | 'HARD', number | null>;

    const recentSlices = subjectSlices.filter(s => s.startTime.getTime() >= recentStart);
    const priorSlices = subjectSlices.filter(s => s.startTime.getTime() >= priorStart && s.startTime.getTime() < recentStart);
    const recentAcc = recentSlices.length ? sliceAccuracy({ correct: recentSlices.reduce((s, x) => s + x.correct, 0), wrong: recentSlices.reduce((s, x) => s + x.wrong, 0) }) : null;
    const priorAcc = priorSlices.length ? sliceAccuracy({ correct: priorSlices.reduce((s, x) => s + x.correct, 0), wrong: priorSlices.reduce((s, x) => s + x.wrong, 0) }) : null;
    const growthPercent = recentAcc !== null && priorAcc !== null ? round(recentAcc - priorAcc) : null;

    // Participation growth — distinct-student count in the same two windows
    // (not accuracy) — feeds the "{subject} participation has declined"
    // style insight, a genuinely different signal from accuracy growth.
    const recentStudents = new Set(recentSlices.map(x => x.studentId)).size;
    const priorStudents = new Set(priorSlices.map(x => x.studentId)).size;
    const participationGrowthPercent = priorStudents > 0
      ? round(((recentStudents - priorStudents) / priorStudents) * 100)
      : null;

    return {
      subjectId: subjectExternalId,
      subjectName: subjectNames.get(subjectExternalId) ?? subjectExternalId,
      totalStudentsPracticed,
      totalStudentsNeverPracticed: Math.max(0, totalStudentsOnPlatform - totalStudentsPracticed),
      totalAttempts,
      totalQuestionsAttempted,
      totalCorrect, totalWrong, totalSkipped,
      accuracyPercent, averageScore, averageTimePerQuestionSec,
      lastActivityDate,
      difficulty,
      growthPercent,
      participationGrowthPercent,
    };
  });

  return { subjects, totalStudentsOnPlatform };
}

export interface SubjectChapterRow {
  topicId: string;
  topicName: string;
  totalAttempts: number;
  accuracyPercent: number;
  averageScore: number;
  averageTimePerQuestionSec: number;
}

/** Same per-(chapter,attempt) slicing technique as analytics.service.ts's
 *  getTopicBreakdown, scoped to one subject and platform-wide instead of
 *  per-student. Sorted strongest -> weakest by accuracy. */
async function getSubjectChapters(subjectId: string, filters: SubjectAnalyticsFilters): Promise<SubjectChapterRow[]> {
  const rows = await fetchRows(filters, subjectId);
  if (!rows.length) return [];

  const attemptTotals = buildAttemptTotals(rows);

  interface ChapterSlice {
    chapterExternalId: string;
    bookExternalId: string | null;
    attemptId: string;
    correct: number; wrong: number; skipped: number;
    scoreInAttempt: number;
  }
  const slices = new Map<string, ChapterSlice>();
  for (const r of rows) {
    const chapterExternalId = r.question.chapterExternalId;
    if (chapterExternalId === null) continue;
    const key = `${chapterExternalId}::${r.attemptId}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = { chapterExternalId, bookExternalId: r.question.bookExternalId, attemptId: r.attemptId, correct: 0, wrong: 0, skipped: 0, scoreInAttempt: 0 };
      slices.set(key, slice);
    }
    if (r.isSkipped) slice.skipped += 1;
    else if (r.isCorrect === true) slice.correct += 1;
    else if (r.isCorrect === false) slice.wrong += 1;
    slice.scoreInAttempt += r.marksAwarded;
  }

  const byChapter = new Map<string, ChapterSlice[]>();
  for (const slice of slices.values()) {
    const list = byChapter.get(slice.chapterExternalId);
    if (list) list.push(slice); else byChapter.set(slice.chapterExternalId, [slice]);
  }
  if (!byChapter.size) return [];

  const bookIds = [...new Set([...byChapter.values()].flatMap(list => list.map(s => s.bookExternalId).filter((id): id is string => id !== null)))];
  const chapterNames = await ContentMeta.chapterNames(bookIds);

  const chapters = [...byChapter.entries()].map(([chapterExternalId, chapterSlices]) => {
    const totalAttempts = chapterSlices.length;
    const totalCorrect = chapterSlices.reduce((s, x) => s + x.correct, 0);
    const totalWrong = chapterSlices.reduce((s, x) => s + x.wrong, 0);
    const totalSkipped = chapterSlices.reduce((s, x) => s + x.skipped, 0);
    const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;
    const accuracyPercent = sliceAccuracy({ correct: totalCorrect, wrong: totalWrong });
    const averageScore = round(chapterSlices.reduce((s, x) => s + x.scoreInAttempt, 0) / totalAttempts);

    const allocatedTimeSec = chapterSlices.reduce((s, x) => {
      const attempt = attemptTotals.get(x.attemptId)!;
      const questionsInThisChapterForAttempt = x.correct + x.wrong + x.skipped;
      const share = attempt.questionCount > 0 ? questionsInThisChapterForAttempt / attempt.questionCount : 0;
      return s + attempt.timeTakenSec * share;
    }, 0);
    const averageTimePerQuestionSec = totalQuestionsAttempted > 0 ? round(allocatedTimeSec / totalQuestionsAttempted) : 0;

    return {
      topicId: chapterExternalId,
      topicName: chapterNames.get(chapterExternalId) ?? chapterExternalId,
      totalAttempts, accuracyPercent, averageScore, averageTimePerQuestionSec,
    };
  });

  return chapters.sort((a, b) => b.accuracyPercent - a.accuracyPercent);
}

// ── Trends ────────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  x.setDate(x.getDate() - diffToMonday);
  return x;
}

function weekKey(d: Date): string {
  return startOfWeek(d).toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

const WEEKLY_BUCKETS = 12;
const MONTHLY_BUCKETS = 6;

export interface TrendPoint { date: string; count: number }
export interface SubjectTrends {
  accuracyOverTime: TrendPoint[];
  attemptsOverTime: TrendPoint[];
  participationOverTime: TrendPoint[];
}

/** One attempt-level record per (attempt, subject) — the same slices
 *  getSubjectOverview builds, just for a single subject, then bucketed by
 *  calendar week/month for the trend charts. */
async function getSubjectTrends(subjectId: string, granularity: 'weekly' | 'monthly', filters: SubjectAnalyticsFilters): Promise<SubjectTrends> {
  const rows = await fetchRows(filters, subjectId);
  const slices = buildSubjectSlices(rows);
  const attemptSlices = [...slices.values()];

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

  const byBucket = new Map<string, { correct: number; wrong: number; attempts: number; students: Set<string> }>();
  for (const key of orderedKeys) byBucket.set(key, { correct: 0, wrong: 0, attempts: 0, students: new Set() });

  for (const s of attemptSlices) {
    const key = keyOf(s.startTime);
    const bucket = byBucket.get(key);
    if (!bucket) continue; // outside the trend window
    bucket.correct += s.correct;
    bucket.wrong += s.wrong;
    bucket.attempts += 1;
    bucket.students.add(s.studentId);
  }

  const accuracyOverTime: TrendPoint[] = [];
  const attemptsOverTime: TrendPoint[] = [];
  const participationOverTime: TrendPoint[] = [];
  for (const key of orderedKeys) {
    const b = byBucket.get(key)!;
    const answered = b.correct + b.wrong;
    accuracyOverTime.push({ date: key, count: answered > 0 ? round((b.correct / answered) * 100) : 0 });
    attemptsOverTime.push({ date: key, count: b.attempts });
    participationOverTime.push({ date: key, count: b.students.size });
  }

  return { accuracyOverTime, attemptsOverTime, participationOverTime };
}

export const SubjectAnalyticsService = {
  getSubjectOverview,
  getSubjectChapters,
  getSubjectTrends,
};
