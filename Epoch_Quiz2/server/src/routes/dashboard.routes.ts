import { Router } from '../core/router';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { prisma } from '../lib/prisma';
import { Role, SubmissionStatus } from '../lib/enums';
import { ContentMeta } from '../services/content.service';

const router = new Router();

router.use(authenticate);

router.get(
  '/stats',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (_req, res) => {
    const COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

    const [
      teachers,
      students,
      assessments,
      submissions,
      recentAssessments,
      recentSubmissions,
      aggRow,
    ] = await Promise.all([
      prisma.user.count({ where: { role: Role.TEACHER } }),
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.assessment.count(),
      prisma.submission.count({ where: { status: COUNTABLE } }),
      prisma.assessment.findMany({
        orderBy: { createdAt: 'desc' }, take: 6,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { questions: true, submissions: true } },
        },
      }),
      prisma.submission.findMany({
        where: { status: COUNTABLE }, orderBy: { submittedAt: 'desc' }, take: 8,
        include: {
          student: { select: { id: true, name: true, avatarHue: true } },
          assessment: { select: { id: true, title: true, subjectExternalId: true } },
        },
      }),
      prisma.submission.aggregate({ where: { status: COUNTABLE }, _sum: { score: true, totalMarks: true } }),
    ]);

    // Resolve subject external ids to display names from the cached Content API.
    const subjectNames = await ContentMeta.subjects();
    const subjectOf = (extId: string | null) =>
      extId ? { id: extId, name: subjectNames.get(extId) ?? extId } : null;

    const totalScore    = aggRow._sum.score ?? 0;
    const totalPossible = aggRow._sum.totalMarks ?? 0;
    const completionRate = totalPossible > 0
      ? Math.round((totalScore / totalPossible) * 10000) / 100
      : 0;

    ApiResponse.ok(res, {
      counts: { teachers, students, assessments, submissions },
      completionRate,
      recentAssessments: recentAssessments.map((a) => ({
        id:            a.id,
        title:         a.title,
        subject:       subjectOf(a.subjectExternalId),
        status:        a.status,
        createdBy:     { id: a.createdBy.id, name: a.createdBy.name },
        questionCount: a._count.questions,
        attempts:      a._count.submissions,
        createdAt:     a.createdAt,
      })),
      recentSubmissions: recentSubmissions.map((s) => ({
        id:         s.id,
        student:    { id: s.student.id, name: s.student.name, avatarHue: s.student.avatarHue },
        assessment: {
          id:      s.assessment.id,
          title:   s.assessment.title,
          subject: subjectOf(s.assessment.subjectExternalId),
        },
        score:       s.score,
        totalMarks:  s.totalMarks,
        percent:     s.totalMarks > 0 ? Math.round((s.score / s.totalMarks) * 10000) / 100 : 0,
        status:      s.status,
        submittedAt: s.submittedAt,
      })),
    });
  }),
);

export default router;
