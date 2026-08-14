import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isDev } from '../config';
import { AssessmentStatus, Role, SubmissionStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_CLASS_NAME } from './content.service';
import { sortByClassName } from '../lib/classOrder';
import {
  devFallbackSessions,
  devFallbackAssessmentLeaderboard,
  devFallbackMyRanking,
  type DevActorProfile,
} from './leaderboardDevFallback';
import type { Actor } from './assessment.service';
import type {
  AssessmentLeaderboardQuery,
  GlobalLeaderboardQuery,
  ScopedLeaderboardQuery,
  MyRankingQuery,
} from '../validators/leaderboard.validator';

/** Submissions that count towards scoring/leaderboards. */
const COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

/**
 * A submission only counts toward the leaderboard/stats once its
 * assessment's results are actually visible to students — same semantics
 * as AssessmentService.isResultVisible(), expressed as a Prisma filter
 * since that function runs against an already-loaded object, not a query.
 * Keep the two in sync by hand if the publish-gating rule ever changes.
 * A function, not a constant — resultPublishAt must be compared against
 * "now" at query time, not whenever this module first loaded.
 */
function resultsVisibleFilter(): Prisma.AssessmentWhereInput {
  return { OR: [{ resultsPublished: true }, { resultPublishAt: { lte: new Date() } }] };
}

export function pct(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 10000) / 100;
}

// ── Assessment Leaderboard (School / State / Global) ──────────────────────
// "Session" = a distinct Assessment title among leaderboard-eligible
// (visible-results) assessments. Subject/Class narrow the assessment set
// within a session — both are Assessment-level attributes. In the common
// case (session + subject + class) this resolves to exactly one Assessment,
// so ranking degrades to the same single-assessment logic as forAssessment()
// above; if it resolves to several (e.g. a session spans multiple class
// tiers), a student's rows across them are summed before ranking — same
// aggregation style as global() below.

interface AssessmentRef {
  id: string;
  title: string;
  subjectExternalId: string | null;
  classExternalId: string | null;
  publishedAt: Date | null;
}

async function visibleAssessments(): Promise<AssessmentRef[]> {
  return prisma.assessment.findMany({
    where: { status: AssessmentStatus.PUBLISHED, ...resultsVisibleFilter() },
    select: { id: true, title: true, subjectExternalId: true, classExternalId: true, publishedAt: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * The single gate deciding real vs. DEV-only dummy data (see
 * leaderboardDevFallback.ts's module doc) — a cheap COUNT, not a full row
 * fetch, since every caller only needs to know "does ANY real
 * leaderboard-eligible assessment exist at all", never the rows themselves.
 * Real and dummy data are never blended: each of listAssessmentSessions/
 * assessmentLeaderboard/myAssessmentRanking picks ONE branch based on this
 * check, at the very top, before doing any other real-data work.
 */
async function hasAnyVisibleAssessments(): Promise<boolean> {
  const count = await prisma.assessment.count({
    where: { status: AssessmentStatus.PUBLISHED, ...resultsVisibleFilter() },
  });
  return count > 0;
}

/** Real name/avatarHue/schoolName/state for slotting the actual logged-in
 *  student into the DEV dummy roster (see leaderboardDevFallback.ts's
 *  injectActor) — null for non-student actors, who get no personal row.
 *  Exported for reuse by certificate.service.ts (same student-identity
 *  lookup, dev/real-agnostic) — do not duplicate this query elsewhere. */
export async function resolveActorProfile(actor: Actor): Promise<DevActorProfile | null> {
  if (actor.role !== Role.STUDENT) return null;
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, name: true, avatarHue: true, studentProfile: { select: { schoolName: true, state: true } } },
  });
  if (!user) return null;
  return {
    id: user.id, name: user.name, avatarHue: user.avatarHue,
    schoolName: user.studentProfile?.schoolName ?? null,
    state: user.studentProfile?.state ?? null,
  };
}

interface SessionFilters { session?: string; subjectExternalId?: string; classExternalId?: string }

/** Resolve a session+subject+class filter combination to the Assessment rows
 *  it maps to. No `session` given → defaults to the most recently published
 *  session, matching what the frontend's Session dropdown defaults to. */
async function resolveAssessments(filters: SessionFilters): Promise<AssessmentRef[]> {
  const all = await visibleAssessments();
  if (!all.length) return [];

  const sessionTitle = filters.session ?? all[0].title;
  let matched = all.filter(a => a.title === sessionTitle);
  if (filters.subjectExternalId) matched = matched.filter(a => a.subjectExternalId === filters.subjectExternalId);
  if (filters.classExternalId) matched = matched.filter(a => a.classExternalId === filters.classExternalId);
  return matched;
}

interface RankableRow {
  studentId: string;
  studentName: string;
  avatarHue: number;
  schoolName: string | null;
  state: string | null;
  classExternalId: string | null;
  score: number;
  totalMarks: number;
  timeTakenSec: number;
  submittedAt: Date;
  submissionId: string;
  assessmentId: string;
}

/** The one ranking rule shared by every scope (School/State/Global) and by
 *  a student's own rank lookup — see the module doc above forAssessment()
 *  for the tie-break order. Never diverges between scopes: each scope is
 *  just a different filter over the same rows, ranked the same way. */
function rankRows(rows: RankableRow[]): (RankableRow & { rank: number; percent: number })[] {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const pa = pct(a.score, a.totalMarks);
      const pb = pct(b.score, b.totalMarks);
      if (pb !== pa) return pb - pa;
      if (a.timeTakenSec !== b.timeTakenSec) return a.timeTakenSec - b.timeTakenSec;
      const ta = a.submittedAt.getTime();
      const tb = b.submittedAt.getTime();
      if (ta !== tb) return ta - tb;
      return a.studentId.localeCompare(b.studentId);
    })
    .map((r, i) => ({ ...r, rank: i + 1, percent: pct(r.score, r.totalMarks) }));
}

interface FetchRowsOpts {
  scope: 'school' | 'state' | 'global';
  viewerSchoolName?: string;
  viewerState?: string;
  schoolSearch?: string;
}

/** Countable (SUBMITTED/GRADED), visible-results submissions across the
 *  resolved assessment set, scoped/filtered, one row per student (summed
 *  across assessments in the rare multi-assessment-session case). */
async function fetchSubmissionRows(assessmentIds: string[], opts: FetchRowsOpts): Promise<RankableRow[]> {
  if (!assessmentIds.length) return [];

  const profileConditions: Prisma.StudentProfileWhereInput[] = [];
  if (opts.scope === 'school' && opts.viewerSchoolName) profileConditions.push({ schoolName: opts.viewerSchoolName });
  if (opts.scope === 'state' && opts.viewerState) profileConditions.push({ state: opts.viewerState });
  if (opts.schoolSearch) profileConditions.push({ schoolName: { contains: opts.schoolSearch } });

  const submissions = await prisma.submission.findMany({
    where: {
      assessmentId: { in: assessmentIds },
      status: COUNTABLE,
      assessment: resultsVisibleFilter(),
      ...(profileConditions.length && { student: { studentProfile: { AND: profileConditions } } }),
    },
    select: {
      id: true, assessmentId: true, studentId: true, score: true, totalMarks: true, timeTakenSec: true, submittedAt: true,
      student: { select: { name: true, avatarHue: true, studentProfile: { select: { schoolName: true, state: true, classExternalId: true } } } },
    },
  });

  const byStudent = new Map<string, RankableRow>();
  for (const s of submissions) {
    const profile = s.student.studentProfile;
    const submittedAt = s.submittedAt ?? new Date(0);
    const existing = byStudent.get(s.studentId);
    if (!existing) {
      byStudent.set(s.studentId, {
        studentId: s.studentId, studentName: s.student.name, avatarHue: s.student.avatarHue,
        schoolName: profile?.schoolName ?? null, state: profile?.state ?? null, classExternalId: profile?.classExternalId ?? null,
        score: s.score, totalMarks: s.totalMarks, timeTakenSec: s.timeTakenSec, submittedAt,
        submissionId: s.id, assessmentId: s.assessmentId,
      });
    } else {
      existing.score += s.score;
      existing.totalMarks += s.totalMarks;
      existing.timeTakenSec += s.timeTakenSec;
      if (submittedAt.getTime() > existing.submittedAt.getTime()) {
        existing.submittedAt = submittedAt;
        existing.submissionId = s.id;
        existing.assessmentId = s.assessmentId;
      }
    }
  }
  return [...byStudent.values()];
}

export const LeaderboardService = {
  async forAssessment(actor: Actor, assessmentId: string, query: AssessmentLeaderboardQuery) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, status: true, createdById: true, passingMarks: true, title: true, totalMarks: true },
    });
    if (!assessment) throw ApiError.notFound('Assessment not found');

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

    // resultsVisibleFilter() is a student-facing gate — a student can't see
    // rankings before results are published. Admin needs the opposite: the
    // whole point of an internal leaderboard/analytics view is deciding
    // whether to publish, so it must show real data regardless of
    // publish state. Only STUDENT actors are gated by it.
    const where = {
      assessmentId, status: COUNTABLE,
      ...(actor.role === Role.STUDENT && { assessment: resultsVisibleFilter() }),
    };

    const [rows, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy: [{ score: 'desc' }, { timeTakenSec: 'asc' }, { submittedAt: 'asc' }],
        skip, take,
        select: { studentId: true, score: true, totalMarks: true, timeTakenSec: true, submittedAt: true, status: true, student: { select: { name: true, avatarHue: true } } },
      }),
      prisma.submission.count({ where }),
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

    const assessmentFilter: Prisma.AssessmentWhereInput = resultsVisibleFilter();
    if (subjectExternalId) assessmentFilter.subjectExternalId = subjectExternalId;

    const grouped = await prisma.submission.groupBy({
      by: ['studentId'],
      where: { status: COUNTABLE, assessment: assessmentFilter },
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
      select: { id: true, name: true, avatarHue: true, studentProfile: { select: { schoolName: true } } },
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
          where: { studentId: actor.id, status: COUNTABLE, assessment: resultsVisibleFilter() },
          _sum: { score: true, totalMarks: true, timeTakenSec: true }, _count: { _all: true },
        }),
        prisma.submission.count({ where: { studentId: actor.id, status: SubmissionStatus.IN_PROGRESS } }),
        prisma.submission.groupBy({ by: ['studentId'], where: { status: COUNTABLE, assessment: resultsVisibleFilter() }, _sum: { score: true } }),
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

  /** Session/Subject/Class filter options for the Assessment Leaderboard —
   *  built only from visible-results assessments, never hardcoded. Falls
   *  back to DEV-only dummy sessions (see leaderboardDevFallback.ts) when
   *  there are none — never in production, never alongside real ones. */
  async listAssessmentSessions() {
    if (!(await hasAnyVisibleAssessments())) {
      return isDev ? devFallbackSessions() : { sessions: [], subjects: [], classes: [] };
    }

    const all = await visibleAssessments();

    const [subjectNames, classNames] = await Promise.all([ContentMeta.subjects(), ContentMeta.classes()]);

    const order: string[] = [];
    const byTitle = new Map<string, AssessmentRef[]>();
    for (const a of all) {
      if (!byTitle.has(a.title)) { byTitle.set(a.title, []); order.push(a.title); }
      byTitle.get(a.title)!.push(a);
    }

    const sessions = order.map((title) => {
      const rows = byTitle.get(title)!;
      return {
        title,
        subjectExternalIds: [...new Set(rows.map(r => r.subjectExternalId).filter((x): x is string => !!x))],
        classExternalIds:   [...new Set(rows.map(r => r.classExternalId).filter((x): x is string => !!x))],
      };
    });

    const subjectIds = [...new Set(all.map(a => a.subjectExternalId).filter((x): x is string => !!x))];
    const classIds    = [...new Set(all.map(a => a.classExternalId).filter((x): x is string => !!x))];

    const subjects = subjectIds
      .map(id => ({ id, name: subjectNames.get(id) ?? UNKNOWN_SUBJECT_NAME }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const classes = sortByClassName(
      classIds.map(id => ({ id, name: classNames.get(id) ?? UNKNOWN_CLASS_NAME })),
      c => c.name,
    );

    return { sessions, subjects, classes };
  },

  /** School / State / Global leaderboard for a resolved session. Falls back
   *  to DEV-only dummy data (see leaderboardDevFallback.ts) when there is no
   *  real leaderboard-eligible data anywhere — never in production, never
   *  blended with real rows. */
  async assessmentLeaderboard(actor: Actor, query: ScopedLeaderboardQuery) {
    const { scope, page, limit, school: schoolSearch, ...sessionFilters } = query;

    if (!(await hasAnyVisibleAssessments())) {
      if (!isDev) return { items: [], meta: pageMeta(0, page, limit), reason: 'NO_SESSION' as const };
      const actorProfile = await resolveActorProfile(actor);
      return devFallbackAssessmentLeaderboard({ scope, page, limit, school: schoolSearch, ...sessionFilters }, actorProfile);
    }

    const assessments = await resolveAssessments(sessionFilters);
    const assessmentIds = assessments.map(a => a.id);

    let viewerProfile: { schoolName: string | null; state: string | null } | null = null;
    if (scope !== 'global') {
      viewerProfile = await prisma.studentProfile.findUnique({
        where: { userId: actor.id }, select: { schoolName: true, state: true },
      });
    }
    if (scope === 'school' && !viewerProfile?.schoolName) {
      return { items: [], meta: pageMeta(0, page, limit), reason: 'NO_SCHOOL' as const };
    }
    if (scope === 'state' && !viewerProfile?.state) {
      return { items: [], meta: pageMeta(0, page, limit), reason: 'NO_STATE' as const };
    }
    if (!assessmentIds.length) {
      return { items: [], meta: pageMeta(0, page, limit), reason: 'NO_SESSION' as const };
    }

    const rows = await fetchSubmissionRows(assessmentIds, {
      scope,
      viewerSchoolName: viewerProfile?.schoolName ?? undefined,
      viewerState:      viewerProfile?.state ?? undefined,
      schoolSearch,
    });
    const ranked = rankRows(rows);
    const total  = ranked.length;
    const { skip, take } = pageToSkipTake(page, limit);
    const pageItems = ranked.slice(skip, skip + take);

    const classNames = await ContentMeta.classes();
    const items = pageItems.map(r => ({
      rank: r.rank, studentId: r.studentId, studentName: r.studentName, avatarHue: r.avatarHue,
      schoolName: r.schoolName, state: r.state,
      classExternalId: r.classExternalId,
      className: r.classExternalId ? (classNames.get(r.classExternalId) ?? UNKNOWN_CLASS_NAME) : null,
      score: r.score, totalMarks: r.totalMarks, percent: r.percent, timeTakenSec: r.timeTakenSec,
      submissionId: r.submissionId,
    }));

    return { items, meta: pageMeta(total, page, limit) };
  },

  /** The logged-in student's own School/State/Global rank + score info +
   *  earned badges for a resolved session. Never fabricates a rank — returns
   *  hasResult:false when the student has no countable submission in scope.
   *  Falls back to a DEV-only dummy ranking (see leaderboardDevFallback.ts)
   *  when there is no real leaderboard-eligible data anywhere. */
  async myAssessmentRanking(actor: Actor, query: MyRankingQuery) {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('Only students have a personal assessment ranking');

    if (!(await hasAnyVisibleAssessments())) {
      if (!isDev) return { hasResult: false as const, reason: 'NO_SESSION' as const };
      const actorProfile = await resolveActorProfile(actor);
      return devFallbackMyRanking(query, actorProfile);
    }

    const assessments = await resolveAssessments(query);
    const assessmentIds = assessments.map(a => a.id);
    if (!assessmentIds.length) return { hasResult: false as const, reason: 'NO_SESSION' as const };

    const viewerProfile = await prisma.studentProfile.findUnique({
      where: { userId: actor.id }, select: { schoolName: true, state: true },
    });

    const [globalRows, schoolRows, stateRows] = await Promise.all([
      fetchSubmissionRows(assessmentIds, { scope: 'global' }),
      viewerProfile?.schoolName
        ? fetchSubmissionRows(assessmentIds, { scope: 'school', viewerSchoolName: viewerProfile.schoolName })
        : Promise.resolve([]),
      viewerProfile?.state
        ? fetchSubmissionRows(assessmentIds, { scope: 'state', viewerState: viewerProfile.state })
        : Promise.resolve([]),
    ]);

    const globalRanked = rankRows(globalRows);
    const me = globalRanked.find(r => r.studentId === actor.id);
    if (!me) return { hasResult: false as const, reason: 'NO_RESULT' as const };

    const schoolRank = schoolRows.length ? rankRows(schoolRows).find(r => r.studentId === actor.id)?.rank ?? null : null;
    const stateRank  = stateRows.length ? rankRows(stateRows).find(r => r.studentId === actor.id)?.rank ?? null : null;
    const globalRank = me.rank;

    const badges: string[] = [];
    if (schoolRank === 1) badges.push('SCHOOL_CHAMPION');
    if (stateRank === 1) badges.push('STATE_CHAMPION');
    if (globalRank === 1) badges.push('GLOBAL_CHAMPION');
    if (globalRank <= 10) badges.push('GLOBAL_TOP_10');
    if (globalRank <= 100) badges.push('GLOBAL_TOP_100');
    if (stateRank !== null && stateRank <= 10) badges.push('STATE_TOP_10');

    const [classNames, subjectNames] = await Promise.all([ContentMeta.classes(), ContentMeta.subjects()]);
    const matchedAssessment = assessments.find(a => a.id === me.assessmentId) ?? assessments[0] ?? null;
    const sessionTitle = matchedAssessment?.title ?? null;
    const subjectExternalId = matchedAssessment?.subjectExternalId ?? null;

    return {
      hasResult: true as const,
      assessmentId: me.assessmentId,
      assessmentTitle: sessionTitle,
      submissionId: me.submissionId,
      schoolRank, stateRank, globalRank,
      // Denominator for "#rank out of N students" — already computed above
      // as part of ranking everyone in scope, just not previously returned.
      totalStudents: globalRanked.length,
      score: me.score, totalMarks: me.totalMarks, percent: me.percent, timeTakenSec: me.timeTakenSec,
      classExternalId: me.classExternalId,
      className: me.classExternalId ? (classNames.get(me.classExternalId) ?? UNKNOWN_CLASS_NAME) : null,
      subjectExternalId,
      subjectName: subjectExternalId ? (subjectNames.get(subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : null,
      // The viewer's own school/state, already fetched above for scoping —
      // surfaced here purely for display (Analytics' "Your Assessment
      // Ranking" section), not a new query.
      schoolName: viewerProfile?.schoolName ?? null,
      state: viewerProfile?.state ?? null,
      badges,
    };
  },
};
