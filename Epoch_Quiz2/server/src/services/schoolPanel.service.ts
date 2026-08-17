import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_CLASS_NAME } from './content.service';
import { wasAnswered } from './schoolAnalytics.service';
import { QuizService } from './quiz.service';
import { StudentPerformanceService } from './studentPerformance.service';
import { CertificateService } from './certificate.service';
import { UserService } from './user.service';
import type { Actor } from './assessment.service';
// NOTE: SubmissionService (the Answer Sheet tab's data source) is
// deliberately NOT imported here — submission.service.ts already imports
// SchoolPanelService for its own getForSchoolAdmin() method, so importing
// it back here would create a circular module dependency. That method
// does its own complete school-membership authorization internally
// (resolveAdminSchool + student-school check), so it doesn't need to be
// routed through this file — schoolPanel.controller.ts calls
// SubmissionService.getForSchoolAdmin() directly instead.
import type {
  ListSchoolStudentsQuery,
  ListSchoolResultsQuery,
  SchoolUpdateStudentProfileInput,
} from '../validators/schoolPanel.validator';

/** Countable (graded) submissions — same definition used everywhere else
 *  in the app (leaderboard.service.ts, analytics.service.ts). */
const COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

/** A submission only counts once its assessment's results are actually
 *  visible to students — identical semantics to AssessmentService.
 *  isResultVisible() / LeaderboardService's resultsVisibleFilter(), kept
 *  in sync by hand (a function, not a constant, since resultPublishAt must
 *  be compared against "now" at query time). */
function resultsVisibleFilter(): Prisma.AssessmentWhereInput {
  return { OR: [{ resultsPublished: true }, { resultPublishAt: { lte: new Date() } }] };
}

function pct(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 10000) / 100;
}

/**
 * A School Admin's own school, resolved from their SchoolRegistration row
 * (one per SCHOOL_ADMIN user) — every School Panel query is scoped to
 * this, NEVER to a schoolId supplied by the request. This is the single
 * choke point every method in this file goes through first; nothing here
 * ever trusts a client-supplied school/branch id without re-validating it
 * against this resolved value.
 */
async function resolveAdminSchool(actor: Actor): Promise<string> {
  if (actor.role !== Role.SCHOOL_ADMIN) throw ApiError.forbidden('School Panel is for School Admins only');
  const reg = await prisma.schoolRegistration.findUnique({ where: { userId: actor.id }, select: { schoolId: true } });
  if (!reg) throw ApiError.forbidden('No school registration found for this account');
  return reg.schoolId;
}

/** A branchId filter is only ever honored after confirming it genuinely
 *  belongs to the admin's own (already-resolved) school — closes off the
 *  "pass another school's branchId" bypass attempt at the source. */
async function resolveBranchFilter(schoolId: string, branchId?: string): Promise<string | undefined> {
  if (!branchId) return undefined;
  const branch = await prisma.schoolBranch.findUnique({ where: { id: branchId }, select: { schoolId: true } });
  if (!branch || branch.schoolId !== schoolId) throw ApiError.badRequest('Select a valid branch for your school');
  return branchId;
}

/**
 * The one shared gate every Student Details tab (Profile, Results, Answer
 * Sheets, Practice, Analytics, Certificates, Leaderboard) goes through
 * before touching that student's data: confirm the studentId genuinely has
 * a StudentProfile belonging to the resolved schoolId. 404, never 403 — a
 * School Admin should never be able to distinguish "this student doesn't
 * exist" from "this student belongs to another school" by response code.
 */
async function requireStudentInSchool(schoolId: string, studentId: string): Promise<void> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { schoolId: true } });
  if (!profile || profile.schoolId !== schoolId) throw ApiError.notFound('Student not found');
}

export const SchoolPanelService = {
  /** Exposed so route/controller code (and other services, e.g. a future
   *  need) can resolve+trust the caller's school without duplicating this
   *  lookup — the one authorization choke point for the whole panel. */
  resolveAdminSchool,
  /** Exposed so other services (e.g. LeaderboardService.forSchoolPanel)
   *  validate a client-supplied branchId the same way every School Panel
   *  endpoint does, instead of silently ignoring an invalid one. */
  resolveBranchFilter,

  async dashboard(actor: Actor) {
    const schoolId = await resolveAdminSchool(actor);
    const studentWhere: Prisma.StudentProfileWhereInput = { schoolId };

    const [totalStudents, activeStudents, studentRows] = await Promise.all([
      prisma.studentProfile.count({ where: studentWhere }),
      prisma.studentProfile.count({ where: { ...studentWhere, user: { status: 'ACTIVE' } } }),
      prisma.studentProfile.findMany({ where: studentWhere, select: { userId: true } }),
    ]);
    const studentIds = studentRows.map(s => s.userId);

    if (!studentIds.length) {
      return {
        totalStudents: 0, activeStudents: 0, assessmentsAttempted: 0,
        averageScore: 0, averagePercentage: 0,
        recentActivity: [] as unknown[], recentResults: [] as unknown[],
      };
    }

    const visibleSubmissionWhere: Prisma.SubmissionWhereInput = {
      studentId: { in: studentIds }, status: COUNTABLE, assessment: resultsVisibleFilter(),
    };

    const [agg, recentActivityRows, recentResultRows] = await Promise.all([
      prisma.submission.aggregate({
        where: visibleSubmissionWhere, _sum: { score: true, totalMarks: true }, _count: { _all: true },
      }),
      // "Recent activity" = any recent submission event, regardless of
      // whether results are published yet — an admin can see THAT a
      // student submitted, even before results go public.
      prisma.submission.findMany({
        where: { studentId: { in: studentIds }, status: COUNTABLE },
        orderBy: { submittedAt: 'desc' }, take: 8,
        select: { id: true, submittedAt: true, student: { select: { name: true } }, assessment: { select: { title: true } } },
      }),
      // "Recent results" = actual scores, published-results only — same
      // visibility rule a student themselves is bound by.
      prisma.submission.findMany({
        where: visibleSubmissionWhere,
        orderBy: { submittedAt: 'desc' }, take: 8,
        select: {
          id: true, score: true, totalMarks: true, submittedAt: true,
          student: { select: { name: true } }, assessment: { select: { title: true, subjectExternalId: true } },
        },
      }),
    ]);

    const subjectNames = await ContentMeta.subjects();
    const totalScore = agg._sum.score ?? 0;
    const totalPossible = agg._sum.totalMarks ?? 0;
    const attempted = agg._count._all;

    return {
      totalStudents,
      activeStudents,
      assessmentsAttempted: attempted,
      averageScore: attempted > 0 ? Math.round((totalScore / attempted) * 100) / 100 : 0,
      averagePercentage: pct(totalScore, totalPossible),
      recentActivity: recentActivityRows.map(r => ({
        id: r.id, studentName: r.student.name, assessmentTitle: r.assessment.title, submittedAt: r.submittedAt,
      })),
      recentResults: recentResultRows.map(r => ({
        id: r.id, studentName: r.student.name, assessmentTitle: r.assessment.title,
        subjectName: r.assessment.subjectExternalId ? (subjectNames.get(r.assessment.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : null,
        score: r.score, totalMarks: r.totalMarks, percent: pct(r.score, r.totalMarks), submittedAt: r.submittedAt,
      })),
    };
  },

  async students(actor: Actor, query: ListSchoolStudentsQuery) {
    const schoolId = await resolveAdminSchool(actor);
    const branchId = await resolveBranchFilter(schoolId, query.branchId);
    const { page, limit } = query;

    const where: Prisma.StudentProfileWhereInput = {
      schoolId,
      ...(branchId && { branchId }),
      ...(query.classExternalId && { classExternalId: query.classExternalId }),
      ...(query.verified === 'true' && { branchVerifiedAt: { not: null } }),
      ...(query.verified === 'false' && { branchVerifiedAt: null }),
      ...(query.search && {
        user: { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] },
      }),
    };

    const { skip, take } = pageToSkipTake(page, limit);
    const [rows, total] = await Promise.all([
      prisma.studentProfile.findMany({
        where, skip, take, orderBy: { user: { name: 'asc' } },
        include: {
          user: { select: { id: true, name: true, email: true, status: true, avatarHue: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.studentProfile.count({ where }),
    ]);

    if (!rows.length) return { items: [], meta: pageMeta(total, page, limit) };

    const studentIds = rows.map(r => r.userId);
    const [classNames, aggs] = await Promise.all([
      ContentMeta.classes(),
      prisma.submission.groupBy({
        by: ['studentId'],
        where: { studentId: { in: studentIds }, status: COUNTABLE, assessment: resultsVisibleFilter() },
        _sum: { score: true, totalMarks: true }, _count: { _all: true },
      }),
    ]);
    const aggById = new Map(aggs.map(a => [a.studentId, a]));

    const items = rows.map(r => {
      const agg = aggById.get(r.userId);
      const score = agg?._sum.score ?? 0;
      const total_ = agg?._sum.totalMarks ?? 0;
      const attempted = agg?._count._all ?? 0;
      return {
        id: r.userId,
        name: r.user.name,
        email: r.user.email,
        avatarHue: r.user.avatarHue,
        status: r.user.status,
        verified: !!r.branchVerifiedAt,
        className: r.classExternalId ? (classNames.get(r.classExternalId) ?? UNKNOWN_CLASS_NAME) : null,
        branchName: r.branch?.name ?? null,
        assessmentsAttempted: attempted,
        averageScore: attempted > 0 ? Math.round((score / attempted) * 100) / 100 : 0,
        averagePercentage: pct(score, total_),
      };
    });

    return { items, meta: pageMeta(total, page, limit) };
  },

  async studentDetail(actor: Actor, studentId: string) {
    const schoolId = await resolveAdminSchool(actor);

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: {
        user: { select: { id: true, name: true, email: true, mobileNo: true, status: true, avatarHue: true, createdAt: true, lastLoginAt: true } },
        school: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });
    // 404, not 403 — never confirm/deny another school's student exists.
    if (!profile || profile.schoolId !== schoolId) throw ApiError.notFound('Student not found');

    const [classNames, subjectNames, submissions] = await Promise.all([
      ContentMeta.classes(),
      ContentMeta.subjects(),
      prisma.submission.findMany({
        where: { studentId, status: COUNTABLE, assessment: resultsVisibleFilter() },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true, status: true, score: true, totalMarks: true, submittedAt: true,
          assessment: { select: { id: true, title: true, subjectExternalId: true } },
        },
      }),
    ]);

    // Correct/Wrong/Skipped per submission — classified with the exact same
    // "was this answer field actually filled in" rule schoolAnalytics.
    // service.ts's aggregate breakdown already uses (wasAnswered), applied
    // here per-submission instead of pooled across the whole school.
    const submissionIds = submissions.map(s => s.id);
    const answerRows = submissionIds.length
      ? await prisma.answer.findMany({
          where: { submissionId: { in: submissionIds } },
          select: { submissionId: true, isCorrect: true, selectedOption: true, selectedBoolean: true, textAnswer: true, selectedOptions: true },
        })
      : [];
    const answerCountsBySubmission = new Map<string, { correct: number; wrong: number; skipped: number }>();
    for (const a of answerRows) {
      const counts = answerCountsBySubmission.get(a.submissionId) ?? { correct: 0, wrong: 0, skipped: 0 };
      if (!wasAnswered(a)) counts.skipped++;
      else if (a.isCorrect === true) counts.correct++;
      // Ungraded-but-answered (DESCRIPTIVE/MATCH_THE_COLUMN pending manual
      // grading, isCorrect === null) folds into "wrong" — same rule
      // schoolAnalytics.service.ts's classify() actually applies (its own
      // comment there says "skipped", but the code folds into wrong; this
      // matches that code, not that comment).
      else counts.wrong++;
      answerCountsBySubmission.set(a.submissionId, counts);
    }

    const totalScore = submissions.reduce((s, r) => s + r.score, 0);
    const totalPossible = submissions.reduce((s, r) => s + r.totalMarks, 0);
    const bestPercent = submissions.length ? Math.max(...submissions.map(r => pct(r.score, r.totalMarks))) : 0;

    // Rank per assessment session (title) — reuses the exact same ranking
    // rule as the platform Leaderboard (LeaderboardService.rankRows: score
    // desc, then percent desc), scoped to this school only, not recomputed
    // with different logic.
    const sessionTitles = [...new Set(submissions.map(s => s.assessment.title))];
    const rankBySubmissionId = new Map<string, number>();
    if (sessionTitles.length) {
      const allForSessions = await prisma.submission.findMany({
        where: {
          status: COUNTABLE, assessment: { title: { in: sessionTitles }, ...resultsVisibleFilter() },
          student: { studentProfile: { schoolId } },
        },
        select: { id: true, studentId: true, score: true, assessment: { select: { title: true } } },
      });
      const byTitle = new Map<string, typeof allForSessions>();
      for (const r of allForSessions) {
        const list = byTitle.get(r.assessment.title);
        if (list) list.push(r); else byTitle.set(r.assessment.title, [r]);
      }
      for (const [, rows] of byTitle) {
        const ranked = [...rows].sort((a, b) => b.score - a.score);
        ranked.forEach((r, i) => {
          if (r.studentId === studentId) rankBySubmissionId.set(r.id, i + 1);
        });
      }
    }

    // Subject-wise performance across this student's own submissions.
    const bySubject = new Map<string, { score: number; total: number; count: number; name: string }>();
    for (const s of submissions) {
      const subjectId = s.assessment.subjectExternalId ?? '__mixed__';
      const name = s.assessment.subjectExternalId
        ? (subjectNames.get(s.assessment.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME)
        : 'Mixed Subjects';
      const cur = bySubject.get(subjectId) ?? { score: 0, total: 0, count: 0, name };
      cur.score += s.score; cur.total += s.totalMarks; cur.count += 1;
      bySubject.set(subjectId, cur);
    }

    return {
      profile: {
        id: profile.user.id,
        name: profile.user.name,
        email: profile.user.email,
        phone: profile.user.mobileNo,
        status: profile.user.status,
        avatarHue: profile.user.avatarHue,
        // Raw external/catalog ids alongside their resolved display names
        // — Edit Profile's Class/Branch dropdowns need the id to
        // pre-select the current value; the rest of the page only ever
        // needed the display name until now.
        classExternalId: profile.classExternalId,
        className: profile.classExternalId ? (classNames.get(profile.classExternalId) ?? UNKNOWN_CLASS_NAME) : null,
        branchId: profile.branchId,
        schoolName: profile.school?.name ?? profile.schoolName,
        branchName: profile.branch?.name ?? null,
        verified: !!profile.branchVerifiedAt,
        joinedAt: profile.user.createdAt,
        lastLoginAt: profile.user.lastLoginAt,
        // Other existing, non-sensitive profile fields — same fields the
        // student's own Profile page already lets them fill in.
        dob: profile.dob,
        address: profile.address,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        zip: profile.zip,
        educationBoard: profile.educationBoard,
      },
      performance: {
        assessmentsAttempted: submissions.length,
        overallScore: totalScore,
        overallTotalMarks: totalPossible,
        averagePercentage: pct(totalScore, totalPossible),
        bestPercent,
      },
      subjectWise: [...bySubject.entries()].map(([subjectId, v]) => ({
        subjectId, subjectName: v.name, attempted: v.count,
        averageScore: Math.round((v.score / v.count) * 100) / 100,
        averagePercentage: pct(v.score, v.total),
      })).sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      assessmentHistory: submissions.map(s => {
        const counts = answerCountsBySubmission.get(s.id) ?? { correct: 0, wrong: 0, skipped: 0 };
        return {
          submissionId: s.id,
          assessmentId: s.assessment.id,
          assessmentTitle: s.assessment.title,
          subjectName: s.assessment.subjectExternalId ? (subjectNames.get(s.assessment.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : 'Mixed Subjects',
          score: s.score, totalMarks: s.totalMarks, percent: pct(s.score, s.totalMarks),
          rank: rankBySubmissionId.get(s.id) ?? null,
          submittedAt: s.submittedAt,
          status: s.status,
          correctAnswers: counts.correct,
          wrongAnswers: counts.wrong,
          skippedAnswers: counts.skipped,
        };
      }),
    };
  },

  async results(actor: Actor, query: ListSchoolResultsQuery) {
    const schoolId = await resolveAdminSchool(actor);
    const branchId = await resolveBranchFilter(schoolId, query.branchId);
    const { page, limit } = query;

    const studentFilter: Prisma.UserWhereInput = {
      studentProfile: {
        schoolId,
        ...(branchId && { branchId }),
        ...(query.classExternalId && { classExternalId: query.classExternalId }),
      },
    };

    const where: Prisma.SubmissionWhereInput = {
      status: COUNTABLE,
      assessment: {
        ...resultsVisibleFilter(),
        ...(query.subjectExternalId && { subjectExternalId: query.subjectExternalId }),
        ...(query.assessmentId && { id: query.assessmentId }),
        ...(query.session && { title: query.session }),
      },
      student: studentFilter,
      ...(query.studentId && { studentId: query.studentId }),
    };

    const { skip, take } = pageToSkipTake(page, limit);
    const [rows, total] = await Promise.all([
      prisma.submission.findMany({
        where, skip, take, orderBy: { submittedAt: 'desc' },
        select: {
          id: true, score: true, totalMarks: true, submittedAt: true,
          student: {
            select: {
              id: true, name: true,
              studentProfile: { select: { classExternalId: true, branch: { select: { name: true } } } },
            },
          },
          assessment: { select: { id: true, title: true, subjectExternalId: true, passingMarks: true } },
        },
      }),
      prisma.submission.count({ where }),
    ]);

    if (!rows.length) return { items: [], meta: pageMeta(total, page, limit) };

    // Rank each row within its own assessment session — same School-scoped
    // rule as studentDetail() above, computed once per distinct session
    // title present on this page of results.
    const [subjectNames, classNames] = await Promise.all([ContentMeta.subjects(), ContentMeta.classes()]);
    const sessionTitles = [...new Set(rows.map(r => r.assessment.title))];
    const rankBySubmissionId = new Map<string, number>();
    if (sessionTitles.length) {
      const allForSessions = await prisma.submission.findMany({
        where: {
          status: COUNTABLE, assessment: { title: { in: sessionTitles }, ...resultsVisibleFilter() },
          student: { studentProfile: { schoolId } },
        },
        select: { id: true, score: true, assessment: { select: { title: true } } },
      });
      const byTitle = new Map<string, typeof allForSessions>();
      for (const r of allForSessions) {
        const list = byTitle.get(r.assessment.title);
        if (list) list.push(r); else byTitle.set(r.assessment.title, [r]);
      }
      for (const [, list] of byTitle) {
        const ranked = [...list].sort((a, b) => b.score - a.score);
        ranked.forEach((r, i) => rankBySubmissionId.set(r.id, i + 1));
      }
    }

    const items = rows.map(r => ({
      submissionId: r.id,
      studentId: r.student.id,
      studentName: r.student.name,
      assessmentId: r.assessment.id,
      assessmentTitle: r.assessment.title,
      subjectName: r.assessment.subjectExternalId ? (subjectNames.get(r.assessment.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : 'Mixed Subjects',
      className: r.student.studentProfile?.classExternalId ? (classNames.get(r.student.studentProfile.classExternalId) ?? UNKNOWN_CLASS_NAME) : null,
      branchName: r.student.studentProfile?.branch?.name ?? null,
      score: r.score, totalMarks: r.totalMarks, percent: pct(r.score, r.totalMarks),
      passed: r.score >= r.assessment.passingMarks,
      rank: rankBySubmissionId.get(r.id) ?? null,
      submittedAt: r.submittedAt,
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },

  /** Filter option lists for the Students/Results/Leaderboard pages — built
   *  only from this school's own real data, never hardcoded. */
  async filterOptions(actor: Actor) {
    const schoolId = await resolveAdminSchool(actor);
    const submittedWhere: Prisma.SubmissionWhereInput = {
      status: COUNTABLE, assessment: resultsVisibleFilter(), student: { studentProfile: { schoolId } },
    };
    const [branches, classIds, subjectAssessments, sessionAssessments] = await Promise.all([
      prisma.schoolBranch.findMany({ where: { schoolId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.studentProfile.findMany({ where: { schoolId, classExternalId: { not: null } }, distinct: ['classExternalId'], select: { classExternalId: true } }),
      // Only subjects/sessions this school's students have actually
      // submitted results for — not the whole platform catalog.
      prisma.submission.findMany({ where: submittedWhere, distinct: ['assessmentId'], select: { assessment: { select: { subjectExternalId: true } } } }),
      prisma.submission.findMany({ where: submittedWhere, distinct: ['assessmentId'], select: { assessment: { select: { title: true } } } }),
    ]);
    const [classNames, subjectNames] = await Promise.all([ContentMeta.classes(), ContentMeta.subjects()]);
    const classes = classIds
      .map(c => ({ id: c.classExternalId as string, name: classNames.get(c.classExternalId as string) ?? UNKNOWN_CLASS_NAME }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const subjectIds = [...new Set(subjectAssessments.map(a => a.assessment.subjectExternalId).filter((id): id is string => !!id))];
    const subjects = subjectIds
      .map(id => ({ id, name: subjectNames.get(id) ?? UNKNOWN_SUBJECT_NAME }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sessions = [...new Set(sessionAssessments.map(a => a.assessment.title))].sort((a, b) => a.localeCompare(b));
    return { branches, classes, subjects, sessions };
  },

  /**
   * Student Details → Practice tab. Reuses QuizService.getOlympiadAttempts
   * unmodified (the exact same list a student sees for themselves) for an
   * admin-chosen studentId, after confirming that student belongs to this
   * School Admin's own school — the route/service function itself takes an
   * arbitrary studentId already (only the student-facing controller pins
   * it to req.user.id), so no Practice-side logic is duplicated here.
   */
  async studentPractice(actor: Actor, studentId: string) {
    const schoolId = await resolveAdminSchool(actor);
    await requireStudentInSchool(schoolId, studentId);
    return QuizService.getOlympiadAttempts(studentId);
  },

  /**
   * Student Details → Analytics tab. Reuses StudentPerformanceService.
   * getStudentDetail (already built for Admin Analytics Feature 2/6, and
   * already admin-initiated for an arbitrary studentId) unmodified — this
   * only adds the school-membership check before calling it. Returns the
   * same Practice-based overview/subjects/difficulties/topics a student's
   * own Analytics page computes for itself, per the same underlying
   * AnalyticsService functions.
   */
  async studentAnalytics(actor: Actor, studentId: string) {
    const schoolId = await resolveAdminSchool(actor);
    await requireStudentInSchool(schoolId, studentId);
    return StudentPerformanceService.getStudentDetail(studentId);
  },

  /**
   * Student Details → Certificates tab. CertificateService.myCertificates
   * only ever computes for the given `actor` (never a separately-trusted
   * target id) — after confirming studentId belongs to this school, a
   * synthetic STUDENT actor is passed in its place. This is safe because
   * myCertificates does no further identity check beyond `actor.role ===
   * STUDENT` and reads/writes are keyed entirely on `actor.id`, so it
   * computes exactly the target student's own certificates, not the real
   * caller's — no certificate-ranking logic is duplicated here.
   */
  async studentCertificates(actor: Actor, studentId: string) {
    const schoolId = await resolveAdminSchool(actor);
    await requireStudentInSchool(schoolId, studentId);
    return CertificateService.myCertificates({ id: studentId, role: Role.STUDENT });
  },

  /**
   * Student Details → Edit Profile. Reuses UserService.updateOwnProfile
   * for every field it already handles (name, dob, branchId,
   * classExternalId, address/country/state/city/zip, educationBoard) —
   * that function is already keyed on an arbitrary `userId` parameter
   * (only its own controller pins it to req.user.id for the student's own
   * self-service page), so no update logic is duplicated for those
   * fields. email/phone(mobileNo) are handled separately here because
   * updateOwnProfile deliberately never exposes either — self-service
   * profile edit doesn't support changing them, so there is nothing to
   * reuse there; this mirrors the exact same uniqueness-check pattern
   * UserService.update() already uses for email, and the one
   * registration already uses for mobileNo.
   *
   * schoolId is never accepted or forwarded — schoolUpdateStudentProfileSchema
   * has no such field at all (stripped by Zod if somehow present in the
   * request body), so a School Admin can never move a student to another
   * school through this endpoint. If branchId is provided,
   * updateOwnProfile independently re-validates it against the student's
   * OWN current schoolId (already proven == this admin's schoolId by
   * requireStudentInSchool below) before accepting it — a branch from
   * another school is rejected there even if guessed.
   */
  async updateStudentProfile(actor: Actor, studentId: string, input: SchoolUpdateStudentProfileInput) {
    const schoolId = await resolveAdminSchool(actor);
    await requireStudentInSchool(schoolId, studentId);

    if (input.email !== undefined) {
      const taken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (taken && taken.id !== studentId) throw ApiError.conflict('Email is already registered to another account');
    }
    if (input.phone) {
      const taken = await prisma.user.findUnique({ where: { mobileNo: input.phone }, select: { id: true } });
      if (taken && taken.id !== studentId) throw ApiError.conflict('Mobile number is already registered to another account');
    }
    if (input.email !== undefined || input.phone !== undefined) {
      await prisma.user.update({
        where: { id: studentId },
        data: {
          ...(input.email !== undefined && { email: input.email }),
          ...(input.phone !== undefined && { mobileNo: input.phone }),
        },
      });
    }

    await UserService.updateOwnProfile(studentId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.dob !== undefined && { dob: input.dob }),
      ...(input.branchId !== undefined && { branchId: input.branchId }),
      ...(input.classExternalId !== undefined && { classExternalId: input.classExternalId }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.zip !== undefined && { zip: input.zip }),
      ...(input.educationBoard !== undefined && { educationBoard: input.educationBoard }),
    });

    // Refresh from the same read path the Profile tab already uses —
    // never a hand-rolled second shape of the same data.
    return this.studentDetail(actor, studentId);
  },
};
