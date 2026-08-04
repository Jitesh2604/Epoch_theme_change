import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role } from '../lib/enums';
import { ContentMeta } from './content.service';
import { AnalyticsService } from './analytics.service';
import { RevisionService } from './revision.service';

/**
 * Admin Analytics — Feature 2: Student Performance Analytics.
 *
 * Thin, additive-only layer over the existing Student Analytics engine
 * (analytics.service.ts, revision.service.ts) — every "smart" number (score
 * formulas, streak logic, breakdown groupings) is computed exactly as it is
 * for a student viewing their own analytics; this file only adds the
 * admin-facing plumbing to call those same functions for an admin-selected
 * studentId (or many), instead of the caller's own req.user.id. No formula
 * is re-implemented here. Practice Olympiad only — same scope as every
 * function this reuses (quizType !== OLYMPIAD, status === SUBMITTED) —
 * Assessment/Submission/leaderboard data is never touched.
 */

export interface StudentCandidate {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  classExternalId: string | null;
  className: string | null;
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
      id: true, name: true, email: true, avatarHue: true,
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
      classExternalId,
      className: classExternalId ? classNames.get(classExternalId) ?? classExternalId : null,
    };
  });
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

  const [perStudent, revisionStreaks] = await Promise.all([
    Promise.all(studentIds.map(async (studentId) => {
      const [overview, subjects, questionTypes] = await Promise.all([
        AnalyticsService.getPracticeOverview(studentId),
        AnalyticsService.getSubjectBreakdown(studentId),
        AnalyticsService.getQuestionTypeBreakdown(studentId),
      ]);
      return { studentId, overview, subjects, questionTypes };
    })),
    prisma.revisionStreakState.findMany({ where: { studentId: { in: studentIds } } }),
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
    return { ...p, revisionStreak };
  });
}

/**
 * Single-student deep dive for the Summary Panel — identical cost profile
 * to what the student's own AnalyticsPage already pays for itself today
 * (the same 4 AnalyticsService calls + RevisionService.getDashboard),
 * just admin-initiated with a chosen studentId instead of req.user.id.
 */
async function getStudentDetail(studentId: string) {
  const [overview, subjects, questionTypes, topics, revisionDashboard] = await Promise.all([
    AnalyticsService.getPracticeOverview(studentId),
    AnalyticsService.getSubjectBreakdown(studentId),
    AnalyticsService.getQuestionTypeBreakdown(studentId),
    AnalyticsService.getTopicBreakdown(studentId),
    RevisionService.getDashboard(studentId),
  ]);
  return { overview, subjects, questionTypes, topics, revisionDashboard };
}

export const StudentPerformanceService = {
  listStudentCandidates,
  getBulkInsights,
  getStudentDetail,
};
