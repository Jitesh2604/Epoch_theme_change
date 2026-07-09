import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AssessmentStatus, Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type { Actor } from './assessment.service';
import type {
  AssessmentLeaderboardQuery,
  GlobalLeaderboardQuery,
} from '../validators/leaderboard.validator';

/** Submissions that count towards scoring/leaderboards. */
const COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

function pct(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 10000) / 100;
}

export const LeaderboardService = {
  async forAssessment(actor: Actor, assessmentId: string, query: AssessmentLeaderboardQuery) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, status: true, createdById: true, passingMarks: true, title: true, totalMarks: true },
    });
    if (!assessment) throw ApiError.notFound('Assessment not found');

    if (actor.role === Role.TEACHER && assessment.createdById !== actor.id) {
      throw ApiError.forbidden('You can only view leaderboards for your own assessments');
    }
    if (actor.role === Role.STUDENT) {
      if (assessment.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
      const own = await prisma.submission.findUnique({
        where: { assessmentId_studentId: { assessmentId, studentId: actor.id } }, select: { status: true },
      });
      if (!own || own.status === SubmissionStatus.IN_PROGRESS) {
        throw ApiError.forbidden('Submit your attempt to see the leaderboard');
      }
    }

    const { page, limit } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, total] = await Promise.all([
      prisma.submission.findMany({
        where: { assessmentId, status: COUNTABLE },
        orderBy: [{ score: 'desc' }, { timeTakenSec: 'asc' }, { submittedAt: 'asc' }],
        skip, take,
        select: { studentId: true, score: true, totalMarks: true, timeTakenSec: true, submittedAt: true, status: true, student: { select: { name: true, avatarHue: true } } },
      }),
      prisma.submission.count({ where: { assessmentId, status: COUNTABLE } }),
    ]);

    const items = rows.map((s, i) => ({
      rank:         skip + i + 1,
      studentId:    s.studentId,
      studentName:  s.student.name,
      avatarHue:    s.student.avatarHue,
      score:        s.score,
      totalMarks:   s.totalMarks,
      percent:      pct(s.score, s.totalMarks),
      timeTakenSec: s.timeTakenSec,
      submittedAt:  s.submittedAt,
      status:       s.status,
      passed:       s.score >= assessment.passingMarks,
    }));

    return {
      assessment: {
        id: assessment.id, title: assessment.title,
        totalMarks: assessment.totalMarks, passingMarks: assessment.passingMarks,
      },
      items,
      meta: pageMeta(total, page, limit),
    };
  },

  async global(_actor: Actor, query: GlobalLeaderboardQuery) {
    const { page, limit } = query;
    const subjectExternalId = (query as Record<string, unknown>).subjectExternalId as string | undefined;

    const grouped = await prisma.submission.groupBy({
      by: ['studentId'],
      where: { status: COUNTABLE, ...(subjectExternalId && { assessment: { subjectExternalId } }) },
      _sum: { score: true, totalMarks: true },
      _count: { _all: true },
    });

    interface RankedEntry { studentId: string; attempted: number; totalScore: number; totalPossible: number; avgPercent: number }
    const ranked: RankedEntry[] = grouped
      .map((g) => {
        const totalScore = g._sum.score ?? 0;
        const totalPossible = g._sum.totalMarks ?? 0;
        return {
          studentId:     g.studentId,
          attempted:     g._count._all,
          totalScore,
          totalPossible,
          avgPercent:    pct(totalScore, totalPossible),
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.avgPercent - a.avgPercent;
      });

    const total = ranked.length;
    const { skip, take } = pageToSkipTake(page, limit);
    const page_ = ranked.slice(skip, skip + take);

    if (!page_.length) return { items: [], meta: pageMeta(total, page, limit) };

    const students = await prisma.user.findMany({
      where: { id: { in: page_.map((r) => r.studentId) } },
      select: { id: true, name: true, avatarHue: true, studentProfile: { select: { schoolName: true, teacherCode: true } } },
    });
    const byId = new Map(students.map((s) => [s.id, s]));

    const items = page_.map((r, i) => {
      const s = byId.get(r.studentId);
      return {
        rank:          skip + i + 1,
        studentId:     r.studentId,
        studentName:   s?.name ?? 'Unknown',
        avatarHue:     s?.avatarHue ?? 180,
        schoolName:    s?.studentProfile?.schoolName ?? null,
        teacherCode:   s?.studentProfile?.teacherCode ?? null,
        attempted:     r.attempted,
        totalScore:    r.totalScore,
        totalPossible: r.totalPossible,
        avgPercent:    r.avgPercent,
      };
    });

    return { items, meta: pageMeta(total, page, limit) };
  },

  async myStats(actor: Actor) {
    if (actor.role === Role.STUDENT) {
      const [agg, inProgress, allTotals] = await Promise.all([
        prisma.submission.aggregate({
          where: { studentId: actor.id, status: COUNTABLE },
          _sum: { score: true, totalMarks: true, timeTakenSec: true }, _count: { _all: true },
        }),
        prisma.submission.count({ where: { studentId: actor.id, status: SubmissionStatus.IN_PROGRESS } }),
        prisma.submission.groupBy({ by: ['studentId'], where: { status: COUNTABLE }, _sum: { score: true } }),
      ]);

      const totalScore    = agg._sum.score ?? 0;
      const totalPossible = agg._sum.totalMarks ?? 0;
      const totalTimeSec  = agg._sum.timeTakenSec ?? 0;
      const attempted     = agg._count._all;

      const higher = allTotals.filter(g => g.studentId !== actor.id && (g._sum.score ?? 0) > totalScore).length;

      return {
        role: 'STUDENT', attempted,
        inProgress,
        totalScore, totalPossible,
        avgPercent:  pct(totalScore, totalPossible),
        totalTimeSec,
        rank:        higher + 1,
      };
    }

    if (actor.role === Role.TEACHER) {
      const [assessmentsCount, mySubmissions, mySubmissionAgg] = await Promise.all([
        prisma.assessment.count({ where: { createdById: actor.id } }),
        prisma.submission.count({ where: { assessment: { createdById: actor.id }, status: COUNTABLE } }),
        prisma.submission.aggregate({
          where: { assessment: { createdById: actor.id }, status: COUNTABLE },
          _avg: { score: true, timeTakenSec: true }, _sum: { score: true, totalMarks: true },
        }),
      ]);

      return {
        role:               'TEACHER',
        assessmentsCreated: assessmentsCount,
        totalSubmissions:   mySubmissions,
        avgScore:           mySubmissionAgg._avg.score ?? 0,
        avgTimeSec:         mySubmissionAgg._avg.timeTakenSec ?? 0,
        avgPercent:         pct(mySubmissionAgg._sum.score ?? 0, mySubmissionAgg._sum.totalMarks ?? 0),
      };
    }

    // Admin — platform-wide stats
    const [userGroups, assessmentCount, submissionCount, gradedCount, totalAgg] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.assessment.count(),
      prisma.submission.count(),
      prisma.submission.count({ where: { status: COUNTABLE } }),
      prisma.submission.aggregate({ where: { status: COUNTABLE }, _sum: { score: true, totalMarks: true } }),
    ]);

    const usersByRole: Record<string, number> = {};
    for (const g of userGroups) usersByRole[g.role] = g._count._all;

    return {
      role:               'ADMIN',
      users:              usersByRole,
      totalAssessments:   assessmentCount,
      totalSubmissions:   submissionCount,
      gradedSubmissions:  gradedCount,
      platformAvgPercent: pct(totalAgg._sum.score ?? 0, totalAgg._sum.totalMarks ?? 0),
    };
  },
};
