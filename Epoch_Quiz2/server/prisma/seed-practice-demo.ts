/**
 * Practice Olympiad demo/preview seed — gives a handful of the existing demo
 * students (see seed-leaderboard-demo.ts) real Practice attempt history, by
 * calling the SAME QuizService functions the real app uses (startPractice /
 * submitAttempt), never a second grading implementation.
 *
 * Why this is scoped to Class 5 only: the real Question bank in this DB
 * (inspected before writing this script) has 465 ACTIVE, gradable questions
 * for classExternalId '8' (Class 5) — 456 under Computer, 9 under Science —
 * and only 10 generic (no subject/class) questions everywhere else. Practice
 * question SELECTION is scoped to the student's own class (see quiz.service.
 * ts's classBoardAnd) and no demo class other than Class 5 has any real
 * content to draw from, so seeding "Practice history" for a Class 6/7/8 demo
 * student would mean either almost no real questions (not "meaningful
 * history") or fabricating a whole new question bank the user didn't ask
 * for. Per the "reuse existing questions/subjects/classes, only seed what's
 * missing" instruction, ZERO new Question rows are created here — only
 * QuizAttempt/AttemptAnswer rows (the "a student took this practice" fact),
 * exactly like seed-leaderboard-demo.ts creates zero new Users when it
 * reuses the Content API's real Subject/Class catalog.
 *
 * How grading works — 100% real, not simulated:
 *   1. QuizService.startPractice(studentId, {subjectExternalId, difficulty})
 *      is called for real. It resolves/creates the lazy-singleton Practice
 *      Quiz row, selects real questions scoped to the student's class, and
 *      pre-creates one skipped AttemptAnswer stub per question — same as a
 *      real student clicking "Start Practice".
 *   2. This script decides, per question, correct / wrong / left-skipped —
 *      deterministically, from a fixed-seed PRNG plus a per-(student,
 *      chapter) bias (so some topics are consistently a student's strength
 *      and others consistently a weakness, for the Strong/Weak Topics
 *      feature) — and writes the corresponding selectedOption/
 *      selectedOptions/textAnswer directly onto those AttemptAnswer rows.
 *   3. QuizService.submitAttempt(attemptId, studentId, {timeTakenSec}) is
 *      then called for real — it independently re-reads every AttemptAnswer
 *      row and grades it against the question's actual correctAnswer/
 *      correctOptions/correctBoolean (quiz.service.ts's gradeOne), computing
 *      score/correctAnswers/wrongAnswers/skipped/percentage exactly as it
 *      would for a live student. This script never sets those fields itself.
 *   4. Only AFTER real grading is done does this script directly backdate
 *      QuizAttempt.startTime/endTime (purely timestamps, not grading data)
 *      so attempts land on different past dates — needed for the
 *      Improvement Trend chart, which the real service has no parameter for
 *      (a live student's attempt is always "now").
 *
 * Idempotent, safe to re-run, additive-only:
 *   - Before seeding a (student, subject) pair, this script independently
 *     looks up that subject's Practice Quiz row using the exact same query
 *     getOrCreatePracticeQuiz() uses internally (subjectExternalId +
 *     quizType=PRACTICE + questionSelection=AUTO_RANDOM) — read-only, not a
 *     duplicated grading/business rule — and counts that student's SUBMITTED
 *     attempts on it. If any already exist, the whole subject is skipped
 *     (already seeded); nothing is deleted, reset, or overwritten.
 *   - Never touches any Question/Quiz/QuizAttempt row it didn't create
 *     itself, and never creates a Question row at all.
 *
 * Usage (run from server/, AFTER seed-leaderboard-demo.ts has created the
 * demo students this script targets):
 *   npm run seed:practice-demo
 */
import { PrismaClient, Difficulty, AttemptStatus, QuestionType } from '@prisma/client';
import { QuizService } from '../src/services/quiz.service';
import { ContentService } from '../src/services/content.service';

const prisma = new PrismaClient();

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
const rand = mulberry32(20260818);

function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  return hash;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic per-(student, chapter) strength offset — the same student
 *  is consistently stronger/weaker in the same chapters across every one of
 *  their attempts, which is what makes Strong/Weak Topics show a real signal
 *  instead of noise averaging out to nothing. */
function chapterBias(studentIndex: number, chapterExternalId: string | null): number {
  if (!chapterExternalId) return 0;
  return (stableHash(`${studentIndex}:${chapterExternalId}`) % 31) - 15; // -15..+15
}

// ── Demo students targeted — reuses the Class 5 cohort seed-leaderboard-demo.
// ts already created (Demo Student 26–30), the only demo students whose
// class has real Practice question content. Four performance tiers as
// requested; Student 30 (Weak) intentionally has no Hard attempt — a
// struggling student realistically wouldn't push into it yet. Attempts are
// backdated across the last ~3 weeks with rising targetPct per subject, so
// each student's own Improvement Trend actually trends upward. ────────────
interface AttemptPlan { subjectName: 'Computer' | 'Science'; difficulty: Difficulty; daysAgo: number; targetPct: number }
interface StudentPlan { email: string; studentIndex: number; tier: string; skipRate: number; attempts: AttemptPlan[] }

const PRACTICE_STUDENTS: StudentPlan[] = [
  {
    email: 'demo.student28@epochquiz.demo', studentIndex: 28, tier: 'Excellent', skipRate: 0.03,
    attempts: [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 21, targetPct: 85 },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 10, targetPct: 92 },
      { subjectName: 'Computer', difficulty: Difficulty.HARD,   daysAgo: 2,  targetPct: 96 },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 15, targetPct: 90 },
    ],
  },
  {
    email: 'demo.student26@epochquiz.demo', studentIndex: 26, tier: 'Good', skipRate: 0.05,
    attempts: [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 20, targetPct: 68 },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 11, targetPct: 77 },
      { subjectName: 'Computer', difficulty: Difficulty.HARD,   daysAgo: 3,  targetPct: 84 },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 16, targetPct: 75 },
    ],
  },
  {
    email: 'demo.student29@epochquiz.demo', studentIndex: 29, tier: 'Average', skipRate: 0.07,
    attempts: [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 19, targetPct: 50 },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 9,  targetPct: 60 },
      { subjectName: 'Computer', difficulty: Difficulty.HARD,   daysAgo: 4,  targetPct: 66 },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 14, targetPct: 55 },
    ],
  },
  {
    email: 'demo.student27@epochquiz.demo', studentIndex: 27, tier: 'Average', skipRate: 0.08,
    attempts: [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 18, targetPct: 40 },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 8,  targetPct: 50 },
      { subjectName: 'Computer', difficulty: Difficulty.HARD,   daysAgo: 5,  targetPct: 55 },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 13, targetPct: 45 },
    ],
  },
  {
    email: 'demo.student30@epochquiz.demo', studentIndex: 30, tier: 'Weak', skipRate: 0.12,
    attempts: [
      { subjectName: 'Computer', difficulty: Difficulty.EASY,   daysAgo: 17, targetPct: 25 },
      { subjectName: 'Computer', difficulty: Difficulty.MEDIUM, daysAgo: 7,  targetPct: 33 },
      { subjectName: 'Science',  difficulty: Difficulty.MEDIUM, daysAgo: 12, targetPct: 30 },
    ],
  },
];

const DIFFICULTY_TIME_LIMIT_SEC = 30 * 60; // PracticeConfig — every difficulty is 30 min in this app today

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

/** Builds the (selectedOption/selectedOptions/textAnswer) fields to write
 *  onto an AttemptAnswer row for a deliberately correct or wrong response —
 *  mirrors the exact shapes quiz.service.ts's gradeOne() checks against, so
 *  the real submitAttempt() grades these exactly as intended. */
function buildAnswerFields(q: FullQuestion, wantCorrect: boolean): { selectedOption: string | null; selectedOptions: string; textAnswer: string | null } {
  switch (q.type) {
    case QuestionType.MCQ_SINGLE:
      return { selectedOption: wantCorrect ? q.correctAnswer : wrongLetterFor(q), selectedOptions: '[]', textAnswer: null };
    case QuestionType.MCQ_MULTIPLE: {
      const correct = parseStrArr(q.correctOptions);
      const chosen = wantCorrect ? correct : correct.slice(1); // deliberately incomplete -> graded wrong
      return { selectedOption: null, selectedOptions: JSON.stringify(chosen), textAnswer: null };
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
  // Read-only mirror of quiz.service.ts's private getOrCreatePracticeQuiz()
  // lookup (same where-clause) — used ONLY to check idempotency before
  // calling the real service, never to create or grade anything itself.
  const quiz = await prisma.quiz.findFirst({
    where: { subjectExternalId, quizType: 'PRACTICE', questionSelection: 'AUTO_RANDOM' },
    select: { id: true },
  });
  return quiz?.id ?? null;
}

async function seedOneAttempt(studentId: string, studentIndex: number, subjectExternalId: string, plan: AttemptPlan, skipRate: number): Promise<void> {
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

    const skipRoll = rand();
    if (skipRoll < skipRate) continue; // leave as the pre-created skipped stub

    const bias = chapterBias(studentIndex, q.chapterExternalId);
    const effectivePct = clamp(plan.targetPct + bias, 5, 98);
    const correctRoll = rand() * 100;
    const wantCorrect = correctRoll < effectivePct;

    const fields = buildAnswerFields(q, wantCorrect);
    updates.push(prisma.attemptAnswer.update({
      where: { attemptId_questionId: { attemptId, questionId: qid } },
      data: { ...fields, isSkipped: false, timeSpentSec: Math.round(8 + rand() * 40) },
    }));
  }
  // Batched, not one giant transaction — a handful of failed rows (there
  // shouldn't be any) would still leave the rest correctly answered rather
  // than aborting the whole attempt.
  for (let i = 0; i < updates.length; i += 25) await Promise.all(updates.slice(i, i + 25));

  const timeTakenSec = Math.round(DIFFICULTY_TIME_LIMIT_SEC * (0.45 + rand() * 0.35));
  await QuizService.submitAttempt(attemptId, studentId, { timeTakenSec });

  // Backdate AFTER real grading — only timestamps, never score/correctness.
  const startTime = new Date(Date.now() - plan.daysAgo * 86_400_000);
  const endTime = new Date(startTime.getTime() + timeTakenSec * 1000);
  await prisma.quizAttempt.update({
    where: { id: attemptId },
    data: { startTime, endTime, createdAt: startTime, updatedAt: endTime },
  });
}

async function main(): Promise<void> {
  console.log('[seed:practice-demo] Resolving live Content API subject ids…');
  const subjects = await ContentService.getSubjects();
  const computerId = subjects.find(s => s.name === 'Computer')?.id;
  const scienceId = subjects.find(s => s.name === 'Science')?.id;
  if (!computerId || !scienceId) {
    throw new Error('[seed:practice-demo] Could not find "Computer" and/or "Science" in the live Content API catalog.');
  }
  const subjectIdByName: Record<string, string> = { Computer: String(computerId), Science: String(scienceId) };

  let studentsSeeded = 0, studentsSkipped = 0, attemptsCreated = 0, subjectsSkippedAlreadySeeded = 0;

  for (const plan of PRACTICE_STUDENTS) {
    const user = await prisma.user.findUnique({ where: { email: plan.email }, select: { id: true } });
    if (!user) {
      console.warn(`[seed:practice-demo] ${plan.email} not found — run \`npm run seed:leaderboard-demo\` first. Skipping.`);
      studentsSkipped++;
      continue;
    }

    // Group this student's planned attempts by subject so idempotency is
    // checked once per (student, subject) pair, matching how the Practice
    // Quiz row itself is scoped (one shared Quiz per subject).
    const bySubject = new Map<string, AttemptPlan[]>();
    for (const a of plan.attempts) {
      const list = bySubject.get(a.subjectName) ?? [];
      list.push(a);
      bySubject.set(a.subjectName, list);
    }

    for (const [subjectName, attempts] of bySubject) {
      const subjectExternalId = subjectIdByName[subjectName];
      const existingQuizId = await findExistingPracticeQuizId(subjectExternalId);
      if (existingQuizId) {
        const already = await prisma.quizAttempt.count({
          where: { studentId: user.id, quizId: existingQuizId, status: AttemptStatus.SUBMITTED },
        });
        if (already > 0) {
          console.log(`[seed:practice-demo] ${plan.email} · ${subjectName}: ${already} submitted attempt(s) already exist — skipping (idempotent).`);
          subjectsSkippedAlreadySeeded++;
          continue;
        }
      }

      for (const attempt of attempts) {
        await seedOneAttempt(user.id, plan.studentIndex, subjectExternalId, attempt, plan.skipRate);
        attemptsCreated++;
      }
      console.log(`[seed:practice-demo] ${plan.email} (${plan.tier}) · ${subjectName}: seeded ${attempts.length} attempt(s).`);
    }
    studentsSeeded++;
  }

  console.log('[seed:practice-demo] Done.');
  console.log(`[seed:practice-demo] Students processed: ${studentsSeeded} seeded/verified, ${studentsSkipped} missing (run seed:leaderboard-demo first).`);
  console.log(`[seed:practice-demo] Attempts created this run: ${attemptsCreated}. Subject/student pairs already seeded (skipped): ${subjectsSkippedAlreadySeeded}.`);
}

main()
  .catch((err) => {
    console.error('[seed:practice-demo] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
