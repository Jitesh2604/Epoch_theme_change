/**
 * School Admin end-to-end demo seed — for test-school-admin-flow@example.com.
 *
 * UPDATE (2026-08-18): ensureAdmin()/ensureBranches() were made fully
 * idempotent so this script also works standalone on an environment where
 * none of the below already exists (e.g. a clean production DB) — it no
 * longer hard-requires the account/school to pre-exist. When the account
 * IS already there, the original reuse behavior described below still
 * applies unchanged; when it isn't, a fresh school named "EpochQuiz Demo
 * School (seed:school-admin-demo)" is created instead (never reuses/upserts
 * a real-looking school name like "Delhi Public School" for a fresh create,
 * to guarantee no collision with a genuine school).
 *
 * BEFORE WRITING THIS SCRIPT, the database was inspected directly (see the
 * chat transcript). Key findings that shaped every decision below:
 *
 *   - test-school-admin-flow@example.com ALREADY EXISTS: an ACTIVE
 *     SCHOOL_ADMIN ("Test Principal") with a real SchoolRegistration
 *     pointing at "Delhi Public School" -> branch "DPS Rohini" -> state
 *     Delhi (created 2026-08-14, before this task). This script REUSES that
 *     account and that school exactly as-is — it does NOT create a new
 *     school or re-register the admin elsewhere. Only the password hash is
 *     reset (to the exact credential requested), since the admin cannot
 *     recover whatever the existing hash corresponds to.
 *   - Delhi Public School had only 1 branch (DPS Rohini) and 1 real student
 *     (aryanepochstudio@gmail.com, Class 8, 4 real Practice attempts, 0
 *     Assessment submissions) — a genuine, real (non-demo) account, left
 *     completely untouched by this script; it will simply keep showing up
 *     in the School Admin's roster alongside the new demo students.
 *   - Two more schools already exist with real Assessment content this
 *     script reuses: "Demo Leaderboard – Term 1/Term 2" — 2 sessions x 3
 *     subjects (Mathematics/Science/English) x 5 classes (4-8), each a real
 *     PUBLISHED, resultsPublished Assessment with 20 real linked
 *     AssessmentQuestionBank questions (100 marks). This script does NOT
 *     create new Assessment rows — Assessments are platform-wide (not
 *     school-owned) and these already exactly match what was requested
 *     ("Mathematics/Science/English assessments, real config").
 *   - Real Practice question content (Question table) is concentrated in
 *     Class 5 (classExternalId '8'): 456 Computer + 9 Science questions,
 *     across 9 real chapters. Every other class has ~10 generic questions.
 *     Practice selection is hard-scoped to a student's own class, so only
 *     Class 5 demo students can get genuinely meaningful Practice history —
 *     same constraint discovered and documented in seed-practice-demo.ts.
 *
 * What this script creates (everything else is reused, not duplicated):
 *   1. Two new SchoolBranch rows under Delhi Public School — via the REAL
 *      BranchCodeService.createBranch(actor, ...), the exact same service
 *      the School Admin's own "Create Branch" UI calls — not a raw insert.
 *   2. 24 new demo students (User + StudentProfile), complete profiles
 *      (name/email/phone/dob/address/branch/class), spread across all 3
 *      branches and Class 5/6/7/8, 4 performance tiers (Top/Good/Average/
 *      Weak) present in every branch.
 *   3. Real Submission + Answer rows on the REUSED Demo Leaderboard
 *      assessments for classes 5-8 — real per-question correct/wrong/
 *      skipped answers (not just a Submission.score number), so Answer
 *      Sheet review has real data to show. SubmissionService.start() isn't
 *      used here (it would require assignment rows on assessments this
 *      script doesn't own) — instead this writes Submission/Answer
 *      directly, exactly like seed-leaderboard-demo.ts already does, now
 *      extended to include real per-question Answer rows too.
 *   4. Real Practice attempts (QuizAttempt/AttemptAnswer) for the 6 Class 5
 *      demo students, via the REAL QuizService.startPractice /
 *      submitAttempt — identical pattern to seed-practice-demo.ts.
 *   5. A one-time, idempotent DIFFICULTY enrichment of the shared
 *      'leaderboard-demo-seed' AssessmentQuestionBank rows (they all
 *      defaulted to MEDIUM — no seed script had varied this yet), purely so
 *      SchoolAnalyticsService.difficultyBreakdown has real Easy/Medium/Hard
 *      variety to show. Never touches chapterExternalId: these are
 *      generated arithmetic questions with no real chapter behind them, so
 *      inventing one would be fake data — SchoolAnalyticsService.
 *      topicBreakdown already degrades gracefully (skips un-chaptered rows,
 *      never invents an "Unknown" bucket), so Assessment-based Topic
 *      analytics will legitimately show empty for now; Practice-based Topic
 *      analytics (Computer, real chapters) works fully.
 *
 * Ranks, percentages, badges, and certificates are NEVER written directly —
 * only real Submission/Answer/QuizAttempt rows are created; every ranking/
 * analytics/certificate number is computed live by the existing
 * LeaderboardService / SchoolAnalyticsService / CertificateService exactly
 * as it would for real data.
 *
 * Deterministic + idempotent + additive-only:
 *   - Fixed-seed PRNG (mulberry32), never Math.random().
 *   - Every write is an upsert or a read-check-then-write against a real
 *     unique key or an equivalent count-guard — safe to run any number of
 *     times. Nothing is ever deleted or reset.
 *
 * Usage (run from server/, ideally after seed-leaderboard-demo.ts so the
 * Demo Leaderboard assessments this script reuses already exist):
 *   npm run seed:school-admin-demo
 */
import { PrismaClient, Role, UserStatus, AttemptStatus, Difficulty, QuestionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BranchCodeService } from '../src/services/branchCode.service';
import { QuizService } from '../src/services/quiz.service';
import { ContentService } from '../src/services/content.service';
import type { Actor } from '../src/services/assessment.service';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'test-school-admin-flow@example.com';
const ADMIN_PASSWORD = 'TestPass@123';
const DEMO_EMAIL_DOMAIN = 'epochquiz.demo';
const DEMO_STUDENT_PASSWORD = process.env.SEED_SCHOOL_ADMIN_DEMO_PASSWORD ?? 'Demo@12345';
const DEMO_TAG = 'leaderboard-demo-seed'; // shared tag used by seed-leaderboard-demo.ts's Assessment questions

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
const rand = mulberry32(20260819);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ── Branches ────────────────────────────────────────────────────────────
// DPS Rohini already exists. Two more added, reusing the existing
// Maharashtra/Karnataka SchoolState catalog rows (real DPS chains do have
// multi-city branches, so this doubles as realistic naming).
interface BranchPlan { key: 'ROHINI' | 'PUNE' | 'BANGALORE'; name: string; stateName: string; city: string; address: string }
const BRANCH_PLANS: BranchPlan[] = [
  { key: 'ROHINI',    name: 'DPS Rohini',    stateName: 'Delhi',       city: 'New Delhi', address: 'Sector 24, Rohini' },
  { key: 'PUNE',       name: 'DPS Pune',      stateName: 'Maharashtra', city: 'Pune',       address: 'Baner Road' },
  { key: 'BANGALORE',  name: 'DPS Bangalore', stateName: 'Karnataka',   city: 'Bengaluru',  address: 'Whitefield Main Road' },
];

type Tier = 'TOP' | 'GOOD' | 'AVERAGE' | 'WEAK';
const TIER_TARGET: Record<Tier, number> = { TOP: 94, GOOD: 79, AVERAGE: 59, WEAK: 35 };

interface StudentDef { index: number; branchKey: BranchPlan['key']; className: string; tier: Tier; practice: boolean }

// 24 students: every branch gets all 4 performance tiers, every class
// (5/6/7/8) appears at least once per branch. The 6 Class 5 students (2 per
// branch) are the ones given real Practice Olympiad history — see module
// doc for why only Class 5 has real question content to draw from.
const STUDENTS: StudentDef[] = [
  { index: 1,  branchKey: 'ROHINI',    className: 'Class 5', tier: 'TOP',     practice: true  },
  { index: 2,  branchKey: 'ROHINI',    className: 'Class 5', tier: 'WEAK',    practice: true  },
  { index: 3,  branchKey: 'ROHINI',    className: 'Class 6', tier: 'TOP',     practice: false },
  { index: 4,  branchKey: 'ROHINI',    className: 'Class 6', tier: 'AVERAGE', practice: false },
  { index: 5,  branchKey: 'ROHINI',    className: 'Class 7', tier: 'GOOD',    practice: false },
  { index: 6,  branchKey: 'ROHINI',    className: 'Class 7', tier: 'WEAK',    practice: false },
  { index: 7,  branchKey: 'ROHINI',    className: 'Class 8', tier: 'AVERAGE', practice: false },
  { index: 8,  branchKey: 'ROHINI',    className: 'Class 8', tier: 'GOOD',    practice: false },
  { index: 9,  branchKey: 'PUNE',      className: 'Class 5', tier: 'GOOD',    practice: true  },
  { index: 10, branchKey: 'PUNE',      className: 'Class 5', tier: 'AVERAGE', practice: true  },
  { index: 11, branchKey: 'PUNE',      className: 'Class 6', tier: 'TOP',     practice: false },
  { index: 12, branchKey: 'PUNE',      className: 'Class 6', tier: 'WEAK',    practice: false },
  { index: 13, branchKey: 'PUNE',      className: 'Class 7', tier: 'AVERAGE', practice: false },
  { index: 14, branchKey: 'PUNE',      className: 'Class 7', tier: 'TOP',     practice: false },
  { index: 15, branchKey: 'PUNE',      className: 'Class 8', tier: 'WEAK',    practice: false },
  { index: 16, branchKey: 'PUNE',      className: 'Class 8', tier: 'GOOD',    practice: false },
  { index: 17, branchKey: 'BANGALORE', className: 'Class 5', tier: 'TOP',     practice: true  },
  { index: 18, branchKey: 'BANGALORE', className: 'Class 5', tier: 'GOOD',    practice: true  },
  { index: 19, branchKey: 'BANGALORE', className: 'Class 6', tier: 'AVERAGE', practice: false },
  { index: 20, branchKey: 'BANGALORE', className: 'Class 6', tier: 'WEAK',    practice: false },
  { index: 21, branchKey: 'BANGALORE', className: 'Class 7', tier: 'TOP',     practice: false },
  { index: 22, branchKey: 'BANGALORE', className: 'Class 7', tier: 'AVERAGE', practice: false },
  { index: 23, branchKey: 'BANGALORE', className: 'Class 8', tier: 'GOOD',    practice: false },
  { index: 24, branchKey: 'BANGALORE', className: 'Class 8', tier: 'WEAK',    practice: false },
];

const SUBJECT_NAMES = ['Mathematics', 'Science', 'English'] as const;
const SESSION_TITLES = (year: number) => [`Demo Leaderboard – Term 1 (${year})`, `Demo Leaderboard – Term 2 (${year})`];

// ── Ensure the School Admin account + branches ─────────────────────────────

// A name guaranteed never to collide with a real school someone actually
// registers — used ONLY on the fresh-create path below (never touches or
// upserts by an unqualified real-looking name like "Delhi Public School",
// which could otherwise silently attach demo data to a genuine school).
const FRESH_SCHOOL_NAME = 'EpochQuiz Demo School (seed:school-admin-demo)';
const FRESH_STATE_NAME = 'Delhi';

async function ensureAdmin(): Promise<{ userId: string; schoolId: string; schoolName: string }> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });

  if (existing) {
    // Reuse whatever school this account is already registered to — real
    // pre-existing data or a prior run of this same script. Only the
    // password/status are touched; the school/registration are left as-is.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: Role.SCHOOL_ADMIN, status: UserStatus.ACTIVE, profileComplete: true },
    });
    const reg = await prisma.schoolRegistration.findUnique({ where: { userId: existing.id }, select: { schoolId: true } });
    if (!reg) {
      throw new Error(`[seed:school-admin-demo] User ${ADMIN_EMAIL} exists but has no SchoolRegistration — refusing to guess a school for it. Resolve manually before re-running.`);
    }
    const school = await prisma.school.findUniqueOrThrow({ where: { id: reg.schoolId }, select: { name: true } });
    return { userId: existing.id, schoolId: reg.schoolId, schoolName: school.name };
  }

  // Fresh environment (e.g. an empty production DB) — nothing to reuse, so
  // create a brand-new, unambiguously demo-labeled school + admin from
  // scratch. Additive only: upserts by unique keys, never touches any
  // other School/SchoolState row.
  const state = await prisma.schoolState.upsert({
    where: { name: FRESH_STATE_NAME }, update: {}, create: { name: FRESH_STATE_NAME }, select: { id: true },
  });
  const school = await prisma.school.upsert({
    where: { name: FRESH_SCHOOL_NAME }, update: {}, create: { name: FRESH_SCHOOL_NAME }, select: { id: true, name: true },
  });
  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL, name: 'Test Principal', passwordHash, role: Role.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE, profileComplete: true, avatarHue: 200,
    },
    select: { id: true },
  });
  await prisma.schoolRegistration.create({ data: { userId: user.id, schoolId: school.id, stateId: state.id } });
  console.log(`[seed:school-admin-demo] No existing ${ADMIN_EMAIL} found — created fresh demo school "${school.name}" + admin from scratch.`);
  return { userId: user.id, schoolId: school.id, schoolName: school.name };
}

async function ensureBranches(adminUserId: string, schoolId: string): Promise<Record<BranchPlan['key'], string>> {
  const actor: Actor = { id: adminUserId, role: Role.SCHOOL_ADMIN };
  const byKey: Record<string, string> = {};

  for (const plan of BRANCH_PLANS) {
    const existing = await prisma.schoolBranch.findFirst({
      where: { schoolId, name: plan.name },
      select: { id: true },
    });
    if (existing) { byKey[plan.key] = existing.id; continue; }

    // Upsert rather than require a pre-existing catalog row, so this script
    // never depends on seed:leaderboard-demo having run first — additive
    // only, shared state-catalog rows are never school-specific.
    const state = await prisma.schoolState.upsert({
      where: { name: plan.stateName }, update: {}, create: { name: plan.stateName }, select: { id: true },
    });

    const created = await BranchCodeService.createBranch(actor, {
      name: plan.name, stateId: state.id, city: plan.city, address: plan.address,
    });
    byKey[plan.key] = created.id;
    console.log(`[seed:school-admin-demo] Created branch "${plan.name}" via BranchCodeService.createBranch.`);
  }
  return byKey as Record<BranchPlan['key'], string>;
}

// ── Students ────────────────────────────────────────────────────────────

interface DemoStudent extends StudentDef { userId: string; classExternalId: string; branchId: string }

async function ensureStudents(
  schoolId: string, schoolName: string, branchIds: Record<BranchPlan['key'], string>, classIds: Record<string, string>,
): Promise<DemoStudent[]> {
  const passwordHash = await bcrypt.hash(DEMO_STUDENT_PASSWORD, 10);
  const out: DemoStudent[] = [];

  for (const def of STUDENTS) {
    const branchPlan = BRANCH_PLANS.find(b => b.key === def.branchKey)!;
    const branchId = branchIds[def.branchKey];
    const classExternalId = classIds[def.className];
    const name = `DPS Demo Student ${def.index}`;
    const email = `dps.demo${String(def.index).padStart(2, '0')}@${DEMO_EMAIL_DOMAIN}`;
    const mobileNo = `70000000${String(def.index).padStart(2, '0')}`;
    const classNum = parseInt(def.className.replace('Class ', ''), 10);
    const age = classNum + 5; // Class 5 -> 10yo .. Class 8 -> 13yo, plausible
    const dob = new Date(Date.UTC(2026 - age, def.index % 12, (def.index % 27) + 1));

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, mobileNo, status: UserStatus.ACTIVE, profileComplete: true },
      create: {
        email, name, mobileNo, passwordHash, role: Role.STUDENT, status: UserStatus.ACTIVE,
        profileComplete: true, avatarHue: (def.index * 53) % 360,
      },
      select: { id: true },
    });

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        schoolName, schoolId, branchId, branchVerifiedAt: new Date(),
        classExternalId, state: branchPlan.stateName, city: branchPlan.city, country: 'India',
        dob, address: `${(def.index % 90) + 1}, ${branchPlan.address}`, zip: '110001',
      },
      create: {
        userId: user.id, schoolName, schoolId, branchId, branchVerifiedAt: new Date(),
        classExternalId, state: branchPlan.stateName, city: branchPlan.city, country: 'India',
        dob, address: `${(def.index % 90) + 1}, ${branchPlan.address}`, zip: '110001',
      },
    });

    out.push({ ...def, userId: user.id, classExternalId, branchId });
  }
  return out;
}

// ── Difficulty enrichment for the shared demo Assessment question bank ────

async function enrichAssessmentDifficulty(): Promise<number> {
  const assessments = await prisma.assessment.findMany({
    where: { description: { contains: DEMO_TAG } },
    select: { id: true },
  });
  let updated = 0;
  for (const a of assessments) {
    const links = await prisma.assessmentQuestion.findMany({
      where: { assessmentId: a.id }, orderBy: { order: 'asc' }, select: { order: true, questionId: true },
    });
    for (const link of links) {
      const difficulty = link.order <= 7 ? Difficulty.EASY : link.order <= 14 ? Difficulty.MEDIUM : Difficulty.HARD;
      const q = await prisma.assessmentQuestionBank.findUnique({ where: { id: link.questionId }, select: { difficulty: true } });
      if (q && q.difficulty !== difficulty) {
        await prisma.assessmentQuestionBank.update({ where: { id: link.questionId }, data: { difficulty } });
        updated++;
      }
    }
  }
  return updated;
}

// ── Assessment submissions + real per-question Answers ─────────────────────

interface AssessmentRef { id: string; sessionTitle: string; subjectName: string; classExternalId: string; totalMarks: number }

async function findAssessments(subjectIds: Record<string, string>, classIds: Record<string, string>, year: number): Promise<AssessmentRef[]> {
  const out: AssessmentRef[] = [];
  for (const sessionTitle of SESSION_TITLES(year)) {
    for (const subjectName of SUBJECT_NAMES) {
      for (const className of ['Class 5', 'Class 6', 'Class 7', 'Class 8']) {
        const a = await prisma.assessment.findFirst({
          where: { title: sessionTitle, subjectExternalId: subjectIds[subjectName], classExternalId: classIds[className] },
          select: { id: true, totalMarks: true },
        });
        if (a) out.push({ id: a.id, sessionTitle, subjectName, classExternalId: classIds[className], totalMarks: a.totalMarks });
      }
    }
  }
  return out;
}

// Hash-keyed (not sequential) randomness for this function specifically:
// deciding whether/how a given (student, assessment[, question]) is
// answered must be a pure function of stable ids, independent of loop
// position or what else already exists in the DB. A sequential PRNG (as
// used elsewhere in this file, safe there because those loops never
// short-circuit mid-sequence based on DB state) would desync on a partial
// rerun — e.g. some assessments already having a Submission and others not
// shifts every later rand() call by a different amount than run 1, so the
// same "should this be skipped" roll can flip between runs. Hash-keying
// guarantees the exact same decision every time for the exact same pair.
function hashFloat(key: string): number {
  return stableHash(key) / 4294967295;
}

async function seedAssessmentResults(students: DemoStudent[], assessments: AssessmentRef[]): Promise<{ submissions: number; answers: number; skipped: number }> {
  let submissions = 0, answers = 0, skipped = 0;

  for (const student of students) {
    const myAssessments = assessments.filter(a => a.classExternalId === student.classExternalId);
    const target = TIER_TARGET[student.tier];

    for (const assessment of myAssessments) {
      const existing = await prisma.submission.findUnique({
        where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.userId } },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const pairKey = `${student.userId}:${assessment.id}`;
      if (hashFloat(`${pairKey}:attempt-skip`) < 0.08) { skipped++; continue; } // didn't attempt every session/subject — realistic

      const links = await prisma.assessmentQuestion.findMany({
        where: { assessmentId: assessment.id }, orderBy: { order: 'asc' },
        select: { questionId: true, question: { select: { correctAnswer: true, marks: true } } },
      });

      const noise = Math.round(hashFloat(`${pairKey}:noise`) * 8) - 4; // -4..+3
      const effectivePct = clamp(target + noise, 10, 99);

      let score = 0;
      const perQuestion = links.map(link => {
        const qKey = `${pairKey}:${link.questionId}`;
        const letters = ['A', 'B', 'C', 'D'];
        const correctIdx = letters.indexOf(link.question.correctAnswer ?? 'A');
        const skipQ = hashFloat(`${qKey}:skip`) < 0.04;
        if (skipQ) return { questionId: link.questionId, selectedOption: null as number | null, isCorrect: false, marksAwarded: 0 };
        const wantCorrect = hashFloat(`${qKey}:correct`) * 100 < effectivePct;
        const selectedOption = wantCorrect ? correctIdx : (correctIdx + 1) % 4;
        const marksAwarded = wantCorrect ? link.question.marks : 0;
        return { questionId: link.questionId, selectedOption, isCorrect: wantCorrect, marksAwarded };
      });
      for (const p of perQuestion) score += p.marksAwarded;

      const submittedAt = new Date(Date.now() - Math.round(hashFloat(`${pairKey}:date`) * 25 + 2) * 86_400_000);
      const timeTakenSec = Math.round(1800 * (0.5 + hashFloat(`${pairKey}:time`) * 0.35));

      const submission = await prisma.submission.create({
        data: {
          assessmentId: assessment.id, studentId: student.userId, status: 'GRADED',
          score, totalMarks: assessment.totalMarks, timeTakenSec, submittedAt, startedAt: new Date(submittedAt.getTime() - timeTakenSec * 1000),
        },
        select: { id: true },
      });
      submissions++;

      await prisma.answer.createMany({
        data: perQuestion.map(p => ({
          submissionId: submission.id, questionId: p.questionId,
          selectedOption: p.selectedOption, selectedOptions: '[]',
          isCorrect: p.isCorrect, marksAwarded: p.marksAwarded,
        })),
      });
      answers += perQuestion.length;
    }
  }

  return { submissions, answers, skipped };
}

// ── Practice Olympiad (Class 5 students only — see module doc) ────────────

interface PracticeAttemptPlan { subjectName: 'Computer' | 'Science'; difficulty: Difficulty; daysAgo: number; targetPct: number }

function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  return hash;
}
function chapterBias(studentIndex: number, chapterExternalId: string | null): number {
  if (!chapterExternalId) return 0;
  return (stableHash(`school-admin:${studentIndex}:${chapterExternalId}`) % 31) - 15;
}

interface FullQuestion {
  id: string; type: QuestionType;
  optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  correctAnswer: string | null; correctOptions: string; correctBoolean: boolean | null;
  chapterExternalId: string | null;
}
function parseStrArr(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}
function wrongLetterFor(q: FullQuestion): string {
  const letters = (['A', 'B', 'C', 'D'] as const).filter(l => q[`option${l}` as 'optionA'] != null);
  return letters.find(l => l !== q.correctAnswer) ?? letters[0] ?? 'A';
}
function buildAnswerFields(q: FullQuestion, wantCorrect: boolean): { selectedOption: string | null; selectedOptions: string; textAnswer: string | null } {
  switch (q.type) {
    case QuestionType.MCQ_SINGLE:
      return { selectedOption: wantCorrect ? q.correctAnswer : wrongLetterFor(q), selectedOptions: '[]', textAnswer: null };
    case QuestionType.MCQ_MULTIPLE: {
      const correct = parseStrArr(q.correctOptions);
      return { selectedOption: null, selectedOptions: JSON.stringify(wantCorrect ? correct : correct.slice(1)), textAnswer: null };
    }
    case QuestionType.TRUE_FALSE: {
      const correctBool = q.correctBoolean ?? false;
      const value = wantCorrect ? correctBool : !correctBool;
      return { selectedOption: value ? 'TRUE' : 'FALSE', selectedOptions: '[]', textAnswer: null };
    }
    case QuestionType.FILL_IN_BLANK:
      return { selectedOption: null, selectedOptions: '[]', textAnswer: wantCorrect ? (q.correctAnswer ?? '') : '__seed-incorrect__' };
    default:
      return { selectedOption: null, selectedOptions: '[]', textAnswer: null };
  }
}

async function findExistingPracticeQuizId(subjectExternalId: string): Promise<string | null> {
  const quiz = await prisma.quiz.findFirst({
    where: { subjectExternalId, quizType: 'PRACTICE', questionSelection: 'AUTO_RANDOM' }, select: { id: true },
  });
  return quiz?.id ?? null;
}

async function seedOnePracticeAttempt(studentId: string, studentIndex: number, subjectExternalId: string, plan: PracticeAttemptPlan, skipRate: number): Promise<void> {
  const started = await QuizService.startPractice(studentId, { subjectExternalId, difficulty: plan.difficulty });
  const attemptId = started.attemptId;
  const questionIds = started.questions.map(q => q.id);

  const fullQuestions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, type: true, optionA: true, optionB: true, optionC: true, optionD: true, correctAnswer: true, correctOptions: true, correctBoolean: true, chapterExternalId: true },
  });
  const byId = new Map(fullQuestions.map(q => [q.id, q as FullQuestion]));

  const updates: Promise<unknown>[] = [];
  for (const qid of questionIds) {
    const q = byId.get(qid);
    if (!q) continue;
    if (rand() < skipRate) continue;

    const bias = chapterBias(studentIndex, q.chapterExternalId);
    const effectivePct = clamp(plan.targetPct + bias, 5, 98);
    const wantCorrect = rand() * 100 < effectivePct;

    const fields = buildAnswerFields(q, wantCorrect);
    updates.push(prisma.attemptAnswer.update({
      where: { attemptId_questionId: { attemptId, questionId: qid } },
      data: { ...fields, isSkipped: false, timeSpentSec: Math.round(8 + rand() * 40) },
    }));
  }
  for (let i = 0; i < updates.length; i += 25) await Promise.all(updates.slice(i, i + 25));

  const timeTakenSec = Math.round(1800 * (0.45 + rand() * 0.35));
  await QuizService.submitAttempt(attemptId, studentId, { timeTakenSec });

  const startTime = new Date(Date.now() - plan.daysAgo * 86_400_000);
  const endTime = new Date(startTime.getTime() + timeTakenSec * 1000);
  await prisma.quizAttempt.update({ where: { id: attemptId }, data: { startTime, endTime, createdAt: startTime, updatedAt: endTime } });
}

async function seedPractice(students: DemoStudent[], subjectIds: Record<string, string>): Promise<{ created: number; skippedAlready: number; failed: number }> {
  let created = 0, skippedAlready = 0, failed = 0;
  const practiceStudents = students.filter(s => s.practice);

  for (const student of practiceStudents) {
    const target = TIER_TARGET[student.tier];
    const plans: PracticeAttemptPlan[] = [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 20, targetPct: clamp(target - 10, 15, 98) },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 9,  targetPct: clamp(target, 15, 98) },
      { subjectName: 'Computer', difficulty: Difficulty.HARD,   daysAgo: 3,  targetPct: clamp(target + 6, 15, 98) },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 14, targetPct: clamp(target, 15, 98) },
    ];
    const bySubject = new Map<string, PracticeAttemptPlan[]>();
    for (const p of plans) { const l = bySubject.get(p.subjectName) ?? []; l.push(p); bySubject.set(p.subjectName, l); }

    for (const [subjectName, subjectPlans] of bySubject) {
      const subjectExternalId = subjectIds[subjectName];
      const existingQuizId = await findExistingPracticeQuizId(subjectExternalId);
      if (existingQuizId) {
        const already = await prisma.quizAttempt.count({ where: { studentId: student.userId, quizId: existingQuizId, status: AttemptStatus.SUBMITTED } });
        if (already > 0) { skippedAlready++; continue; }
      }
      for (const p of subjectPlans) {
        // Optional enrichment only — the account/school/branch/student rows
        // this script exists to produce are already committed by this
        // point, so a missing real question bank for this subject/class
        // (environment-specific content gap, not a bug) must never abort
        // the whole run.
        try {
          await seedOnePracticeAttempt(student.userId, student.index, subjectExternalId, p, student.tier === 'WEAK' ? 0.1 : 0.05);
          created++;
        } catch (err) {
          failed++;
          console.warn(`[seed:school-admin-demo] Practice attempt skipped for ${student.userId} (${subjectName}): ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
  return { created, skippedAlready, failed };
}

// ── main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[seed:school-admin-demo] Resolving live Content API subject/class ids…');
  const subjects = await ContentService.getSubjects();
  const standards = await ContentService.getStandards();
  const subjectIds: Record<string, string> = {};
  for (const name of [...SUBJECT_NAMES, 'Computer']) {
    const found = subjects.find(s => s.name === name);
    if (!found) throw new Error(`[seed:school-admin-demo] Subject "${name}" not found in Content API.`);
    subjectIds[name] = String(found.id);
  }
  const classIds: Record<string, string> = {};
  for (const name of ['Class 5', 'Class 6', 'Class 7', 'Class 8']) {
    const found = standards.find(s => s.name === name);
    if (!found) throw new Error(`[seed:school-admin-demo] Class "${name}" not found in Content API.`);
    classIds[name] = String(found.id);
  }

  console.log('[seed:school-admin-demo] Ensuring School Admin account + school…');
  const { userId: adminUserId, schoolId, schoolName } = await ensureAdmin();
  console.log(`[seed:school-admin-demo] Admin ready: ${ADMIN_EMAIL} -> ${schoolName}`);

  console.log('[seed:school-admin-demo] Ensuring 3 branches…');
  const branchIds = await ensureBranches(adminUserId, schoolId);

  console.log('[seed:school-admin-demo] Ensuring 24 demo students…');
  const students = await ensureStudents(schoolId, schoolName, branchIds, classIds);

  console.log('[seed:school-admin-demo] Enriching shared Assessment question-bank difficulty (idempotent)…');
  const difficultyUpdated = await enrichAssessmentDifficulty();

  const year = new Date().getFullYear();
  console.log('[seed:school-admin-demo] Finding reusable Demo Leaderboard assessments…');
  const assessments = await findAssessments(subjectIds, classIds, year);
  if (!assessments.length) {
    console.warn('[seed:school-admin-demo] No "Demo Leaderboard" assessments found — run `npm run seed:leaderboard-demo` first for Assessment/Leaderboard/Certificate data to exist. Continuing with students-only.');
  }

  console.log('[seed:school-admin-demo] Seeding Assessment Submissions + real Answers…');
  const { submissions, answers, skipped: subsSkipped } = await seedAssessmentResults(students, assessments);

  console.log('[seed:school-admin-demo] Seeding Practice Olympiad attempts for Class 5 students…');
  const { created: practiceCreated, skippedAlready: practiceSkipped, failed: practiceFailed } = await seedPractice(students, subjectIds);

  console.log('[seed:school-admin-demo] Done.');
  console.log(`[seed:school-admin-demo] School: ${schoolName} | Branches: ${Object.keys(branchIds).length} | Students: ${students.length}`);
  console.log(`[seed:school-admin-demo] Assessment question-bank difficulty rows updated: ${difficultyUpdated}`);
  console.log(`[seed:school-admin-demo] Submissions created: ${submissions} (${answers} Answer rows), ${subsSkipped} already-existing/skipped this run.`);
  console.log(`[seed:school-admin-demo] Practice attempts created: ${practiceCreated}, ${practiceSkipped} subject/student pairs already seeded, ${practiceFailed} skipped due to missing question content.`);
  console.log(`[seed:school-admin-demo] Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('[seed:school-admin-demo] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
