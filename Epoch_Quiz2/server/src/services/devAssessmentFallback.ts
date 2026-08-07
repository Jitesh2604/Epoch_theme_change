import { prisma } from '../lib/prisma';
import { isDev } from '../config';
import { AssessmentStatus, Difficulty, QuestionType, Role, UserStatus } from '../lib/enums';
import { ContentService, ContentMeta } from './content.service';
import { logger } from '../utils/logger';

/**
 * Development-only Assessment fallback — see AssessmentService.list, the
 * only caller. When a student's real, PUBLISHED, assigned-to-them assessment
 * list is empty, this creates 2-3 realistic dummy assessments per subject as
 * genuine DB rows with genuine gradable questions, so the whole Assessment
 * flow (list -> overview -> take -> result) is testable without an admin
 * hand-building fixtures first. Every write here is gated by `isDev` and
 * cannot run in production regardless of caller.
 *
 * Identified (and kept idempotent) via a fixed marker in `description`
 * rather than a schema change — `Assessment` has no tags/flag field, and a
 * migration felt disproportionate for a dev convenience. The marker text is
 * deliberately readable (shown to the student on the overview page in dev),
 * so it's obvious at a glance that a given assessment is sample data, not a
 * real one from their school.
 */
export const DEV_FALLBACK_DESCRIPTION_MARKER = 'Auto-generated sample assessment for local development and testing.';

/**
 * Same generated content as the auto fallback above, but for
 * `createVisibleDummyAssessments` — explicitly requested dev sample data
 * that's meant to sit *alongside* real assessments, not be hidden by
 * AssessmentService.list's "hide once real data exists" rule (which only
 * matches DEV_FALLBACK_DESCRIPTION_MARKER). Still clearly labeled as sample
 * data in the description text a student would read.
 */
export const DEV_VISIBLE_SAMPLE_DESCRIPTION_MARKER = 'Sample assessment created for local development testing.';

const FALLBACK_SUBJECTS_MAX = 3;
const QUESTIONS_PER_ASSESSMENT = 100;
const DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD] as const;
const DURATIONS_MIN = [30, 45] as const;

// ── Deterministic question generation ───────────────────────────────────
// Same approach as prisma/seed-assessments.ts's fixture generator (kept in
// sync deliberately) — no two questions collide, every run with the same
// seed offset produces the same content.

interface DummyQuestion {
  type: keyof typeof QuestionType;
  prompt: string;
  optionA?: string; optionB?: string; optionC?: string; optionD?: string;
  correctAnswer?: string;
  correctBoolean?: boolean;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

// Modulus 89 is prime and coprime to 3 (the useMul cycle below), so the
// combined (a, b, useMul) period is lcm(89, 3) = 267 — comfortably above the
// largest arithmetic slice any single assessment ever needs (60, at 100
// questions/assessment). The old modulus of 18 only gave a period of 18,
// which silently repeated the exact same "a op b" prompt ~3x once assessments
// grew past ~18 arithmetic questions — a genuine duplicate-question bug this
// widening fixes at the source, not just cosmetically.
const ARITHMETIC_MOD = 89;

function genArithmeticMcq(n: number): DummyQuestion {
  const a = (n % ARITHMETIC_MOD) + 2;
  const b = (((n * 7) + 11) % ARITHMETIC_MOD) + 2;
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
    type: 'MCQ_SINGLE',
    prompt: `What is ${a} ${op} ${b}?`,
    optionA: String(values[0]), optionB: String(values[1]), optionC: String(values[2]), optionD: String(values[3]),
    correctAnswer: letters[correctIdx],
  };
}

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

  return { type: 'TRUE_FALSE', prompt: statement, correctBoolean: value };
}

function genFillInBlank(n: number): DummyQuestion {
  const base = (n % 25) + 2;
  return {
    type: 'FILL_IN_BLANK',
    prompt: `What is ${base} squared? (i.e. ${base} × ${base})`,
    correctAnswer: String(base * base),
  };
}

/** `seedOffset` keeps different assessments' generated prompts from
 *  repeating identically. */
function buildQuestionSet(seedOffset: number, count: number): DummyQuestion[] {
  const trueFalseCount = Math.round(count * 0.25);
  const fillInBlankCount = Math.round(count * 0.15);
  const arithmeticCount = count - trueFalseCount - fillInBlankCount;

  const questions: DummyQuestion[] = [];
  for (let i = 1; i <= arithmeticCount; i++) questions.push(genArithmeticMcq(seedOffset + i));
  for (let i = 1; i <= trueFalseCount; i++) questions.push(genTrueFalse(seedOffset + i));
  for (let i = 1; i <= fillInBlankCount; i++) questions.push(genFillInBlank(seedOffset + i));
  return questions;
}

// ── Subject resolution ───────────────────────────────────────────────────

interface FallbackSubject { id: string | null; name: string; assessmentCount: number }

const GENERIC_SUBJECT_NAMES = ['Mathematics', 'Science', 'English'];

/** Real, currently-configured catalog subjects when available (so dummy
 *  assessments are properly subject-linked, like a real one would be);
 *  falls back to generic subject labels (subjectExternalId: null, same as
 *  any other unlinked/"Mixed Subjects" assessment) if the content catalog
 *  isn't configured or returns nothing — this fallback must still work in a
 *  dev environment with no catalog wired up at all. */
async function resolveFallbackSubjects(): Promise<FallbackSubject[]> {
  const toGeneric = () => GENERIC_SUBJECT_NAMES.map((name, i) => ({ id: null, name, assessmentCount: i === 0 ? 3 : 2 }));

  if (!ContentService.isConfigured()) return toGeneric();

  try {
    const subjectMap = await ContentMeta.subjects();
    const real = [...subjectMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, FALLBACK_SUBJECTS_MAX);
    if (!real.length) return toGeneric();
    return real.map((s, i) => ({ id: s.id, name: s.name, assessmentCount: i === 0 ? 3 : 2 }));
  } catch (err) {
    logger.warn(`[dev-assessment-fallback] Could not resolve catalog subjects, using generic names: ${(err as Error).message}`);
    return toGeneric();
  }
}

// ── Shared creation core ─────────────────────────────────────────────────

/**
 * Does the actual writing: resolves subjects, generates questions, creates
 * Assessment + AssessmentQuestionBank + AssessmentQuestion + direct
 * assignment rows. Used by both entry points below — the only difference
 * between them is which description marker gets stamped on (which in turn
 * decides whether AssessmentService.list's "hide once real data exists"
 * rule ever applies to the result).
 */
async function createDummyAssessmentSet(studentId: string, descriptionMarker: string): Promise<number> {
  const creator = await prisma.user.findFirst({
    where: { role: { in: [Role.SUPER_ADMIN, Role.PUBLICATION_ADMIN, Role.CONTENT_MANAGER] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!creator) {
    logger.warn('[dev-assessment-fallback] No admin user found to own dummy assessments — skipping (run `npm run seed` first).');
    return 0;
  }

  const subjects = await resolveFallbackSubjects();
  let created = 0;

  for (const subject of subjects) {
    for (let n = 1; n <= subject.assessmentCount; n++) {
      const difficulty = DIFFICULTIES[created % DIFFICULTIES.length];
      const duration = DURATIONS_MIN[created % DURATIONS_MIN.length];
      const dummyQuestions = buildQuestionSet(created * 100, QUESTIONS_PER_ASSESSMENT);

      const questions = await prisma.$transaction(
        dummyQuestions.map(q => prisma.assessmentQuestionBank.create({
          data: {
            type: QuestionType[q.type],
            prompt: q.prompt,
            optionA: q.optionA ?? null,
            optionB: q.optionB ?? null,
            optionC: q.optionC ?? null,
            optionD: q.optionD ?? null,
            correctAnswer: q.correctAnswer ?? null,
            correctOptions: '[]',
            correctBoolean: q.correctBoolean ?? null,
            explanation: 'Sample explanation — dummy question generated for local development testing.',
            marks: 1,
            difficulty,
            tags: JSON.stringify(['dev-fallback']),
            status: UserStatus.ACTIVE,
            createdById: creator.id,
          },
        })),
      );

      const totalMarks = questions.length;
      const assessment = await prisma.assessment.create({
        data: {
          title: `${subject.name} Assessment ${n}`,
          description: descriptionMarker,
          duration,
          totalMarks,
          passingMarks: Math.ceil(totalMarks / 2),
          status: AssessmentStatus.PUBLISHED,
          publishedAt: new Date(),
          // Same default as a real assessment (assessment.service.ts's
          // create()) — results stay hidden from the student until an admin
          // explicitly publishes them via the normal publish/unpublish
          // endpoints. Dummy assessments must go through that same gate,
          // not skip it, so the Result screen's "submitted, awaiting
          // publish" state is actually exercised like it would be for real
          // data instead of being bypassed.
          resultsPublished: false,
          subjectExternalId: subject.id,
          createdById: creator.id,
        },
      });

      await prisma.assessmentQuestion.createMany({
        data: questions.map((q, i) => ({ assessmentId: assessment.id, questionId: q.id, order: i + 1 })),
      });
      await prisma.assessmentAssignedStudent.create({
        data: { assessmentId: assessment.id, studentId },
      });

      created++;
    }
  }

  return created;
}

// ── Entry points ─────────────────────────────────────────────────────────

/**
 * Idempotent per student: does nothing if this student already has dummy
 * assessments (identified by the marker + direct assignment), or if `isDev`
 * is false. Callers are expected to have already confirmed the student has
 * no *real* assessments visible to them — this function doesn't re-check
 * that itself, so it stays a pure "make some sample data" operation.
 */
export async function ensureDevFallbackAssessments(studentId: string): Promise<void> {
  if (!isDev) return;

  const already = await prisma.assessment.count({
    where: {
      description: { startsWith: DEV_FALLBACK_DESCRIPTION_MARKER },
      assignedStudents: { some: { studentId } },
    },
  });
  if (already > 0) return;

  const created = await createDummyAssessmentSet(studentId, DEV_FALLBACK_DESCRIPTION_MARKER);
  if (created > 0) {
    logger.info(`[dev-assessment-fallback] Created ${created} dummy assessment(s) (${QUESTIONS_PER_ASSESSMENT} questions each) for student ${studentId}.`);
  }
}

/**
 * Explicit, on-demand sample data — unlike ensureDevFallbackAssessments,
 * this is never triggered automatically and is NOT hidden by
 * AssessmentService.list once the student has real assessments (it uses a
 * different description marker, one the list-exclusion filter doesn't match
 * on), because the whole point of calling this directly is to have sample
 * data sit alongside whatever real data already exists. Still idempotent
 * per student, via its own marker.
 */
export async function createVisibleDummyAssessments(studentId: string): Promise<number> {
  if (!isDev) return 0;

  const already = await prisma.assessment.count({
    where: {
      description: { startsWith: DEV_VISIBLE_SAMPLE_DESCRIPTION_MARKER },
      assignedStudents: { some: { studentId } },
    },
  });
  if (already > 0) {
    logger.info(`[dev-assessment-fallback] Student ${studentId} already has visible sample assessments — skipping.`);
    return 0;
  }

  const created = await createDummyAssessmentSet(studentId, DEV_VISIBLE_SAMPLE_DESCRIPTION_MARKER);
  logger.info(`[dev-assessment-fallback] Created ${created} visible sample assessment(s) (${QUESTIONS_PER_ASSESSMENT} questions each) for student ${studentId}.`);
  return created;
}
