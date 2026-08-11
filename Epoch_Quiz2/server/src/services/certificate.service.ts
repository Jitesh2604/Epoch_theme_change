/**
 * My Certificates — a presentation layer over LeaderboardService, not a
 * second ranking system. Every rank/score shown is recomputed live from
 * LeaderboardService.myAssessmentRanking() on every request (same as the
 * Leaderboard page itself); this file never freezes a rank. The only thing
 * persisted is a minimal identity POINTER (see the Certificate model's doc
 * comment in schema.prisma) so the public Verify-by-ID endpoint has
 * something durable to resolve a certificateId string back to a student —
 * without it, verification would be impossible (a one-way hash can't be
 * reversed from the ID alone).
 *
 * DEV-fallback certificates (LeaderboardService already decides real vs.
 * fallback internally — see leaderboardDevFallback.ts) never touch the
 * Certificate table, inherited automatically by simply calling
 * LeaderboardService rather than re-implementing its source selection here.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Role } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { LeaderboardService, resolveActorProfile } from './leaderboard.service';
import type { Actor } from './assessment.service';

type RankField = 'schoolRank' | 'stateRank' | 'globalRank';

interface CertMeta {
  title:       string;
  typeCode:    string; // GLO | STA | SCH — the code embedded in the certificate id
  scope:       'global' | 'state' | 'school';
  description: string;
  rankField:   RankField;
}

// Static label dictionary (like the client's BADGE_META) — not per-student
// data. Keys are exactly the 6 badge codes LeaderboardService.myAssessmentRanking
// already computes in computeBadges(); no new eligibility logic is added here.
const CERT_META: Record<string, CertMeta> = {
  GLOBAL_CHAMPION: { title: 'Global Champion', typeCode: 'GLO', scope: 'global', rankField: 'globalRank', description: 'Ranked #1 across all students globally.' },
  GLOBAL_TOP_10:   { title: 'Global Top 10',   typeCode: 'GLO', scope: 'global', rankField: 'globalRank', description: 'Ranked in the global top 10.' },
  GLOBAL_TOP_100:  { title: 'Global Top 100',  typeCode: 'GLO', scope: 'global', rankField: 'globalRank', description: 'Ranked in the global top 100.' },
  STATE_CHAMPION:  { title: 'State Champion',  typeCode: 'STA', scope: 'state',  rankField: 'stateRank',  description: 'Ranked #1 in their state.' },
  STATE_TOP_10:    { title: 'State Top 10',    typeCode: 'STA', scope: 'state',  rankField: 'stateRank',  description: 'Ranked in the state top 10.' },
  SCHOOL_CHAMPION: { title: 'School Rank #1',  typeCode: 'SCH', scope: 'school', rankField: 'schoolRank', description: 'Ranked #1 within their school.' },
};

export interface CertificateDto {
  certificateId: string;
  type:          string;
  title:         string;
  description:   string;
  scope:         'global' | 'state' | 'school';
  studentName:   string;
  rank:          number;
  score:         number;
  totalMarks:    number;
  percent:       number;
  sessionTitle:  string;
  schoolName:    string | null;
  state:         string | null;
  className:     string | null;
  issuedAt:      string;
  devFallback:   boolean;
}

export interface VerifyResult {
  valid:        boolean;
  studentName?: string;
  title?:       string;
  rank?:        number | null;
  score?:       number;
  totalMarks?:  number;
  issuedAt?:    string;
  sessionTitle?: string;
}

/** Real year of the session/assessment itself (parsed from its title, e.g.
 *  "Epoch Olympiad Assessment 2026" -> 2026) rather than "today" — a
 *  certificate's year should reflect when the achievement happened, not
 *  when someone happens to view the page. Falls back to the current year
 *  only when the title carries no 4-digit year at all. */
function yearFromSessionTitle(title: string): number {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
}

/** Deterministic djb2-style string hash — pure function, same input always
 *  produces the same output, which is what makes a certificate id stable
 *  across reloads without needing to store it (for the DEV-fallback path). */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function formatCertificateId(year: number, typeCode: string, num: number): string {
  return `EO-${year}-${typeCode}-${String(num % 1_000_000).padStart(6, '0')}`;
}

/** DEV-fallback certificates get a stable id too (same hash function, no DB
 *  row) — they just can't be looked up by the public verify endpoint, since
 *  nothing durable backs them. That's an intentional, honest distinction
 *  between preview data and a real, issued certificate. */
function devCertificateId(studentId: string, certType: string, sessionTitle: string, year: number, typeCode: string): string {
  const num = stableHash(`${studentId}:${certType}:${sessionTitle}:dev`);
  return formatCertificateId(year, typeCode, num);
}

// Fixed reference date (not `new Date()`, which would drift daily) so a DEV
// fallback certificate's "issued on" date stays stable across reloads.
const DEV_ISSUED_BASE = Date.UTC(2026, 6, 15); // 2026-07-15
function devIssuedAt(sessionIndex: number): Date {
  return new Date(DEV_ISSUED_BASE + sessionIndex * 3 * 86_400_000);
}

/**
 * Finds or lazily creates the durable (studentId, certType, sessionTitle) ->
 * certificateId pointer row. Only ever called for REAL (non-DEV-fallback)
 * certificates. Collision-safe: relies on the DB's own unique constraint on
 * `certificateId` (P2002) rather than a check-then-create race, retrying
 * with a salted hash on the (very rare) collision with a different
 * student/type/session's id.
 */
async function getOrCreateCertificate(
  studentId: string, certType: string, sessionTitle: string, year: number, typeCode: string,
): Promise<{ certificateId: string; createdAt: Date }> {
  const existing = await prisma.certificate.findUnique({
    where: { studentId_certType_sessionTitle: { studentId, certType, sessionTitle } },
  });
  if (existing) return existing;

  for (let salt = 0; salt < 5; salt++) {
    const num = stableHash(`${studentId}:${certType}:${sessionTitle}:${salt}`);
    const certificateId = formatCertificateId(year, typeCode, num);
    try {
      return await prisma.certificate.create({ data: { certificateId, studentId, certType, sessionTitle } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // id taken by a different combo — retry
      throw err;
    }
  }
  throw new ApiError(500, 'Could not allocate a certificate ID — please try again.');
}

function pickRank(meta: CertMeta, ranking: { schoolRank?: number | null; stateRank?: number | null; globalRank?: number }): number | null {
  if (meta.rankField === 'schoolRank') return ranking.schoolRank ?? null;
  if (meta.rankField === 'stateRank')  return ranking.stateRank ?? null;
  return ranking.globalRank ?? null;
}

export const CertificateService = {
  /** Every certificate the logged-in student has currently, genuinely
   *  earned — across every session they have a published result in.
   *  Never accepts a target student id; always computed for `actor` only
   *  (see certificate.controller.ts) — a student can only ever see their
   *  own certificates. */
  async myCertificates(actor: Actor): Promise<CertificateDto[]> {
    if (actor.role !== Role.STUDENT) throw ApiError.forbidden('Only students have certificates');

    const profile = await resolveActorProfile(actor);
    if (!profile) return [];

    const { sessions } = await LeaderboardService.listAssessmentSessions();
    const out: CertificateDto[] = [];

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const ranking = await LeaderboardService.myAssessmentRanking(actor, { session: session.title });
      if (!ranking.hasResult || !ranking.badges?.length) continue;

      const year = yearFromSessionTitle(session.title);
      // myAssessmentRanking's success shape only includes `devFallback` on
      // its DEV-fallback branch — absent (not just false) on the real-data
      // branch, hence the `in` check rather than direct property access.
      const isDevFallback = 'devFallback' in ranking && ranking.devFallback === true;

      for (const certType of ranking.badges) {
        const meta = CERT_META[certType];
        if (!meta) continue; // unknown/future badge code — ignore rather than guess
        const rank = pickRank(meta, ranking);
        if (rank == null) continue; // defensive — shouldn't happen for an earned badge

        let certificateId: string;
        let issuedAt: Date;
        if (isDevFallback) {
          certificateId = devCertificateId(profile.id, certType, session.title, year, meta.typeCode);
          issuedAt = devIssuedAt(i);
        } else {
          const record = await getOrCreateCertificate(profile.id, certType, session.title, year, meta.typeCode);
          certificateId = record.certificateId;
          issuedAt = record.createdAt;
        }

        out.push({
          certificateId, type: certType, title: meta.title, description: meta.description, scope: meta.scope,
          studentName: profile.name, rank,
          score: ranking.score ?? 0, totalMarks: ranking.totalMarks ?? 0, percent: ranking.percent ?? 0,
          sessionTitle: session.title,
          schoolName: profile.schoolName, state: profile.state, className: ranking.className ?? null,
          issuedAt: issuedAt.toISOString(),
          devFallback: isDevFallback,
        });
      }
    }

    return out;
  },

  /** Public, unauthenticated lookup by certificate id. Always re-checks
   *  CURRENT eligibility live (via the same LeaderboardService ranking a
   *  student's own listing uses) rather than trusting the stored pointer
   *  forever — if the student's rank has since dropped out of qualifying
   *  range, verification correctly reports invalid. Returns only what's
   *  needed to prove authenticity; never email, studentId, school, or state. */
  async verify(certificateId: string): Promise<VerifyResult> {
    const record = await prisma.certificate.findUnique({ where: { certificateId } });
    if (!record) return { valid: false };

    const meta = CERT_META[record.certType];
    if (!meta) return { valid: false };

    const syntheticActor: Actor = { id: record.studentId, role: Role.STUDENT };
    const [profile, ranking] = await Promise.all([
      resolveActorProfile(syntheticActor),
      LeaderboardService.myAssessmentRanking(syntheticActor, { session: record.sessionTitle }),
    ]);

    if (!profile || !ranking.hasResult || !ranking.badges?.includes(record.certType)) {
      return { valid: false };
    }

    return {
      valid: true,
      studentName: profile.name,
      title: meta.title,
      rank: pickRank(meta, ranking),
      score: ranking.score ?? 0,
      totalMarks: ranking.totalMarks ?? 0,
      issuedAt: record.createdAt.toISOString(),
      sessionTitle: record.sessionTitle,
    };
  },
};
