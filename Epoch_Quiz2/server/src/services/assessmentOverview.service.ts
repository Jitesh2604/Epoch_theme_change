import { prisma } from '../lib/prisma';
import { AssessmentStatus } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_CLASS_NAME } from './content.service';
import { pct } from './leaderboard.service';
import {
  fetchSubmissions, resolveAssignedStudentCounts, round, COUNTABLE_SUBMISSION_STATUSES,
  startOfWeek, weekKey, monthKey, yearKey, addWeeks, addMonths, addYears,
  WEEKLY_BUCKETS, MONTHLY_BUCKETS, YEARLY_BUCKETS,
  type AssessmentAnalyticsFilters, type AssessmentSubmissionRow, type TrendPoint,
} from './assessmentAnalyticsShared.service';

/**
 * Admin Analytics — Feature 5: Assessment Analytics — overview, per-assessment
 * table, class-wise performance, and trends.
 *
 * One bulk fetchSubmissions() call feeds every view here (KPIs, the
 * Assessment Performance Table, Class-wise Performance) — each is a
 * different re-grouping of the same rows, not a separate query. Trends are
 * a second, independent fetchSubmissions() call scoped by the trend's own
 * date window, fetched lazily on demand (see the controller).
 *
 * computeSubmissionStats() is the single source of truth for every derived
 * number (average/median/stddev/pass-rate/time) — reused unmodified at
 * three granularities (platform KPIs, one assessment, one class) so the
 * three views can never disagree with each other over the same underlying
 * submissions.
 */

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(xs: number[]): number {
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export interface SubmissionStats {
  totalAttempts: number;
  completedAttempts: number;
  incompleteAttempts: number;
  averageScore: number;
  averagePercentage: number;
  highestScore: number;
  lowestScore: number;
  medianScore: number;
  stdDeviationScore: number;
  passRate: number;
  failRate: number;
  averageCompletionTimeSec: number;
}

/** Reduces any array of submissions (platform-wide, one assessment, or one
 *  class) into the same set of derived stats — only SUBMITTED/GRADED rows
 *  contribute to score/time/pass-rate math; IN_PROGRESS rows only affect
 *  totalAttempts/incompleteAttempts, since their score/timeTakenSec are
 *  meaningless placeholders (0) until finalized. */
export function computeSubmissionStats(subs: AssessmentSubmissionRow[]): SubmissionStats {
  const completed = subs.filter(s => (COUNTABLE_SUBMISSION_STATUSES as string[]).includes(s.status));
  const scores = completed.map(s => s.score);
  const percentages = completed.map(s => pct(s.score, s.totalMarks));
  const times = completed.map(s => s.timeTakenSec);
  const passedCount = completed.filter(s => s.score >= s.assessment.passingMarks).length;

  return {
    totalAttempts: subs.length,
    completedAttempts: completed.length,
    incompleteAttempts: subs.length - completed.length,
    averageScore: scores.length ? round(mean(scores)) : 0,
    averagePercentage: percentages.length ? round(mean(percentages)) : 0,
    highestScore: scores.length ? Math.max(...scores) : 0,
    lowestScore: scores.length ? Math.min(...scores) : 0,
    medianScore: scores.length ? round(median(scores)) : 0,
    stdDeviationScore: scores.length ? round(stddev(scores)) : 0,
    passRate: completed.length ? round((passedCount / completed.length) * 100) : 0,
    failRate: completed.length ? round(((completed.length - passedCount) / completed.length) * 100) : 0,
    averageCompletionTimeSec: times.length ? Math.round(mean(times)) : 0,
  };
}

export interface AssessmentKPIs extends SubmissionStats {
  totalAssessments: number;
  draftAssessments: number;
  publishedAssessments: number;
  /** Alias of publishedAssessments — AssessmentStatus has no separate
   *  ACTIVE value (see assessmentAnalyticsShared.service.ts's header for
   *  why); documented here rather than silently duplicated. */
  activeAssessments: number;
  /** Alias of the ARCHIVED count — there is no date-window "closed"
   *  concept in this schema today. */
  closedAssessments: number;
}

export interface AssessmentTableRow extends SubmissionStats {
  assessmentId: string;
  title: string;
  classId: string | null;
  className: string;
  subjectId: string | null;
  subjectName: string;
  status: AssessmentStatus;
  totalQuestions: number;
  studentsAssigned: number;
  studentsAttempted: number;
  studentsCompleted: number;
  participationRate: number;
}

export interface ClassPerformanceRow extends SubmissionStats {
  classId: string | null;
  className: string;
  totalAssessments: number;
  studentsAssigned: number;
  studentsAttempted: number;
  participationRate: number;
}

function assessmentWhereFromFilters(filters: AssessmentAnalyticsFilters) {
  return {
    ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
    ...(filters.subjectExternalId && { subjectExternalId: filters.subjectExternalId }),
    ...(filters.assessmentId && { id: filters.assessmentId }),
  };
}

async function getOverview(filters: AssessmentAnalyticsFilters) {
  const assessmentWhere = assessmentWhereFromFilters(filters);

  const [assessments, submissions, classNames, subjectNames] = await Promise.all([
    prisma.assessment.findMany({
      where: assessmentWhere,
      select: {
        id: true, title: true, status: true, classExternalId: true, subjectExternalId: true,
        passingMarks: true, _count: { select: { questions: true } },
      },
    }),
    fetchSubmissions(filters),
    ContentMeta.classes(),
    ContentMeta.subjects(),
  ]);

  const assignedCounts = await resolveAssignedStudentCounts(assessments.map(a => a.id));

  const submissionsByAssessment = new Map<string, AssessmentSubmissionRow[]>();
  for (const s of submissions) {
    const list = submissionsByAssessment.get(s.assessmentId) ?? [];
    list.push(s);
    submissionsByAssessment.set(s.assessmentId, list);
  }

  const tableRows: AssessmentTableRow[] = assessments.map(a => {
    const subs = submissionsByAssessment.get(a.id) ?? [];
    const stats = computeSubmissionStats(subs);
    const assigned = assignedCounts.get(a.id) ?? 0;
    const attemptedStudentIds = new Set(subs.map(s => s.studentId));
    const completedStudentIds = new Set(
      subs.filter(s => (COUNTABLE_SUBMISSION_STATUSES as string[]).includes(s.status)).map(s => s.studentId),
    );

    return {
      ...stats,
      assessmentId: a.id,
      title: a.title,
      classId: a.classExternalId,
      className: a.classExternalId ? (classNames.get(a.classExternalId) ?? UNKNOWN_CLASS_NAME) : 'All Classes',
      subjectId: a.subjectExternalId,
      subjectName: a.subjectExternalId ? (subjectNames.get(a.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : 'Mixed Subjects',
      status: a.status,
      totalQuestions: a._count.questions,
      studentsAssigned: assigned,
      studentsAttempted: attemptedStudentIds.size,
      studentsCompleted: completedStudentIds.size,
      participationRate: assigned > 0 ? round((attemptedStudentIds.size / assigned) * 100) : 0,
    };
  });

  // Class-wise Performance — regroups the same submissions by
  // assessment.classExternalId, no second fetch. Weighted by actual
  // submission counts (via computeSubmissionStats over the raw pooled
  // submissions), not a naive average of already-averaged per-assessment
  // numbers, so a class with more participants is correctly weighted
  // more heavily.
  const assessmentsByClass = new Map<string, { classId: string | null; className: string; assessmentIds: string[] }>();
  for (const a of assessments) {
    const key = a.classExternalId ?? '__none__';
    const entry = assessmentsByClass.get(key) ?? {
      classId: a.classExternalId,
      className: a.classExternalId ? (classNames.get(a.classExternalId) ?? UNKNOWN_CLASS_NAME) : 'All Classes',
      assessmentIds: [],
    };
    entry.assessmentIds.push(a.id);
    assessmentsByClass.set(key, entry);
  }
  const classPerformance: ClassPerformanceRow[] = [...assessmentsByClass.values()].map(entry => {
    const pooledSubs = entry.assessmentIds.flatMap(id => submissionsByAssessment.get(id) ?? []);
    const stats = computeSubmissionStats(pooledSubs);
    const assigned = entry.assessmentIds.reduce((s, id) => s + (assignedCounts.get(id) ?? 0), 0);
    const attemptedStudentIds = new Set(pooledSubs.map(s => s.studentId));
    return {
      ...stats,
      classId: entry.classId,
      className: entry.className,
      totalAssessments: entry.assessmentIds.length,
      studentsAssigned: assigned,
      studentsAttempted: attemptedStudentIds.size,
      participationRate: assigned > 0 ? round((attemptedStudentIds.size / assigned) * 100) : 0,
    };
  });

  const draftAssessments = assessments.filter(a => a.status === AssessmentStatus.DRAFT).length;
  const publishedAssessments = assessments.filter(a => a.status === AssessmentStatus.PUBLISHED).length;
  const closedAssessments = assessments.filter(a => a.status === AssessmentStatus.ARCHIVED).length;
  const platformStats = computeSubmissionStats(submissions);

  const kpis: AssessmentKPIs = {
    ...platformStats,
    totalAssessments: assessments.length,
    draftAssessments, publishedAssessments,
    activeAssessments: publishedAssessments,
    closedAssessments,
  };

  return { kpis, assessments: tableRows, classPerformance };
}

export interface AssessmentTrends {
  attemptsOverTime: TrendPoint[];
  averageScoreOverTime: TrendPoint[];
  participationOverTime: TrendPoint[];
  passRateOverTime: TrendPoint[];
}

async function getAssessmentTrends(granularity: 'weekly' | 'monthly' | 'yearly', filters: AssessmentAnalyticsFilters): Promise<AssessmentTrends> {
  const submissions = await fetchSubmissions(filters);

  const numBuckets = granularity === 'weekly' ? WEEKLY_BUCKETS : granularity === 'monthly' ? MONTHLY_BUCKETS : YEARLY_BUCKETS;
  const keyOf = granularity === 'weekly' ? weekKey : granularity === 'monthly' ? monthKey : yearKey;
  const addFn = granularity === 'weekly' ? addWeeks : granularity === 'monthly' ? addMonths : addYears;
  const bucketStart = granularity === 'weekly'
    ? startOfWeek(addWeeks(new Date(), -(numBuckets - 1)))
    : granularity === 'monthly'
      ? new Date(addMonths(new Date(), -(numBuckets - 1)).getFullYear(), addMonths(new Date(), -(numBuckets - 1)).getMonth(), 1)
      : new Date(addYears(new Date(), -(numBuckets - 1)).getFullYear(), 0, 1);

  const orderedKeys: string[] = [];
  for (let i = 0; i < numBuckets; i++) orderedKeys.push(keyOf(addFn(bucketStart, i)));

  interface Bucket { attempts: number; scoreSum: number; scoreCount: number; students: Set<string>; passed: number; completed: number }
  const byBucket = new Map<string, Bucket>();
  for (const key of orderedKeys) byBucket.set(key, { attempts: 0, scoreSum: 0, scoreCount: 0, students: new Set(), passed: 0, completed: 0 });

  for (const s of submissions) {
    const key = keyOf(s.startedAt);
    const bucket = byBucket.get(key);
    if (!bucket) continue; // outside the trend window
    bucket.attempts += 1;
    bucket.students.add(s.studentId);
    if ((COUNTABLE_SUBMISSION_STATUSES as string[]).includes(s.status)) {
      bucket.completed += 1;
      bucket.scoreSum += s.score;
      bucket.scoreCount += 1;
      if (s.score >= s.assessment.passingMarks) bucket.passed += 1;
    }
  }

  const attemptsOverTime: TrendPoint[] = [];
  const averageScoreOverTime: TrendPoint[] = [];
  const participationOverTime: TrendPoint[] = [];
  const passRateOverTime: TrendPoint[] = [];
  for (const key of orderedKeys) {
    const b = byBucket.get(key)!;
    attemptsOverTime.push({ date: key, count: b.attempts });
    averageScoreOverTime.push({ date: key, count: b.scoreCount ? round(b.scoreSum / b.scoreCount) : 0 });
    participationOverTime.push({ date: key, count: b.students.size });
    passRateOverTime.push({ date: key, count: b.completed ? round((b.passed / b.completed) * 100) : 0 });
  }

  return { attemptsOverTime, averageScoreOverTime, participationOverTime, passRateOverTime };
}

export const AssessmentOverviewService = {
  getOverview,
  getAssessmentTrends,
};
