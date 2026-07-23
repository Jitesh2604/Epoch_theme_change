/**
 * Assessment test-fixture seed — resets the Assessment module to exactly
 * ONE PUBLISHED, immediately-attemptable assessment with 100 dedicated
 * dummy questions, matching this product's "one assessment per session"
 * design (there is nothing for a student to pick between, so the fixture
 * shouldn't pretend otherwise).
 *
 * Isolation from Practice/Olympiad is structural, not a flag: these
 * questions live in `assessment_question_bank`, a table physically separate
 * from `questions` (Practice/Olympiad's bank) — Practice's queries
 * (quiz.service.ts) only ever read `prisma.question`, so a row created here
 * is unreachable from Practice/Olympiad regardless of any other field.
 *
 * Destructive by design: every run wipes ALL existing Assessment rows (and,
 * via onDelete: Cascade, their submissions/answers/question-links/
 * assignments) plus every AssessmentQuestionBank row tagged
 * 'assessment-seed', then recreates the single fixture from scratch. This
 * is a dev/test-only fixture script (see package.json's `seed:assessments`)
 * — never point it at a database with real assessment data.
 *
 * Usage (run from server/):
 *   npm run seed:assessments
 */
import { PrismaClient, Role, QuestionType, AssessmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ASSESSMENT_TITLE = 'Final Olympiad Assessment';
const DURATION_MINUTES = 180;
const SEED_TAG = 'assessment-seed';

type DummyQuestion = {
  type: QuestionType;
  prompt: string;
  optionA?: string; optionB?: string; optionC?: string; optionD?: string;
  correctAnswer?: string;
  correctBoolean?: boolean;
  marks: number;
  explanation: string;
};

// A small hand-written set of general-knowledge questions, kept for variety
// on top of the generated ones below.
const HAND_WRITTEN_QUESTIONS: DummyQuestion[] = [
  { type: QuestionType.MCQ_SINGLE, prompt: 'What is the capital of France?', optionA: 'Berlin', optionB: 'Madrid', optionC: 'Paris', optionD: 'Rome', correctAnswer: 'C', marks: 1, explanation: 'Paris is the capital and most populous city of France.' },
  { type: QuestionType.MCQ_SINGLE, prompt: 'Which planet is known as the Red Planet?', optionA: 'Earth', optionB: 'Mars', optionC: 'Jupiter', optionD: 'Venus', correctAnswer: 'B', marks: 1, explanation: 'Mars appears red due to iron oxide (rust) on its surface.' },
  { type: QuestionType.MCQ_SINGLE, prompt: 'What is 12 × 8?', optionA: '84', optionB: '96', optionC: '108', optionD: '92', correctAnswer: 'B', marks: 1, explanation: '12 × 8 = 96.' },
  { type: QuestionType.MCQ_SINGLE, prompt: 'Which gas do plants absorb from the atmosphere for photosynthesis?', optionA: 'Oxygen', optionB: 'Nitrogen', optionC: 'Carbon Dioxide', optionD: 'Hydrogen', correctAnswer: 'C', marks: 1, explanation: 'Plants use carbon dioxide, water, and sunlight to produce glucose and oxygen.' },
  { type: QuestionType.MCQ_SINGLE, prompt: "Who wrote the play 'Romeo and Juliet'?", optionA: 'Charles Dickens', optionB: 'William Shakespeare', optionC: 'Mark Twain', optionD: 'Jane Austen', correctAnswer: 'B', marks: 1, explanation: 'Romeo and Juliet was written by William Shakespeare in the early 1590s.' },
  { type: QuestionType.MCQ_SINGLE, prompt: 'What is the chemical symbol for water?', optionA: 'H2O', optionB: 'CO2', optionC: 'O2', optionD: 'NaCl', correctAnswer: 'A', marks: 1, explanation: 'A water molecule is made of two hydrogen atoms and one oxygen atom — H2O.' },
  { type: QuestionType.MCQ_SINGLE, prompt: 'How many continents are there on Earth?', optionA: '5', optionB: '6', optionC: '7', optionD: '8', correctAnswer: 'C', marks: 1, explanation: 'The seven continents are Asia, Africa, North America, South America, Antarctica, Europe, and Australia.' },
  { type: QuestionType.TRUE_FALSE, prompt: 'The sun rises in the west.', correctBoolean: false, marks: 1, explanation: 'The sun rises in the east and sets in the west.' },
  { type: QuestionType.TRUE_FALSE, prompt: 'A triangle has three sides.', correctBoolean: true, marks: 1, explanation: 'By definition, a triangle is a polygon with three sides and three angles.' },
  { type: QuestionType.FILL_IN_BLANK, prompt: 'The largest ocean on Earth is the ______ Ocean.', correctAnswer: 'Pacific', marks: 1, explanation: 'The Pacific Ocean is the largest and deepest of the world’s five oceans.' },
];

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

/** Deterministic arithmetic MCQ — no two generated questions collide, and
 *  every run produces the exact same fixture. */
function genArithmeticMcq(n: number): DummyQuestion {
  const a = (n % 18) + 2;
  const b = ((n * 5 + 3) % 18) + 2;
  const useMul = n % 3 === 0;
  const correct = useMul ? a * b : a + b;
  const op = useMul ? '×' : '+';
  const step = Math.max(1, Math.floor(correct / 10)) + 1;

  const distractors: number[] = [];
  const candidates = [correct + step, correct + step * 2, correct - step, correct + step * 3];
  for (const c0 of candidates) {
    let c = c0;
    let guard = 0;
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
    type: QuestionType.MCQ_SINGLE,
    prompt: `Q${n}. What is ${a} ${op} ${b}?`,
    optionA: String(values[0]), optionB: String(values[1]), optionC: String(values[2]), optionD: String(values[3]),
    correctAnswer: letters[correctIdx],
    marks: 1,
    explanation: `${a} ${op} ${b} = ${correct}.`,
  };
}

/** Deterministic true/false question about a small numeric property. */
function genTrueFalse(n: number): DummyQuestion {
  const num = (n % 50) + 2;
  const kinds = ['even', 'prime', 'perfectSquare'] as const;
  const kind = kinds[n % kinds.length];

  let value: boolean;
  let statement: string;
  if (kind === 'even') {
    value = num % 2 === 0;
    statement = `${num} is an even number.`;
  } else if (kind === 'perfectSquare') {
    const root = Math.round(Math.sqrt(num));
    value = root * root === num;
    statement = `${num} is a perfect square.`;
  } else {
    value = isPrime(num);
    statement = `${num} is a prime number.`;
  }

  return {
    type: QuestionType.TRUE_FALSE,
    prompt: statement,
    correctBoolean: value,
    marks: 1,
    explanation: `This statement is ${value ? 'true' : 'false'}.`,
  };
}

/** Deterministic fill-in-the-blank square question. */
function genFillInBlank(n: number): DummyQuestion {
  const base = (n % 25) + 2;
  return {
    type: QuestionType.FILL_IN_BLANK,
    prompt: `What is ${base} squared? (i.e. ${base} × ${base})`,
    correctAnswer: String(base * base),
    marks: 1,
    explanation: `${base} × ${base} = ${base * base}.`,
  };
}

function buildQuestionSet(): DummyQuestion[] {
  const questions: DummyQuestion[] = [...HAND_WRITTEN_QUESTIONS];
  const remaining = 100 - questions.length; // 90 generated questions
  const trueFalseCount = 20;
  const fillInBlankCount = 10;
  const arithmeticCount = remaining - trueFalseCount - fillInBlankCount; // 60

  for (let i = 1; i <= arithmeticCount; i++) questions.push(genArithmeticMcq(i));
  for (let i = 1; i <= trueFalseCount; i++) questions.push(genTrueFalse(i));
  for (let i = 1; i <= fillInBlankCount; i++) questions.push(genFillInBlank(i));

  return questions;
}

async function resetExistingFixture(): Promise<void> {
  // onDelete: Cascade on Submission/AssessmentQuestion/AssessmentChapter/
  // AssessmentAssignedClass/AssessmentAssignedStudent (all -> Assessment,
  // and Answer -> Submission) means deleting every Assessment row is enough
  // to clean up everything downstream in one step.
  const { count: deletedAssessments } = await prisma.assessment.deleteMany({});
  const { count: deletedQuestions } = await prisma.assessmentQuestionBank.deleteMany({
    where: { tags: { contains: SEED_TAG } },
  });
  if (deletedAssessments || deletedQuestions) {
    console.log(`[seed:assessments] Reset: removed ${deletedAssessments} existing assessment(s) and ${deletedQuestions} seed question(s).`);
  }
}

async function main(): Promise<void> {
  await resetExistingFixture();

  const creator = await prisma.user.findFirst({
    where: { role: { in: [Role.SUPER_ADMIN, Role.PUBLICATION_ADMIN, Role.CONTENT_MANAGER, Role.TEACHER] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!creator) {
    throw new Error('No admin/teacher user found to own the seed assessment — run `npm run seed` (and optionally `npm run seed:e2e`) first.');
  }

  const dummyQuestions = buildQuestionSet();

  const questions = await prisma.$transaction(
    dummyQuestions.map(q =>
      prisma.assessmentQuestionBank.create({
        data: {
          type: q.type,
          prompt: q.prompt,
          optionA: q.optionA ?? null,
          optionB: q.optionB ?? null,
          optionC: q.optionC ?? null,
          optionD: q.optionD ?? null,
          correctAnswer: q.correctAnswer ?? null,
          correctOptions: '[]',
          correctBoolean: q.correctBoolean ?? null,
          explanation: q.explanation,
          marks: q.marks,
          tags: JSON.stringify([SEED_TAG]),
          status: 'ACTIVE',
          createdById: creator.id,
        },
      }),
    ),
  );
  console.log(`[seed:assessments] Created ${questions.length} dedicated assessment-only questions.`);

  const totalMarks = dummyQuestions.reduce((s, q) => s + q.marks, 0);
  const passingMarks = Math.ceil(totalMarks / 2);

  // Assign to every class currently in use by a real student profile, so
  // the assessment is broadly visible/attemptable without hardcoding a
  // guessed class id.
  const classRows = await prisma.studentProfile.findMany({
    where: { classExternalId: { not: null } },
    distinct: ['classExternalId'],
    select: { classExternalId: true },
  });
  const classIds = classRows.map(r => r.classExternalId!).filter(Boolean);

  const e2eStudent = await prisma.user.findUnique({
    where: { email: 'test-student@epochquiz.test' },
    select: { id: true },
  });

  const assessment = await prisma.assessment.create({
    data: {
      title: ASSESSMENT_TITLE,
      description: 'A mixed-subject Olympiad assessment covering multiple subjects in one session — seeded test content for exercising the Assessment flow end to end. Not real coursework.',
      duration: DURATION_MINUTES,
      totalMarks,
      passingMarks,
      status: AssessmentStatus.PUBLISHED,
      publishedAt: new Date(),
      // No subjectExternalId — this Assessment module is deliberately
      // mixed-subject (one exam covering multiple subjects), not scoped to
      // a single one. UI falls back to a "Mixed Subjects" label wherever
      // a subject badge would otherwise render — see AssessmentService.
      createdById: creator.id,
    },
  });

  await prisma.assessmentQuestion.createMany({
    data: questions.map((q, i) => ({ assessmentId: assessment.id, questionId: q.id, order: i + 1 })),
  });

  if (classIds.length) {
    await prisma.assessmentAssignedClass.createMany({
      data: classIds.map(classExternalId => ({ assessmentId: assessment.id, classExternalId })),
      skipDuplicates: true,
    });
  }
  if (e2eStudent) {
    await prisma.assessmentAssignedStudent.createMany({
      data: [{ assessmentId: assessment.id, studentId: e2eStudent.id }],
      skipDuplicates: true,
    });
  }

  console.log(`[seed:assessments] Created "${ASSESSMENT_TITLE}" (${assessment.id}) — ${questions.length} questions, ${totalMarks} marks, ${DURATION_MINUTES} min duration, assigned to ${classIds.length} class(es)${e2eStudent ? ' + test-student@epochquiz.test directly' : ''}.`);
  console.log('[seed:assessments] Done.');
}

main()
  .catch((err) => {
    console.error('[seed:assessments] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
