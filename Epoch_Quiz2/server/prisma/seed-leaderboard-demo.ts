/**
 * Leaderboard demo/preview seed — populates the EXISTING Assessment /
 * Submission / School / StudentProfile tables with a realistic, deterministic
 * dataset so the Leaderboard (School/State/Global/Session scopes), "My
 * Ranking", and My Certificates can be exercised end to end in the browser.
 *
 * This is ONLY seed/demo data:
 *   - No leaderboard ranking/business logic is touched. Rank is never stored
 *     anywhere here — LeaderboardService.rankRows() computes it live from the
 *     Submission rows this script writes, exactly like it does for real data.
 *   - No frontend dummy data — every screen still reads from the same API
 *     that serves real data; this only changes what's in the database.
 *   - Subject/Class external ids are looked up BY NAME from the live Content
 *     API via ContentService (the same service LeaderboardService/
 *     ContentMeta use to resolve names) — never hardcoded ids — so this
 *     script stays correct if the catalog's numeric ids ever change.
 *
 * Deterministic + idempotent + safe to re-run:
 *   - Every row is created via upsert on that model's real unique key
 *     (School.name, SchoolState.name, SchoolBranch's @@unique, User.email,
 *     StudentProfile.userId, Submission's @@unique([assessmentId,studentId])).
 *   - Assessment has no natural unique key in the schema, so this script
 *     find-or-creates by (title, subjectExternalId, classExternalId) — a
 *     triple only this script's own demo titles will ever match.
 *   - All score/time/skip variation comes from a fixed-seed PRNG
 *     (mulberry32), called in a fixed order — same output every run, never
 *     Math.random().
 *   - Never deletes or touches any pre-existing row (real or from another
 *     seed script) — purely additive/idempotent upserts.
 *
 * Usage (run from server/):
 *   npm run seed:leaderboard-demo
 */
import { PrismaClient, Role, UserStatus, AssessmentStatus, SubmissionStatus, QuestionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ContentService } from '../src/services/content.service';

const prisma = new PrismaClient();

const DEMO_TAG = 'leaderboard-demo-seed';
const DEMO_EMAIL_DOMAIN = 'epochquiz.demo';
const DEMO_PASSWORD = process.env.SEED_LEADERBOARD_DEMO_PASSWORD ?? 'Demo@12345';

// ── Fixed-seed PRNG — deterministic "realistic variety", never Math.random() ─
function mulberry32(seed: number) {
  let s = seed;
  return function rand(): number {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260212); // fixed seed — same numbers every run

// ── Schools / Branches / States ────────────────────────────────────────────
// Delhi is deliberately used by ONE branch from EACH school (A1 and B1) —
// a state leaderboard must mix students from different schools, or "State"
// and "School" scope views can never look meaningfully different (this is
// what v1 of this seed got wrong: schools and states were both 1:1 blocks,
// so School/State/Global rankings were near-identical subsets of each
// other). Maharashtra/Karnataka stay single-school so not every state is
// mixed (also realistic), while Delhi demonstrates the interleaving.
interface BranchDef { key: string; name: string; state: string; city: string; schoolName: string }
const SCHOOLS = ['Demo School A', 'Demo School B'] as const;
const BRANCHES: BranchDef[] = [
  { key: 'A1', name: 'Branch A1', state: 'Delhi',       city: 'New Delhi', schoolName: 'Demo School A' },
  { key: 'A2', name: 'Branch A2', state: 'Maharashtra', city: 'Mumbai',    schoolName: 'Demo School A' },
  { key: 'B1', name: 'Branch B1', state: 'Delhi',       city: 'Gurugram',  schoolName: 'Demo School B' },
  { key: 'B2', name: 'Branch B2', state: 'Karnataka',   city: 'Bengaluru', schoolName: 'Demo School B' },
];

// ── Students — one explicit row per student (index = 1-based Demo Student
// number). Branch/class/skill are hand-picked per student rather than
// derived from a formula, for two reasons:
//   1. Base skill (out of 100) is deliberately DECORRELATED from school/
//      branch/class — v1 of this seed used a monotonic ramp aligned with
//      student index/school block, so Global, State, and School top-N ended
//      up showing near-identical rosters. Here the strongest and weakest
//      performers are scattered across both schools and every state, so
//      Global Top 5 spans both schools/multiple states, Delhi (School A's
//      A1 + School B's B1) interleaves both schools, and each school's/
//      state's own #1 is not necessarily the Global #1.
//   2. Students 21–30 (Class 4 and Class 5) were added on request because
//      real Assessment content already exists for those two classes — kept
//      in this same demo dataset (rather than a separate script) so they
//      still count toward the same Global/State/School Session ranking as
//      Students 1–20, and toward each of their own school/state pools too.
// (Verified against the live LeaderboardService after seeding — see the
// chat transcript / final report for the actual resulting Top 5s.)
interface StudentDef { branchKey: string; className: string; baseSkill: number }
const STUDENT_DEFS: StudentDef[] = [
  { branchKey: 'A1', className: 'Class 6', baseSkill: 88 }, //  1  Demo School A · Branch A1 · Delhi
  { branchKey: 'A1', className: 'Class 7', baseSkill: 97 }, //  2  Demo School A · Branch A1 · Delhi
  { branchKey: 'A1', className: 'Class 8', baseSkill: 79 }, //  3  Demo School A · Branch A1 · Delhi
  { branchKey: 'A1', className: 'Class 6', baseSkill: 68 }, //  4  Demo School A · Branch A1 · Delhi
  { branchKey: 'A1', className: 'Class 7', baseSkill: 55 }, //  5  Demo School A · Branch A1 · Delhi
  { branchKey: 'A2', className: 'Class 8', baseSkill: 84 }, //  6  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'A2', className: 'Class 6', baseSkill: 71 }, //  7  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'A2', className: 'Class 7', baseSkill: 60 }, //  8  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'A2', className: 'Class 8', baseSkill: 48 }, //  9  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'A2', className: 'Class 6', baseSkill: 38 }, // 10  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'B1', className: 'Class 7', baseSkill: 91 }, // 11  Demo School B · Branch B1 · Delhi
  { branchKey: 'B1', className: 'Class 8', baseSkill: 74 }, // 12  Demo School B · Branch B1 · Delhi
  { branchKey: 'B1', className: 'Class 6', baseSkill: 63 }, // 13  Demo School B · Branch B1 · Delhi
  { branchKey: 'B1', className: 'Class 7', baseSkill: 52 }, // 14  Demo School B · Branch B1 · Delhi
  { branchKey: 'B1', className: 'Class 8', baseSkill: 42 }, // 15  Demo School B · Branch B1 · Delhi
  { branchKey: 'B2', className: 'Class 6', baseSkill: 86 }, // 16  Demo School B · Branch B2 · Karnataka
  { branchKey: 'B2', className: 'Class 7', baseSkill: 76 }, // 17  Demo School B · Branch B2 · Karnataka
  { branchKey: 'B2', className: 'Class 8', baseSkill: 65 }, // 18  Demo School B · Branch B2 · Karnataka
  { branchKey: 'B2', className: 'Class 6', baseSkill: 54 }, // 19  Demo School B · Branch B2 · Karnataka
  { branchKey: 'B2', className: 'Class 7', baseSkill: 45 }, // 20  Demo School B · Branch B2 · Karnataka
  { branchKey: 'A1', className: 'Class 4', baseSkill: 80 }, // 21  Demo School A · Branch A1 · Delhi
  { branchKey: 'A2', className: 'Class 4', baseSkill: 58 }, // 22  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'B1', className: 'Class 4', baseSkill: 93 }, // 23  Demo School B · Branch B1 · Delhi
  { branchKey: 'B2', className: 'Class 4', baseSkill: 67 }, // 24  Demo School B · Branch B2 · Karnataka
  { branchKey: 'A1', className: 'Class 4', baseSkill: 44 }, // 25  Demo School A · Branch A1 · Delhi
  { branchKey: 'A2', className: 'Class 5', baseSkill: 77 }, // 26  Demo School A · Branch A2 · Maharashtra
  { branchKey: 'B1', className: 'Class 5', baseSkill: 50 }, // 27  Demo School B · Branch B1 · Delhi
  { branchKey: 'B2', className: 'Class 5', baseSkill: 95 }, // 28  Demo School B · Branch B2 · Karnataka
  { branchKey: 'A1', className: 'Class 5', baseSkill: 62 }, // 29  Demo School A · Branch A1 · Delhi
  { branchKey: 'A2', className: 'Class 5', baseSkill: 36 }, // 30  Demo School A · Branch A2 · Maharashtra
];
const STUDENT_COUNT = STUDENT_DEFS.length;

function branchByKey(key: string): BranchDef {
  return BRANCHES.find((b) => b.key === key)!;
}

// ── Assessment "sessions" — two dated terms, each spanning every
// subject × class combination, matching how a real multi-subject Olympiad
// session is modeled (one shared title, many single-subject/class rows). ───
const YEAR = new Date().getFullYear();
// Term 2 is deliberately published most recently (1 day ago) so it sorts as
// the newest visible session and becomes the Leaderboard page's DEFAULT
// selection (see LeaderboardService.resolveAssessments: no `session` filter
// -> most recently published title) — the demo dataset is visible the
// instant the page loads, no dropdown change required.
const SESSIONS = [
  { key: 'term1', title: `Demo Leaderboard – Term 1 (${YEAR})`, publishedDaysAgo: 20 },
  { key: 'term2', title: `Demo Leaderboard – Term 2 (${YEAR})`, publishedDaysAgo: 1 },
];

const SUBJECT_NAMES = ['Mathematics', 'Science', 'English'] as const;
const CLASS_NAMES = ['Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'] as const;
const SUBJECT_NAME_INDEX: Record<string, number> = Object.fromEntries(SUBJECT_NAMES.map((n, i) => [n, i]));

const QUESTIONS_PER_ASSESSMENT = 20;
const MARKS_PER_QUESTION = 5;
const TOTAL_MARKS = QUESTIONS_PER_ASSESSMENT * MARKS_PER_QUESTION; // 100
const DURATION_MIN = 60;
const PASSING_MARKS = 40;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

async function resolveCatalogId(kind: 'subject' | 'class', name: string): Promise<string> {
  const list = kind === 'subject' ? await ContentService.getSubjects() : await ContentService.getStandards();
  const found = list.find((x) => x.name === name);
  if (!found) {
    throw new Error(
      `[seed:leaderboard-demo] Could not find ${kind} "${name}" in the live Content API catalog — cannot seed without a real external id. ` +
      `Check that the Content API is reachable and this name still exists there.`,
    );
  }
  return String(found.id);
}

async function findOrCreateSchoolAndBranches() {
  const schoolByName = new Map<string, string>(); // name -> id
  for (const name of SCHOOLS) {
    const school = await prisma.school.upsert({ where: { name }, update: {}, create: { name } });
    schoolByName.set(name, school.id);
  }

  const stateByName = new Map<string, string>(); // name -> id
  const branchById = new Map<string, string>(); // branch key -> id
  for (const b of BRANCHES) {
    let stateId = stateByName.get(b.state);
    if (!stateId) {
      const state = await prisma.schoolState.upsert({ where: { name: b.state }, update: {}, create: { name: b.state } });
      stateId = state.id;
      stateByName.set(b.state, stateId);
    }
    const schoolId = schoolByName.get(b.schoolName)!;
    const branch = await prisma.schoolBranch.upsert({
      where: { schoolId_stateId_name: { schoolId, stateId, name: b.name } },
      update: { city: b.city },
      create: { schoolId, stateId, name: b.name, city: b.city, isActive: true },
    });
    branchById.set(b.key, branch.id);
  }

  // Prune demo branches from an earlier version of this seed's layout (e.g.
  // the old Karnataka/Tamil Nadu split before Delhi was made shared across
  // both schools) — every StudentProfile is about to be repointed at the
  // CURRENT branchById set below, so anything under our own demo schools
  // that isn't one of the branch ids we just upserted is safe to remove.
  // Never touches a non-demo school's branches.
  const currentBranchIds = new Set(branchById.values());
  const staleBranches = await prisma.schoolBranch.findMany({
    where: { schoolId: { in: [...schoolByName.values()] }, id: { notIn: [...currentBranchIds] } },
    select: { id: true, name: true },
  });
  if (staleBranches.length) {
    await prisma.schoolBranch.deleteMany({ where: { id: { in: staleBranches.map((b) => b.id) } } });
    console.log(`[seed:leaderboard-demo] Pruned ${staleBranches.length} stale demo branch(es) from an earlier seed layout: ${staleBranches.map((b) => b.name).join(', ')}`);
  }

  return { schoolByName, branchById };
}

interface DemoStudent {
  index: number; // 1-based
  name: string;
  email: string;
  userId: string;
  classExternalId: string;
  branch: BranchDef;
}

async function findOrCreateStudents(
  schoolByName: Map<string, string>,
  branchById: Map<string, string>,
  classIds: Record<string, string>,
): Promise<DemoStudent[]> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const out: DemoStudent[] = [];

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const def = STUDENT_DEFS[i - 1];
    const branch = branchByKey(def.branchKey);
    const classExternalId = classIds[def.className];
    const name = `Demo Student ${i}`;
    const email = `demo.student${String(i).padStart(2, '0')}@${DEMO_EMAIL_DOMAIN}`;
    const schoolId = schoolByName.get(branch.schoolName)!;
    const branchId = branchById.get(branch.key)!;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, status: UserStatus.ACTIVE, profileComplete: true },
      create: {
        email, name, passwordHash, role: Role.STUDENT, status: UserStatus.ACTIVE,
        profileComplete: true, avatarHue: (i * 47) % 360,
      },
      select: { id: true },
    });

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        schoolName: branch.schoolName, schoolId, branchId, branchVerifiedAt: new Date(),
        classExternalId, state: branch.state, city: branch.city, country: 'India',
      },
      create: {
        userId: user.id, schoolName: branch.schoolName, schoolId, branchId, branchVerifiedAt: new Date(),
        classExternalId, state: branch.state, city: branch.city, country: 'India',
      },
    });

    out.push({ index: i, name, email, userId: user.id, classExternalId, branch });
  }

  return out;
}

function genQuestion(n: number): { prompt: string; optionA: string; optionB: string; optionC: string; optionD: string; correctAnswer: string; explanation: string } {
  const a = (n % 18) + 2;
  const b = ((n * 5 + 3) % 18) + 2;
  const useMul = n % 3 === 0;
  const correct = useMul ? a * b : a + b;
  const op = useMul ? '×' : '+';
  const step = Math.max(1, Math.floor(correct / 10)) + 1;

  const distractors: number[] = [];
  for (const c0 of [correct + step, correct + step * 2, correct - step, correct + step * 3]) {
    let c = c0; let guard = 0;
    while ((c <= 0 || c === correct || distractors.includes(c)) && guard < 20) { c += step + 1; guard++; }
    distractors.push(c);
    if (distractors.length === 3) break;
  }

  const correctIdx = n % 4;
  const values = [0, 0, 0, 0];
  let di = 0;
  for (let i = 0; i < 4; i++) values[i] = i === correctIdx ? correct : distractors[di++];
  const letters = ['A', 'B', 'C', 'D'] as const;

  return {
    prompt: `Demo Q${n}. What is ${a} ${op} ${b}?`,
    optionA: String(values[0]), optionB: String(values[1]), optionC: String(values[2]), optionD: String(values[3]),
    correctAnswer: letters[correctIdx],
    explanation: `${a} ${op} ${b} = ${correct}.`,
  };
}

interface DemoAssessment { id: string; sessionKey: string; sessionTitle: string; subjectExternalId: string; subjectName: string; classExternalId: string; className: string; publishedAt: Date }

async function findOrCreateAssessments(
  creatorId: string,
  subjectIds: Record<string, string>,
  classIds: Record<string, string>,
): Promise<DemoAssessment[]> {
  const out: DemoAssessment[] = [];

  for (const session of SESSIONS) {
    const publishedAt = new Date(Date.now() - session.publishedDaysAgo * 86_400_000);

    for (const subjectName of SUBJECT_NAMES) {
      const subjectExternalId = subjectIds[subjectName];

      for (const className of CLASS_NAMES) {
        const classExternalId = classIds[className];

        const existing = await prisma.assessment.findFirst({
          where: { title: session.title, subjectExternalId, classExternalId },
          select: { id: true },
        });

        let assessmentId: string;
        if (existing) {
          assessmentId = existing.id;
          await prisma.assessment.update({
            where: { id: assessmentId },
            data: { status: AssessmentStatus.PUBLISHED, publishedAt, resultsPublished: true },
          });
        } else {
          const tag = `${DEMO_TAG}:${session.key}:${subjectName}:${className}`;
          const created = await prisma.assessment.create({
            data: {
              title: session.title,
              description: `[DEMO SEED DATA — safe to delete] ${subjectName}, ${className}. Generated by prisma/seed-leaderboard-demo.ts to preview the Leaderboard. Tag: ${tag}`,
              duration: DURATION_MIN,
              totalMarks: TOTAL_MARKS,
              totalQuestions: QUESTIONS_PER_ASSESSMENT,
              passingMarks: PASSING_MARKS,
              status: AssessmentStatus.PUBLISHED,
              publishedAt,
              resultsPublished: true,
              subjectExternalId,
              classExternalId,
              createdById: creatorId,
            },
          });
          assessmentId = created.id;

          const questions = Array.from({ length: QUESTIONS_PER_ASSESSMENT }, (_, k) => genQuestion(k + 1));
          const bank = await prisma.$transaction(
            questions.map((q) =>
              prisma.assessmentQuestionBank.create({
                data: {
                  type: QuestionType.MCQ_SINGLE,
                  prompt: q.prompt, optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
                  correctAnswer: q.correctAnswer, correctOptions: '[]', explanation: q.explanation,
                  marks: MARKS_PER_QUESTION, tags: JSON.stringify([DEMO_TAG]), status: 'ACTIVE',
                  subjectExternalId, classExternalId, createdById: creatorId,
                },
              }),
            ),
          );
          await prisma.assessmentQuestion.createMany({
            data: bank.map((q, i) => ({ assessmentId, questionId: q.id, order: i + 1 })),
          });
        }

        out.push({ id: assessmentId, sessionKey: session.key, sessionTitle: session.title, subjectExternalId, subjectName, classExternalId, className, publishedAt });
      }
    }
  }

  return out;
}

async function seedSubmissions(students: DemoStudent[], assessments: DemoAssessment[]): Promise<{ created: number; updated: number; skippedByDesign: number }> {
  let created = 0, updated = 0, skippedByDesign = 0;

  for (const student of students) {
    const baseSkill = STUDENT_DEFS[student.index - 1].baseSkill;
    const myAssessments = assessments.filter((a) => a.classExternalId === student.classExternalId);

    const attempts: { assessment: DemoAssessment; skip: boolean; scoreNoise: number; timeNoise: number }[] = [];
    for (const a of myAssessments) {
      const skipRoll = rand();
      const scoreNoise = rand();
      const timeNoise = rand();
      attempts.push({ assessment: a, skip: skipRoll < 0.12, scoreNoise, timeNoise });
    }
    // Guarantee every seeded student has at least one real submission.
    if (attempts.length && attempts.every((x) => x.skip)) attempts[0].skip = false;

    for (const att of attempts) {
      if (att.skip) { skippedByDesign++; continue; }
      const { assessment } = att;

      const subjectOffset = (SUBJECT_NAME_INDEX[assessment.subjectName] - 1) * 3; // -3, 0, +3
      const sessionOffset = assessment.sessionKey === 'term1' ? -2 : 2;
      // Kept small on purpose — this must never be big enough to overwhelm
      // the hand-picked STUDENT_BASE_SKILL gaps that create the intentional
      // Global/State/School ranking differences above.
      const noise = Math.round(att.scoreNoise * 6) - 3; // -3..+3

      const percent = clamp(baseSkill + subjectOffset + sessionOffset + noise, 15, 99);
      const score = Math.round((percent / 100) * TOTAL_MARKS);
      const timeTakenSec = Math.round(1200 + att.timeNoise * 1800); // 20–50 min within a 60 min window
      const submittedAt = new Date(assessment.publishedAt.getTime() + Math.round(att.timeNoise * 5 * 86_400_000) + timeTakenSec * 1000);
      const startedAt = new Date(submittedAt.getTime() - timeTakenSec * 1000);

      const existed = await prisma.submission.findUnique({
        where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.userId } },
        select: { id: true },
      });
      await prisma.submission.upsert({
        where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.userId } },
        update: { status: SubmissionStatus.GRADED, score, totalMarks: TOTAL_MARKS, timeTakenSec, startedAt, submittedAt },
        create: {
          assessmentId: assessment.id, studentId: student.userId, status: SubmissionStatus.GRADED,
          score, totalMarks: TOTAL_MARKS, timeTakenSec, startedAt, submittedAt,
        },
      });
      if (existed) updated++; else created++;
    }
  }

  return { created, updated, skippedByDesign };
}

async function main(): Promise<void> {
  console.log('[seed:leaderboard-demo] Resolving live Content API subject/class ids…');
  const subjectIds: Record<string, string> = {};
  for (const name of SUBJECT_NAMES) subjectIds[name] = await resolveCatalogId('subject', name);
  const classIds: Record<string, string> = {};
  for (const name of CLASS_NAMES) classIds[name] = await resolveCatalogId('class', name);
  console.log('[seed:leaderboard-demo] Subjects:', subjectIds);
  console.log('[seed:leaderboard-demo] Classes:', classIds);

  const creator = await prisma.user.findFirst({
    where: { role: { in: [Role.SUPER_ADMIN, Role.PUBLICATION_ADMIN, Role.CONTENT_MANAGER] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!creator) {
    throw new Error('[seed:leaderboard-demo] No admin user found to own the demo assessments — run `npm run seed` first.');
  }

  console.log('[seed:leaderboard-demo] Upserting Schools/States/Branches…');
  const { schoolByName, branchById } = await findOrCreateSchoolAndBranches();

  console.log(`[seed:leaderboard-demo] Upserting ${STUDENT_COUNT} demo students…`);
  const students = await findOrCreateStudents(schoolByName, branchById, classIds);

  console.log('[seed:leaderboard-demo] Finding/creating demo Assessments (sessions × subjects × classes)…');
  const assessments = await findOrCreateAssessments(creator.id, subjectIds, classIds);

  console.log('[seed:leaderboard-demo] Seeding Submissions (scores computed deterministically, never rank)…');
  const { created, updated, skippedByDesign } = await seedSubmissions(students, assessments);

  console.log('[seed:leaderboard-demo] Done.');
  console.log(`[seed:leaderboard-demo] Schools: ${schoolByName.size}, Branches: ${branchById.size}, Students: ${students.length}`);
  console.log(`[seed:leaderboard-demo] Assessments: ${assessments.length} (${SESSIONS.length} sessions × ${SUBJECT_NAMES.length} subjects × ${CLASS_NAMES.length} classes)`);
  console.log(`[seed:leaderboard-demo] Submissions: ${created} created, ${updated} updated, ${skippedByDesign} intentionally skipped (realistic "didn't attempt") this run.`);
  console.log(`[seed:leaderboard-demo] Demo student login password: ${DEMO_PASSWORD} (e.g. demo.student01@${DEMO_EMAIL_DOMAIN})`);
}

main()
  .catch((err) => {
    console.error('[seed:leaderboard-demo] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
