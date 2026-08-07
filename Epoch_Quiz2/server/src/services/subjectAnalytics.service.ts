import { Difficulty } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';
import {
  fetchPracticeAnswerRows, buildAttemptTotals, round,
  startOfWeek, weekKey, monthKey, addWeeks, addMonths,
  WEEKLY_BUCKETS, MONTHLY_BUCKETS,
  type PracticeAnalyticsFilters, type PracticeAnswerRow, type TrendPoint,
} from './practiceAnalyticsShared.service';
import { prisma } from '../lib/prisma';
import { Role } from '../lib/enums';

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
 * The bulk fetch, per-attempt time bookkeeping, and week/month bucketing are
 * shared with Feature 4 (Question Analytics) via
 * practiceAnalyticsShared.service.ts — see that file's header for why.
 */

export type SubjectAnalyticsFilters = PracticeAnalyticsFilters;

function sliceAccuracy(s: { correct: number; wrong: number }): number {
  const ans = s.correct + s.wrong;
  return ans > 0 ? round((s.correct / ans) * 100) : 0;
}

const DIFFICULTY_BANDS: Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD];

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
function buildSubjectSlices(rows: PracticeAnswerRow[]): Map<string, SubjectAttemptSlice> {
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
  const studentFilter = (filters.classExternalId || filters.boardExternalId)
    ? { studentProfile: { ...(filters.classExternalId && { classExternalId: filters.classExternalId }), ...(filters.boardExternalId && { boardExternalId: filters.boardExternalId }) } }
    : undefined;
  const [rows, totalStudentsOnPlatform, subjectNames] = await Promise.all([
    fetchPracticeAnswerRows(filters),
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
      subjectName: subjectNames.get(subjectExternalId) ?? UNKNOWN_SUBJECT_NAME,
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
  const rows = await fetchPracticeAnswerRows({ ...filters, subjectExternalId: subjectId });
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
      topicName: chapterNames.get(chapterExternalId) ?? UNKNOWN_TOPIC_NAME,
      totalAttempts, accuracyPercent, averageScore, averageTimePerQuestionSec,
    };
  });

  return chapters.sort((a, b) => b.accuracyPercent - a.accuracyPercent);
}

// ── Trends ────────────────────────────────────────────────────────────────

export type { TrendPoint };
export interface SubjectTrends {
  accuracyOverTime: TrendPoint[];
  attemptsOverTime: TrendPoint[];
  participationOverTime: TrendPoint[];
}

/** One attempt-level record per (attempt, subject) — the same slices
 *  getSubjectOverview builds, just for a single subject, then bucketed by
 *  calendar week/month for the trend charts. */
async function getSubjectTrends(subjectId: string, granularity: 'weekly' | 'monthly', filters: SubjectAnalyticsFilters): Promise<SubjectTrends> {
  const rows = await fetchPracticeAnswerRows({ ...filters, subjectExternalId: subjectId });
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
