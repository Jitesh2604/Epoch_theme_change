import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role } from '../lib/enums';
import { ContentMeta, UNKNOWN_CLASS_NAME } from './content.service';
import { AnalyticsService } from './analytics.service';
import { RevisionService } from './revision.service';
import { pct } from './leaderboard.service';
import { computeSubmissionStats, type SubmissionStats } from './assessmentOverview.service';
import { fetchSubmissions, COUNTABLE_SUBMISSION_STATUSES, type AssessmentSubmissionRow } from './assessmentAnalyticsShared.service';

/**
 * Admin Analytics — Feature 2/6: Student Performance Analytics.
 *
 * Thin, additive-only layer over the existing Student Analytics engine
 * (analytics.service.ts, revision.service.ts) — every "smart" number (score
 * formulas, streak logic, breakdown groupings) is computed exactly as it is
 * for a student viewing their own analytics; this file only adds the
 * admin-facing plumbing to call those same functions for an admin-selected
 * studentId (or many), instead of the caller's own req.user.id. No formula
 * is re-implemented here.
 *
 * Feature 6 additionally merges in Assessment/Submission stats via the
 * exact same reducer (computeSubmissionStats) Feature 5 uses for its
 * per-assessment and per-class rows — here it's grouped per-student
 * instead. Practice-side calls remain Practice-only (quizType !== OLYMPIAD,
 * status === SUBMITTED); Assessment-side calls remain Assessment-only
 * (Submission/Answer) — the two schemas are merged only in the return shape
 * of this file's own functions, never joined in a query.
 */

export interface StudentCandidate {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
  /** Real column, written on every login (auth.service.ts) — used for
   *  Feature 6's Active/Inactive KPI and DAU/WAU/MAU activity analytics. */
  lastLoginAt: Date | null;
}

/** Cheap roster narrowing step — one query, resolved class names via the
 *  same ContentMeta cache every other admin list already uses (see
 *  user.service.ts's listStudents). Search/accuracy/confidence/etc. filters
 *  all happen client-side afterwards, same convention as ReportsPage.tsx. */
async function listStudentCandidates(query: { classExternalId?: string }): Promise<StudentCandidate[]> {
  const where: Prisma.UserWhereInput = {
    role: Role.STUDENT,
    ...(query.classExternalId && { studentProfile: { classExternalId: query.classExternalId } }),
  };

  const rows = await prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, email: true, avatarHue: true, lastLoginAt: true,
      studentProfile: { select: { classExternalId: true } },
    },
  });

  const classNames = await ContentMeta.classes();

  return rows.map(u => {
    const classExternalId = u.studentProfile?.classExternalId ?? null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarHue: u.avatarHue,
      lastLoginAt: u.lastLoginAt,
      classExternalId,
      className: classExternalId ? classNames.get(classExternalId) ?? UNKNOWN_CLASS_NAME : null,
    };
  });
}

export interface AssessmentStudentStats extends SubmissionStats {
  lastAssessmentDate: Date | null;
  subjectIds: string[];
}

/**
 * Feature 6: per-student Assessment stats for every requested studentId, in
 * ONE bulk fetchSubmissions() call (the same platform-wide call Feature 5's
 * KPI view makes) grouped by studentId in JS — not N per-student queries.
 * computeSubmissionStats is the exact reducer Feature 5 already uses for
 * per-assessment/per-class rows, reused unmodified here per-student.
 */
async function getBulkAssessmentStats(studentIds: string[]): Promise<Map<string, AssessmentStudentStats>> {
  const result = new Map<string, AssessmentStudentStats>();
  if (!studentIds.length) return result;

  const idSet = new Set(studentIds);
  const submissions = await fetchSubmissions({});

  const byStudent = new Map<string, AssessmentSubmissionRow[]>();
  for (const s of submissions) {
    if (!idSet.has(s.studentId)) continue;
    const list = byStudent.get(s.studentId) ?? [];
    list.push(s);
    byStudent.set(s.studentId, list);
  }

  for (const [studentId, subs] of byStudent) {
    const stats = computeSubmissionStats(subs);
    const completed = subs.filter(s => (COUNTABLE_SUBMISSION_STATUSES as string[]).includes(s.status));
    const lastAssessmentDate = completed.reduce<Date | null>((latest, s) => {
      const d = s.submittedAt ?? s.startedAt;
      return !latest || d > latest ? d : latest;
    }, null);
    const subjectIds = [...new Set(subs.map(s => s.assessment.subjectExternalId).filter((id): id is string => id !== null))];
    result.set(studentId, { ...stats, lastAssessmentDate, subjectIds });
  }

  return result;
}

export interface RevisionStreakSummary {
  currentStreak: number;
  bestStreak: number;
  totalSessions: number;
  lastSessionDate: Date | null;
}

/**
 * Per-student raw analytics for the table view, for every requested
 * studentId in parallel. Reuses AnalyticsService's existing single-student
 * functions unmodified (each already a single bounded findMany + JS reduce,
 * per that file's own documented philosophy — safe to call once per student
 * in a bounded candidate set). Revision streak is read directly as one
 * batched query across every student — it's a stored value
 * (RevisionStreakState), not a recomputation, so there's no need to run the
 * heavier RevisionService.getDashboard (queue-sync + full item list) for
 * every row; that full call is reserved for the single-student detail view.
 */
async function getBulkInsights(studentIds: string[]) {
  if (!studentIds.length) return [];

  const [perStudent, revisionStreaks, assessmentStatsByStudent] = await Promise.all([
    Promise.all(studentIds.map(async (studentId) => {
      const [overview, subjects, questionTypes] = await Promise.all([
        AnalyticsService.getPracticeOverview(studentId),
        AnalyticsService.getSubjectBreakdown(studentId),
        AnalyticsService.getQuestionTypeBreakdown(studentId),
      ]);
      return { studentId, overview, subjects, questionTypes };
    })),
    prisma.revisionStreakState.findMany({ where: { studentId: { in: studentIds } } }),
    getBulkAssessmentStats(studentIds),
  ]);

  const streakByStudent = new Map(revisionStreaks.map(r => [r.studentId, r]));

  return perStudent.map(p => {
    const s = streakByStudent.get(p.studentId);
    const revisionStreak: RevisionStreakSummary = {
      currentStreak: s?.currentStreak ?? 0,
      bestStreak: s?.bestStreak ?? 0,
      totalSessions: s?.totalSessions ?? 0,
      lastSessionDate: s?.lastSessionDate ?? null,
    };
    const assessment = assessmentStatsByStudent.get(p.studentId) ?? null;
    return { ...p, revisionStreak, assessment };
  });
}

export interface AssessmentHistoryEntry {
  assessmentId: string;
  title: string;
  score: number;
  totalMarks: number;
  percent: number | null;
  passed: boolean | null;
  status: AssessmentSubmissionRow['status'];
  startedAt: Date;
  submittedAt: Date | null;
}

/**
 * Single-student deep dive for the Summary Panel — identical cost profile
 * to what the student's own AnalyticsPage already pays for itself today
 * (the same 4 AnalyticsService calls + RevisionService.getDashboard),
 * just admin-initiated with a chosen studentId instead of req.user.id, plus
 * this student's own Assessment history via the same fetchSubmissions /
 * computeSubmissionStats reducer Feature 5 uses, scoped with the new
 * studentId filter — one extra query, this student's own submissions only.
 */
async function getStudentDetail(studentId: string) {
  const [overview, subjects, questionTypes, topics, revisionDashboard, assessmentSubmissions] = await Promise.all([
    AnalyticsService.getPracticeOverview(studentId),
    AnalyticsService.getSubjectBreakdown(studentId),
    AnalyticsService.getQuestionTypeBreakdown(studentId),
    AnalyticsService.getTopicBreakdown(studentId),
    RevisionService.getDashboard(studentId),
    fetchSubmissions({ studentId }),
  ]);

  const assessmentStats = computeSubmissionStats(assessmentSubmissions);
  const assessmentHistory: AssessmentHistoryEntry[] = [...assessmentSubmissions]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map(s => {
      const isCompleted = (COUNTABLE_SUBMISSION_STATUSES as string[]).includes(s.status);
      return {
        assessmentId: s.assessmentId,
        title: s.assessment.title,
        score: s.score,
        totalMarks: s.totalMarks,
        percent: isCompleted ? pct(s.score, s.totalMarks) : null,
        passed: isCompleted ? s.score >= s.assessment.passingMarks : null,
        status: s.status,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
      };
    });

  return { overview, subjects, questionTypes, topics, revisionDashboard, assessmentStats, assessmentHistory };
}

export const StudentPerformanceService = {
  listStudentCandidates,
  getBulkInsights,
  getStudentDetail,
};
