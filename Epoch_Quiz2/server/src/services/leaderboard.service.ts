import { q, q1 } from '../lib/db';
import { AssessmentStatus, Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type { Actor } from './assessment.service';
import type {
  AssessmentLeaderboardQuery,
  GlobalLeaderboardQuery,
} from '../validators/leaderboard.validator';

const COUNTABLE_SQL = `status IN ('${SubmissionStatus.SUBMITTED}', '${SubmissionStatus.GRADED}')`;
// Qualified variant for queries that JOIN `assessments` (which also has a
// `status` column) — an unqualified `status` there is ambiguous in MySQL.
const COUNTABLE_S_SQL = `s.${COUNTABLE_SQL}`;

function pct(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 10000) / 100;
}

// ── row types ──────────────────────────────────────────────────

interface SubmissionRow {
  studentId: string; studentName: string; avatarHue: number;
  score: number; totalMarks: number; timeTakenSec: number | null;
  submittedAt: Date | null; status: string;
}

interface GroupedRow {
  studentId: string; totalScore: number; totalPossible: number; attempted: number;
}

interface StudentRow {
  id: string; name: string; avatarHue: number;
  schoolName: string | null; teacherCode: string | null;
}

// ── service ────────────────────────────────────────────────────

export const LeaderboardService = {
  async forAssessment(actor: Actor, assessmentId: string, query: AssessmentLeaderboardQuery) {
    const assessment = await q1<{
      id: string; status: string; createdById: string;
      passingMarks: number; title: string; totalMarks: number;
    }>('SELECT id, status, createdById, passingMarks, title, totalMarks FROM assessments WHERE id = ?', [assessmentId]);
    if (!assessment) throw ApiError.notFound('Assessment not found');

    if (actor.role === Role.TEACHER && assessment.createdById !== actor.id) {
      throw ApiError.forbidden('You can only view leaderboards for your own assessments');
    }
    if (actor.role === Role.STUDENT) {
      if (assessment.status !== AssessmentStatus.PUBLISHED) throw ApiError.notFound('Assessment not found');
      const own = await q1<{ status: string }>(
        'SELECT status FROM submissions WHERE assessmentId = ? AND studentId = ?',
        [assessmentId, actor.id],
      );
      if (!own || own.status === SubmissionStatus.IN_PROGRESS) {
        throw ApiError.forbidden('Submit your attempt to see the leaderboard');
      }
    }

    const { page, limit } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const [rows, countRows] = await Promise.all([
      q<SubmissionRow>(
        `SELECT s.studentId, u.name AS studentName, u.avatarHue,
                s.score, s.totalMarks, s.timeTakenSec, s.submittedAt, s.status
         FROM submissions s
         JOIN users u ON u.id = s.studentId
         WHERE s.assessmentId = ? AND ${COUNTABLE_SQL}
         ORDER BY s.score DESC, s.timeTakenSec ASC, s.submittedAt ASC
         LIMIT ? OFFSET ?`,
        [assessmentId, take, skip],
      ),
      q<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM submissions WHERE assessmentId = ? AND ${COUNTABLE_SQL}`,
        [assessmentId],
      ),
    ]);

    const items = rows.map((s: SubmissionRow, i: number) => ({
      rank:         skip + i + 1,
      studentId:    s.studentId,
      studentName:  s.studentName,
      avatarHue:    s.avatarHue,
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
      meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit),
    };
  },

  async global(_actor: Actor, query: GlobalLeaderboardQuery) {
    const { page, limit, subjectId } = query;

    const subjectJoin  = subjectId ? 'JOIN assessments a ON a.id = s.assessmentId' : '';
    const subjectCond  = subjectId ? 'AND a.subjectId = ?' : '';
    const subjectParam = subjectId ? [subjectId] : [];

    const grouped = await q<GroupedRow>(
      `SELECT s.studentId,
              SUM(s.score)      AS totalScore,
              SUM(s.totalMarks) AS totalPossible,
              COUNT(*)          AS attempted
       FROM submissions s ${subjectJoin}
       WHERE ${COUNTABLE_S_SQL} ${subjectCond}
       GROUP BY s.studentId`,
      subjectParam,
    );

    interface RankedEntry { studentId: string; attempted: number; totalScore: number; totalPossible: number; avgPercent: number }
    const ranked: RankedEntry[] = grouped
      .map((g: GroupedRow) => ({
        studentId:     g.studentId,
        attempted:     Number(g.attempted),
        totalScore:    Number(g.totalScore),
        totalPossible: Number(g.totalPossible),
        avgPercent:    pct(Number(g.totalScore), Number(g.totalPossible)),
      }))
      .sort((a: RankedEntry, b: RankedEntry) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.avgPercent - a.avgPercent;
      });

    const total = ranked.length;
    const { skip, take } = pageToSkipTake(page, limit);
    const page_ = ranked.slice(skip, skip + take);

    if (!page_.length) return { items: [], meta: pageMeta(total, page, limit) };

    const students = await q<StudentRow>(
      `SELECT u.id, u.name, u.avatarHue, sp.schoolName, sp.teacherCode
       FROM users u
       LEFT JOIN student_profiles sp ON sp.userId = u.id
       WHERE u.id IN (?)`,
      [page_.map((r: RankedEntry) => r.studentId)],
    );
    const byId = new Map<string, StudentRow>(students.map((s: StudentRow) => [s.id, s]));

    const items = page_.map((r: RankedEntry, i: number) => {
      const s = byId.get(r.studentId);
      return {
        rank:          skip + i + 1,
        studentId:     r.studentId,
        studentName:   s?.name ?? 'Unknown',
        avatarHue:     s?.avatarHue ?? 180,
        schoolName:    s?.schoolName ?? null,
        teacherCode:   s?.teacherCode ?? null,
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
      const [agg, inProgress] = await Promise.all([
        q1<{ totalScore: number; totalPossible: number; totalTimeSec: number; attempted: number }>(
          `SELECT SUM(score) AS totalScore, SUM(totalMarks) AS totalPossible,
                  SUM(timeTakenSec) AS totalTimeSec, COUNT(*) AS attempted
           FROM submissions WHERE studentId = ? AND ${COUNTABLE_SQL}`,
          [actor.id],
        ),
        q1<{ cnt: number }>(
          "SELECT COUNT(*) AS cnt FROM submissions WHERE studentId = ? AND status = 'IN_PROGRESS'",
          [actor.id],
        ),
      ]);

      const totalScore    = Number(agg?.totalScore    ?? 0);
      const totalPossible = Number(agg?.totalPossible ?? 0);
      const totalTimeSec  = Number(agg?.totalTimeSec  ?? 0);
      const attempted     = Number(agg?.attempted     ?? 0);

      const higher = await q1<{ cnt: number }>(
        `SELECT COUNT(DISTINCT studentId) AS cnt FROM (
           SELECT studentId, SUM(score) AS ts FROM submissions WHERE ${COUNTABLE_SQL} GROUP BY studentId
         ) g WHERE g.ts > ? AND g.studentId != ?`,
        [totalScore, actor.id],
      );

      return {
        role: 'STUDENT', attempted,
        inProgress:  Number(inProgress?.cnt ?? 0),
        totalScore, totalPossible,
        avgPercent:  pct(totalScore, totalPossible),
        totalTimeSec,
        rank:        Number(higher?.cnt ?? 0) + 1,
      };
    }

    if (actor.role === Role.TEACHER) {
      const [assessmentsCount, mySubmissions, mySubmissionAgg] = await Promise.all([
        q1<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM assessments WHERE createdById = ?', [actor.id]),
        q1<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM submissions s JOIN assessments a ON a.id = s.assessmentId WHERE a.createdById = ? AND ${COUNTABLE_S_SQL}`,
          [actor.id],
        ),
        q1<{ avgScore: number; avgTime: number; totalScore: number; totalMarks: number }>(
          `SELECT AVG(s.score) AS avgScore, AVG(s.timeTakenSec) AS avgTime,
                  SUM(s.score) AS totalScore, SUM(s.totalMarks) AS totalMarks
           FROM submissions s JOIN assessments a ON a.id = s.assessmentId
           WHERE a.createdById = ? AND ${COUNTABLE_S_SQL}`,
          [actor.id],
        ),
      ]);

      return {
        role:               'TEACHER',
        assessmentsCreated: Number(assessmentsCount?.cnt ?? 0),
        totalSubmissions:   Number(mySubmissions?.cnt    ?? 0),
        avgScore:           Number(mySubmissionAgg?.avgScore ?? 0),
        avgTimeSec:         Number(mySubmissionAgg?.avgTime  ?? 0),
        avgPercent:         pct(Number(mySubmissionAgg?.totalScore ?? 0), Number(mySubmissionAgg?.totalMarks ?? 0)),
      };
    }

    // Admin — platform-wide stats
    const [userGroups, assessmentCount, submissionCount, gradedCount, totalAgg] = await Promise.all([
      q<{ role: string; cnt: number }>('SELECT role, COUNT(*) AS cnt FROM users GROUP BY role'),
      q1<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM assessments'),
      q1<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM submissions'),
      q1<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM submissions WHERE ${COUNTABLE_SQL}`),
      q1<{ totalScore: number; totalMarks: number }>(
        `SELECT SUM(score) AS totalScore, SUM(totalMarks) AS totalMarks FROM submissions WHERE ${COUNTABLE_SQL}`,
      ),
    ]);

    const usersByRole: Record<string, number> = {};
    for (const g of userGroups) usersByRole[g.role] = Number(g.cnt);

    return {
      role:               'ADMIN',
      users:              usersByRole,
      totalAssessments:   Number(assessmentCount?.cnt  ?? 0),
      totalSubmissions:   Number(submissionCount?.cnt  ?? 0),
      gradedSubmissions:  Number(gradedCount?.cnt      ?? 0),
      platformAvgPercent: pct(Number(totalAgg?.totalScore ?? 0), Number(totalAgg?.totalMarks ?? 0)),
    };
  },
};
