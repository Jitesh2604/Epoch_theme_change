import { Router } from '../core/router';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { ADMIN_ROLES } from '../utils/roles';
import { q, q1 } from '../lib/db';

const router = new Router();

router.use(authenticate);

router.get(
  '/stats',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (_req, res) => {
    const COUNTABLE = `status IN ('SUBMITTED', 'GRADED')`;

    const [
      teacherRow,
      studentRow,
      assessmentRow,
      submissionRow,
      recentAssessments,
      recentSubmissions,
      aggRow,
    ] = await Promise.all([
      q1<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'TEACHER'`),
      q1<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'STUDENT'`),
      q1<{ n: number }>(`SELECT COUNT(*) AS n FROM assessments`),
      q1<{ n: number }>(`SELECT COUNT(*) AS n FROM submissions WHERE ${COUNTABLE}`),
      q<{
        id: string; title: string; status: string; createdAt: Date;
        subjectId: string | null; subjectName: string | null;
        createdById: string; createdByName: string;
        questionCount: number; attempts: number;
      }>(`
        SELECT a.id, a.title, a.status, a.createdAt,
               s.id   AS subjectId,     s.name AS subjectName,
               u.id   AS createdById,   u.name AS createdByName,
               (SELECT COUNT(*) FROM assessment_questions WHERE assessmentId = a.id) AS questionCount,
               (SELECT COUNT(*) FROM submissions            WHERE assessmentId = a.id) AS attempts
        FROM assessments a
        LEFT JOIN subjects s ON s.id = a.subjectId
        LEFT JOIN users    u ON u.id = a.createdById
        ORDER BY a.createdAt DESC
        LIMIT 6
      `),
      q<{
        id: string; score: number; totalMarks: number; status: string; submittedAt: Date;
        studentId: string; studentName: string; avatarHue: number | null;
        assessmentId: string; assessmentTitle: string; subjectName: string | null;
      }>(`
        SELECT s.id, s.score, s.totalMarks, s.status, s.submittedAt,
               u.id    AS studentId,    u.name  AS studentName,    u.avatarHue,
               a.id    AS assessmentId, a.title AS assessmentTitle,
               sub.name AS subjectName
        FROM submissions s
        LEFT JOIN users      u   ON u.id   = s.studentId
        LEFT JOIN assessments a  ON a.id   = s.assessmentId
        LEFT JOIN subjects   sub ON sub.id = a.subjectId
        WHERE s.${COUNTABLE}
        ORDER BY s.submittedAt DESC
        LIMIT 8
      `),
      q1<{ totalScore: number | null; totalPossible: number | null }>(`
        SELECT SUM(score) AS totalScore, SUM(totalMarks) AS totalPossible
        FROM submissions
        WHERE ${COUNTABLE}
      `),
    ]);

    const toNum = (v: number | bigint | null | undefined) => Number(v ?? 0);

    const completionRate =
      aggRow && toNum(aggRow.totalPossible) > 0
        ? Math.round((toNum(aggRow.totalScore) / toNum(aggRow.totalPossible)) * 10000) / 100
        : 0;

    ApiResponse.ok(res, {
      counts: {
        teachers:    toNum(teacherRow?.n),
        students:    toNum(studentRow?.n),
        assessments: toNum(assessmentRow?.n),
        submissions: toNum(submissionRow?.n),
      },
      completionRate,
      recentAssessments: recentAssessments.map((a) => ({
        id:            a.id,
        title:         a.title,
        subject:       a.subjectId ? { id: a.subjectId, name: a.subjectName } : null,
        status:        a.status,
        createdBy:     { id: a.createdById, name: a.createdByName },
        questionCount: toNum(a.questionCount),
        attempts:      toNum(a.attempts),
        createdAt:     a.createdAt,
      })),
      recentSubmissions: recentSubmissions.map((s) => ({
        id:         s.id,
        student:    { id: s.studentId, name: s.studentName, avatarHue: s.avatarHue },
        assessment: {
          id:      s.assessmentId,
          title:   s.assessmentTitle,
          subject: s.subjectName ? { name: s.subjectName } : null,
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
