/**
 * DEV-ONLY Leaderboard fallback.
 *
 * Exists PURELY so the full Assessment Leaderboard UI (School/State/Global
 * tabs, Session/Subject/Class/School filters, "Your Assessment Ranking",
 * badges, the ranked table) can be seen and exercised locally before any
 * real Assessment has published results. Every exported function is a pure,
 * in-memory generator — nothing here ever touches Prisma or writes a
 * database row (unlike devAssessmentFallback.ts's materialized dummy
 * Assessments), per an explicit product decision to keep this fallback
 * fully isolated from the real database.
 *
 * Gating (defense in depth, matching devAssessmentFallback.ts's convention):
 *   1. Every exported function starts with `if (!isDev) return <empty>` —
 *      cannot produce dummy data in production even if a caller forgets to
 *      check first.
 *   2. The actual caller, leaderboard.service.ts, only reaches into this
 *      module when hasAnyVisibleAssessments() — a real, live query — finds
 *      ZERO leaderboard-eligible assessments anywhere in the system. The
 *      instant one real published-results Assessment exists, every
 *      leaderboard.service.ts method goes back to its real-data path and
 *      never calls into this file again. Real and dummy rows are never
 *      blended in a single response — see the "if/else", not "if" +
 *      "always append", branching at each call site.
 *
 * NEVER import this module from client code, and never call it from a
 * leaderboard.service.ts code path that isn't already behind that
 * hasAnyVisibleAssessments() === false gate.
 */
import { isDev } from '../config';
import { pageMeta, pageToSkipTake } from '../utils/pagination';

// ── Fixture data ────────────────────────────────────────────────────────
// Deterministic (no Math.random) so the preview is stable across reloads —
// easier to eyeball while testing than data that reshuffles on every fetch.

interface DevSchool { name: string; state: string }

const DEV_SCHOOLS: DevSchool[] = [
  { name: 'Sunrise Public School', state: 'Delhi' },
  { name: 'Green Valley School', state: 'Delhi' },
  { name: 'Lakeview Academy', state: 'Maharashtra' },
  { name: 'Riverside High School', state: 'Karnataka' },
];

const DEV_NAMES = [
  'Aditi Sharma', 'Vihaan Patel', 'Saanvi Reddy', 'Arjun Nair', 'Diya Kapoor',
  'Kabir Singh', 'Myra Joshi', 'Reyansh Gupta', 'Anika Rao', 'Vivaan Mehta',
];

interface DevSession {
  title: string;
  subjectId: string; subjectName: string;
  classId: string; className: string;
}

// Multiple sessions × subjects, per requirement 5 ("Multiple sessions,
// Multiple subjects") — ids are namespaced `dev-*` so they can never
// collide with a real Content API external id.
const DEV_SESSIONS: DevSession[] = [
  { title: 'Epoch Olympiad Assessment 2026', subjectId: 'dev-subject-math',    subjectName: 'Mathematics', classId: 'dev-class-6', className: 'Class 6' },
  { title: 'Epoch Science Challenge 2026',   subjectId: 'dev-subject-science', subjectName: 'Science',     classId: 'dev-class-8', className: 'Class 8' },
  { title: 'Epoch English Olympiad 2026',    subjectId: 'dev-subject-english', subjectName: 'English',     classId: 'dev-class-6', className: 'Class 6' },
];

interface DevRow {
  studentId: string; studentName: string; avatarHue: number;
  schoolName: string; state: string;
  classExternalId: string; className: string;
  score: number; totalMarks: number; timeTakenSec: number;
  submittedAt: Date; submissionId: string;
}

function sessionIndex(session: DevSession): number {
  return DEV_SESSIONS.indexOf(session);
}

/** One deterministic-but-varied roster per session — different scores/times
 *  per (session, student) so switching sessions visibly changes the board. */
function buildRoster(session: DevSession): DevRow[] {
  const si = sessionIndex(session);
  return DEV_NAMES.map((name, i) => {
    const school = DEV_SCHOOLS[i % DEV_SCHOOLS.length];
    const score = 60 + ((i * 7 + si * 13) % 39); // 60..98
    const timeTakenSec = 300 + ((i * 53 + si * 29) % 900); // 300..1199s
    return {
      studentId: `dev-student-${si}-${i}`,
      studentName: name,
      avatarHue: (i * 47 + si * 19) % 360,
      schoolName: school.name,
      state: school.state,
      classExternalId: session.classId,
      className: session.className,
      score, totalMarks: 100, timeTakenSec,
      submittedAt: new Date(Date.now() - (i + 1) * 3_600_000 - si * 60_000),
      submissionId: `dev-submission-${si}-${i}`,
    };
  });
}

export interface DevActorProfile {
  id: string; name: string; avatarHue: number;
  schoolName: string | null; state: string | null;
}

/** Slots the real logged-in student into the fixture roster (using their
 *  real name/school/state when set) so "Your Assessment Ranking" shows a
 *  genuine position instead of an arbitrary fixture row — see requirement 5
 *  ("Student's own ranking"). Falls back to the first fixture school/state
 *  when the student's own profile has none set yet. */
function injectActor(roster: DevRow[], actor: DevActorProfile, session: DevSession): DevRow[] {
  if (roster.some(r => r.studentId === actor.id)) return roster;
  const fallbackSchool = DEV_SCHOOLS[0];
  return [
    ...roster,
    {
      studentId: actor.id,
      studentName: actor.name,
      avatarHue: actor.avatarHue,
      schoolName: actor.schoolName ?? fallbackSchool.name,
      state: actor.state ?? fallbackSchool.state,
      classExternalId: session.classId,
      className: session.className,
      score: 82, totalMarks: 100, timeTakenSec: 640,
      submittedAt: new Date(Date.now() - 45 * 60_000),
      submissionId: `dev-submission-actor-${actor.id}`,
    },
  ];
}

// ── Ranking (kept in sync BY HAND with leaderboard.service.ts's rankRows /
// badge rules — duplicated rather than imported to keep this module fully
// standalone, with zero coupling to the real-data code path. Same tie-break
// order: score desc, percent desc, time asc, submittedAt asc, studentId asc. ──

function pct(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
}

function rankDevRows(rows: DevRow[]): (DevRow & { rank: number; percent: number })[] {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const pa = pct(a.score, a.totalMarks), pb = pct(b.score, b.totalMarks);
      if (pb !== pa) return pb - pa;
      if (a.timeTakenSec !== b.timeTakenSec) return a.timeTakenSec - b.timeTakenSec;
      const ta = a.submittedAt.getTime(), tb = b.submittedAt.getTime();
      if (ta !== tb) return ta - tb;
      return a.studentId.localeCompare(b.studentId);
    })
    .map((r, i) => ({ ...r, rank: i + 1, percent: pct(r.score, r.totalMarks) }));
}

/** Same badge thresholds as leaderboard.service.ts's myAssessmentRanking. */
function computeBadges(schoolRank: number | null, stateRank: number | null, globalRank: number): string[] {
  const badges: string[] = [];
  if (schoolRank === 1) badges.push('SCHOOL_CHAMPION');
  if (stateRank === 1) badges.push('STATE_CHAMPION');
  if (globalRank === 1) badges.push('GLOBAL_CHAMPION');
  if (globalRank <= 10) badges.push('GLOBAL_TOP_10');
  if (globalRank <= 100) badges.push('GLOBAL_TOP_100');
  if (stateRank !== null && stateRank <= 10) badges.push('STATE_TOP_10');
  return badges;
}

function findSession(title?: string): DevSession | null {
  if (!title) return DEV_SESSIONS[0] ?? null;
  return DEV_SESSIONS.find(s => s.title === title) ?? null;
}

interface DevFilters { session?: string; subjectExternalId?: string; classExternalId?: string }

/** null = the filter combination matches no dev session (mirrors
 *  resolveAssessments() returning [] for an unmatched real filter combo). */
function resolveDevSession(filters: DevFilters): DevSession | null {
  const session = findSession(filters.session);
  if (!session) return null;
  if (filters.subjectExternalId && filters.subjectExternalId !== session.subjectId) return null;
  if (filters.classExternalId && filters.classExternalId !== session.classId) return null;
  return session;
}

// ── Public entry points — mirror leaderboard.service.ts's real methods ────

export function isDevFallbackEnabled(): boolean {
  return isDev;
}

export function devFallbackSessions() {
  if (!isDev) return { sessions: [], subjects: [], classes: [], devFallback: false as const };

  return {
    devFallback: true as const,
    sessions: DEV_SESSIONS.map(s => ({ title: s.title, subjectExternalIds: [s.subjectId], classExternalIds: [s.classId] })),
    subjects: [...new Map(DEV_SESSIONS.map(s => [s.subjectId, { id: s.subjectId, name: s.subjectName }])).values()],
    classes:  [...new Map(DEV_SESSIONS.map(s => [s.classId, { id: s.classId, name: s.className }])).values()],
  };
}

interface DevLeaderboardQuery extends DevFilters {
  scope: 'school' | 'state' | 'global';
  school?: string;
  page: number;
  limit: number;
}

export function devFallbackAssessmentLeaderboard(query: DevLeaderboardQuery, actor: DevActorProfile | null) {
  const empty = (reason?: 'NO_SCHOOL' | 'NO_STATE' | 'NO_SESSION') => ({
    items: [], meta: pageMeta(0, query.page, query.limit), devFallback: true as const, ...(reason ? { reason } : {}),
  });
  if (!isDev) return { items: [], meta: pageMeta(0, query.page, query.limit) };

  const session = resolveDevSession(query);
  if (!session) return empty('NO_SESSION');

  let roster = buildRoster(session);
  if (actor) roster = injectActor(roster, actor, session);

  if (query.scope === 'school' || query.scope === 'state') {
    const key = query.scope === 'school' ? actor?.schoolName : actor?.state;
    if (!key) return empty(query.scope === 'school' ? 'NO_SCHOOL' : 'NO_STATE');
    roster = roster.filter(r => (query.scope === 'school' ? r.schoolName : r.state) === key);
  }
  if (query.school) {
    const needle = query.school.trim().toLowerCase();
    roster = roster.filter(r => r.schoolName.toLowerCase().includes(needle));
  }

  const ranked = rankDevRows(roster);
  const total = ranked.length;
  const { skip, take } = pageToSkipTake(query.page, query.limit);
  const items = ranked.slice(skip, skip + take).map(r => ({
    rank: r.rank, studentId: r.studentId, studentName: r.studentName, avatarHue: r.avatarHue,
    schoolName: r.schoolName, state: r.state,
    classExternalId: r.classExternalId, className: r.className,
    score: r.score, totalMarks: r.totalMarks, percent: r.percent, timeTakenSec: r.timeTakenSec,
    submissionId: r.submissionId,
  }));

  return { items, meta: pageMeta(total, query.page, query.limit), devFallback: true as const };
}

export function devFallbackMyRanking(filters: DevFilters, actor: DevActorProfile | null) {
  if (!isDev || !actor) return { hasResult: false as const, reason: 'NO_RESULT' as const };

  const session = resolveDevSession(filters);
  if (!session) return { hasResult: false as const, reason: 'NO_SESSION' as const, devFallback: true as const };

  const globalRoster = injectActor(buildRoster(session), actor, session);
  const globalRanked = rankDevRows(globalRoster);
  const me = globalRanked.find(r => r.studentId === actor.id);
  if (!me) return { hasResult: false as const, reason: 'NO_RESULT' as const, devFallback: true as const };

  const schoolRoster = actor.schoolName ? globalRoster.filter(r => r.schoolName === actor.schoolName) : [];
  const stateRoster  = actor.state ? globalRoster.filter(r => r.state === actor.state) : [];
  const schoolRank = schoolRoster.length ? rankDevRows(schoolRoster).find(r => r.studentId === actor.id)?.rank ?? null : null;
  const stateRank  = stateRoster.length ? rankDevRows(stateRoster).find(r => r.studentId === actor.id)?.rank ?? null : null;
  const globalRank = me.rank;

  return {
    hasResult: true as const,
    devFallback: true as const,
    assessmentId: `dev-assessment-${sessionIndex(session)}`,
    assessmentTitle: session.title,
    submissionId: me.submissionId,
    schoolRank, stateRank, globalRank,
    score: me.score, totalMarks: me.totalMarks, percent: me.percent, timeTakenSec: me.timeTakenSec,
    classExternalId: me.classExternalId, className: me.className,
    badges: computeBadges(schoolRank, stateRank, globalRank),
  };
}
