import { prisma } from '../lib/prisma';
import { Role, UserStatus, AttemptStatus, QuizType, SubmissionStatus } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME } from './content.service';
import { GRADABLE_TYPES } from './quiz.service';

/**
 * Feature A1: Admin Dashboard.
 *
 * Everything ALREADY served elsewhere is reused as-is from the client, not
 * duplicated here: total students/assessments/practice-attempts, recent
 * assessments, and recent submissions come from the existing
 * GET /dashboard/stats; recent practice activity comes from the existing
 * GET /quizzes/attempts (QuizService.list); recent student registrations
 * come from the existing GET /users/students. This service only adds what
 * genuinely doesn't exist yet: content-catalog totals, question-bank stats,
 * today's activity, active-students-today, dashboard charts, and
 * platform-wide performance indicators — one new endpoint,
 * GET /dashboard/admin-overview, combining all of it in a single
 * Promise.all round trip.
 *
 * Every chart/stat below is at most ONE query (a count, groupBy, aggregate,
 * or a single bounded findMany bucketed in JS) — never a query per row/date,
 * so nothing here is N+1-shaped.
 */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Every QuizAttempt row is already Practice/Mixed/Olympiad-only by
 *  construction (Assessment uses the separate Submission model) — this
 *  narrows further to exclude nothing extra, kept as a named constant so
 *  every query below shares one definition, matching analytics.service.ts's
 *  own scoping convention. */
const PRACTICE_QUIZ_SCOPE = { quizType: { in: [QuizType.PRACTICE, QuizType.OLYMPIAD] } };

const ASSESSMENT_COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

/** Buckets a list of dates into one count per day across `numDays` days
 *  starting at `start` — used by every "over time" chart below. */
function bucketByDay(dates: Date[], start: Date, numDays: number): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = dateKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: { date: string; count: number }[] = [];
  for (let i = 0; i < numDays; i++) {
    const key = dateKey(addDays(start, i));
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

const CHART_WINDOW_DAYS = 30;

// ── Content Catalog Totals ────────────────────────────────────────────────
async function getContentCatalogTotals() {
  const [subjects, boards, classes] = await Promise.all([
    ContentMeta.subjects(), ContentMeta.boards(), ContentMeta.classes(),
  ]);
  return { totalSubjects: subjects.size, totalBoards: boards.size, totalClasses: classes.size };
}

// ── Question Bank Stats ───────────────────────────────────────────────────
// "Draft" has no dedicated state today — Question.status is UserStatus
// (ACTIVE/PENDING/INACTIVE) and every create path hardcodes ACTIVE, so
// draft = total - active is honestly 0 right now, not fabricated.
async function getQuestionBankStats() {
  const [total, active, byType, subjectRows, chapterRows] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.question.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.question.groupBy({ by: ['subjectExternalId'], where: { subjectExternalId: { not: null } } }),
    prisma.question.groupBy({ by: ['chapterExternalId'], where: { chapterExternalId: { not: null } } }),
  ]);

  return {
    total,
    active,
    draft: Math.max(0, total - active),
    subjectsCovered: subjectRows.length,
    chaptersCovered: chapterRows.length,
    byType: Object.fromEntries(byType.map(r => [r.type, r._count._all])) as Record<string, number>,
    // Cheap, real check for the "Practice Olympiad has no questions" alert —
    // reuses the exact GRADABLE_TYPES set every start*/preview* method in
    // quiz.service.ts already scopes against, not a new definition.
    gradableActiveCount: await prisma.question.count({ where: { status: UserStatus.ACTIVE, type: { in: GRADABLE_TYPES } } }),
  };
}

// ── Today's Activity ──────────────────────────────────────────────────────
async function getTodaysActivity() {
  const start = startOfDay(new Date());
  const end = addDays(start, 1);
  const todayRange = { gte: start, lt: end };

  const [studentsLoggedIn, practiceStarted, practiceCompleted, assessmentsStarted, assessmentsCompleted] = await Promise.all([
    prisma.user.count({ where: { role: Role.STUDENT, lastLoginAt: todayRange } }),
    prisma.quizAttempt.count({ where: { startTime: todayRange, quiz: PRACTICE_QUIZ_SCOPE } }),
    prisma.quizAttempt.count({ where: { status: AttemptStatus.SUBMITTED, endTime: todayRange, quiz: PRACTICE_QUIZ_SCOPE } }),
    prisma.submission.count({ where: { startedAt: todayRange } }),
    prisma.submission.count({ where: { status: ASSESSMENT_COUNTABLE, submittedAt: todayRange } }),
  ]);

  return { studentsLoggedIn, practiceStarted, practiceCompleted, assessmentsStarted, assessmentsCompleted };
}

/** Distinct students active today, by login OR practice activity — a
 *  broader signal than "logged in," reusing the same today-range as
 *  getTodaysActivity (not a new time-window definition). */
async function getActiveStudentsToday(): Promise<number> {
  const start = startOfDay(new Date());
  const end = addDays(start, 1);
  const todayRange = { gte: start, lt: end };

  const [loggedIn, practiced] = await Promise.all([
    prisma.user.findMany({ where: { role: Role.STUDENT, lastLoginAt: todayRange }, select: { id: true } }),
    prisma.quizAttempt.findMany({
      where: { startTime: todayRange, quiz: PRACTICE_QUIZ_SCOPE },
      select: { studentId: true }, distinct: ['studentId'],
    }),
  ]);

  return new Set([...loggedIn.map(u => u.id), ...practiced.map(r => r.studentId)]).size;
}

// ── Charts ────────────────────────────────────────────────────────────────

async function getStudentGrowthChart() {
  const start = addDays(startOfDay(new Date()), -(CHART_WINDOW_DAYS - 1));
  const rows = await prisma.user.findMany({
    where: { role: Role.STUDENT, createdAt: { gte: start } },
    select: { createdAt: true },
  });
  return bucketByDay(rows.map(r => r.createdAt), start, CHART_WINDOW_DAYS);
}

async function getPracticeActivityChart() {
  const start = addDays(startOfDay(new Date()), -(CHART_WINDOW_DAYS - 1));
  const rows = await prisma.quizAttempt.findMany({
    where: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE, startTime: { gte: start } },
    select: { startTime: true },
  });
  return bucketByDay(rows.map(r => r.startTime), start, CHART_WINDOW_DAYS);
}

async function getDailyActiveStudentsChart() {
  const start = addDays(startOfDay(new Date()), -(CHART_WINDOW_DAYS - 1));
  const rows = await prisma.quizAttempt.findMany({
    where: { quiz: PRACTICE_QUIZ_SCOPE, startTime: { gte: start } },
    select: { startTime: true, studentId: true },
  });

  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = dateKey(r.startTime);
    const set = byDay.get(key) ?? new Set<string>();
    set.add(r.studentId);
    byDay.set(key, set);
  }

  const days: { date: string; count: number }[] = [];
  for (let i = 0; i < CHART_WINDOW_DAYS; i++) {
    const key = dateKey(addDays(start, i));
    days.push({ date: key, count: byDay.get(key)?.size ?? 0 });
  }
  return days;
}

/**
 * Subject Popularity — ranked by submitted attempt count. Practice/Mixed/
 * Olympiad Quiz rows are lazy-singletons (one per subject, one for Mixed,
 * one per class for Olympiad — see quiz.service.ts's getOrCreate* helpers),
 * so grouping by quizId first stays a small, bounded result set regardless
 * of platform scale; only that small set is then resolved to subject names,
 * never one query per attempt.
 */
async function getSubjectPopularityChart() {
  const quizCounts = await prisma.quizAttempt.groupBy({
    by: ['quizId'],
    where: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE },
    _count: { _all: true },
  });
  if (!quizCounts.length) return [];

  const quizzes = await prisma.quiz.findMany({
    where: { id: { in: quizCounts.map(q => q.quizId) } },
    select: { id: true, subjectExternalId: true },
  });
  const subjectByQuiz = new Map(quizzes.map(q => [q.id, q.subjectExternalId]));

  const bySubject = new Map<string, number>();
  for (const qc of quizCounts) {
    const subjectExternalId = subjectByQuiz.get(qc.quizId);
    // Mixed Subjects Practice / Olympiad / Retry / Revision quizzes have no
    // single subject — excluded from this per-subject ranking, not an error.
    if (!subjectExternalId) continue;
    bySubject.set(subjectExternalId, (bySubject.get(subjectExternalId) ?? 0) + qc._count._all);
  }

  const subjectNames = await ContentMeta.subjects();
  return [...bySubject.entries()]
    .map(([id, count]) => ({ subjectId: id, subjectName: subjectNames.get(id) ?? UNKNOWN_SUBJECT_NAME, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// Platform-wide accuracy bands — deliberately 4 bands (matching the spec's
// own example), distinct from analytics.service.ts's 5-band per-student
// distribution (Feature 6) and consistencyEngine.ts's monthly-consistency
// bands — three different metrics that happen to share the word
// "distribution"/"consistency," not the same calculation reused three ways.
const ACCURACY_DISTRIBUTION_BANDS = [
  { band: '90-100%', min: 90 },
  { band: '80-89%', min: 80 },
  { band: '70-79%', min: 70 },
  { band: 'Below 70%', min: -Infinity },
] as const;

async function getAccuracyDistributionChart() {
  const rows = await prisma.quizAttempt.findMany({
    where: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE },
    select: { percentage: true },
  });
  if (!rows.length) return [];

  return ACCURACY_DISTRIBUTION_BANDS.map(({ band, min }, i) => {
    const max = i > 0 ? ACCURACY_DISTRIBUTION_BANDS[i - 1].min : Infinity;
    const count = rows.filter(r => r.percentage >= min && r.percentage < max).length;
    return { band, count, percentage: round((count / rows.length) * 100) };
  });
}

// ── Performance Indicators ────────────────────────────────────────────────
async function getPerformanceIndicators() {
  const [agg, answerCount, attemptCount] = await Promise.all([
    prisma.quizAttempt.aggregate({
      where: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE },
      _avg: { percentage: true, timeTakenSec: true },
    }),
    prisma.attemptAnswer.count({ where: { attempt: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE } } }),
    prisma.quizAttempt.count({ where: { status: AttemptStatus.SUBMITTED, quiz: PRACTICE_QUIZ_SCOPE } }),
  ]);

  const avgAccuracy = round(agg._avg.percentage ?? 0);

  return {
    avgAccuracy,
    // Simplified platform-wide proxy — NOT the exact per-student 5-factor
    // formula in client/src/lib/confidenceScore.ts (Feature 8), which needs
    // per-student subject-balance/question-type data that isn't cheaply
    // aggregatable across every student without a query per student (N+1).
    // Reuses accuracy — the real confidence score's single largest weighted
    // factor (35%) — as an honest, clearly-labeled platform-wide stand-in.
    avgConfidenceScoreApprox: Math.round(avgAccuracy),
    avgPracticeTimeSec: Math.round(agg._avg.timeTakenSec ?? 0),
    avgQuestionsPerSession: attemptCount > 0 ? round(answerCount / attemptCount) : 0,
  };
}

export const AdminDashboardService = {
  async getOverview() {
    const [
      contentCatalog, questionBank, todaysActivity, activeStudentsToday,
      studentGrowth, practiceActivity, subjectPopularity, accuracyDistribution, dailyActiveStudents,
      performanceIndicators,
    ] = await Promise.all([
      getContentCatalogTotals(),
      getQuestionBankStats(),
      getTodaysActivity(),
      getActiveStudentsToday(),
      getStudentGrowthChart(),
      getPracticeActivityChart(),
      getSubjectPopularityChart(),
      getAccuracyDistributionChart(),
      getDailyActiveStudentsChart(),
      getPerformanceIndicators(),
    ]);

    return {
      contentCatalog,
      questionBank,
      todaysActivity,
      activeStudentsToday,
      charts: { studentGrowth, practiceActivity, subjectPopularity, accuracyDistribution, dailyActiveStudents },
      performanceIndicators,
    };
  },
};
