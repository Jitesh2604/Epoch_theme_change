/// <reference types="node" />
/**
 * Question import script — validates, deduplicates, and batch-inserts questions.
 *
 * Usage (run from server/):
 *   npx tsx prisma/seed-questions.ts                      # uses ../questions_1_100.json
 *   npx tsx prisma/seed-questions.ts path/to/file.json   # custom path (relative or absolute)
 *
 * Features:
 *   - Supports all 6 question types: MCQ_SINGLE, MCQ_MULTIPLE, TRUE_FALSE,
 *     FILL_IN_BLANK, MATCH_THE_COLUMN, DESCRIPTIVE
 *   - Full per-type field and format validation
 *   - Skips invalid and duplicate records; never aborts the whole import
 *   - Batch inserts (BATCH_SIZE records per transaction) for performance
 *   - Falls back to single-row inserts if a batch transaction fails
 *   - Idempotent: re-running skips prompts already in the DB
 *   - Writes import-report-<timestamp>.json next to the source JSON file
 */

import { PrismaClient, Role, QuestionType, Difficulty } from '@prisma/client';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, isAbsolute, resolve } from 'path';

const prisma = new PrismaClient();
const BATCH_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawQuestion {
  type?: unknown;
  prompt?: unknown;
  promptImageUrl?: unknown;
  optionA?: unknown;
  optionAImageUrl?: unknown;
  optionB?: unknown;
  optionBImageUrl?: unknown;
  optionC?: unknown;
  optionCImageUrl?: unknown;
  optionD?: unknown;
  optionDImageUrl?: unknown;
  correctAnswer?: unknown;
  correctOptions?: unknown;
  correctBoolean?: unknown;
  modelAnswer?: unknown;
  matchPairs?: unknown;
  explanation?: unknown;
  explanationImageUrl?: unknown;
  marks?: unknown;
  negativeMarks?: unknown;
  difficulty?: unknown;
  language?: unknown;
  tags?: unknown;
  [key: string]: unknown;
}

interface ValidationError {
  index: number;
  prompt: string;
  errors: string[];
}

interface InsertError {
  index: number;
  prompt: string;
  error: string;
}

interface ImportReport {
  generatedAt: string;
  sourceFile: string;
  creator: { email: string; role: string };
  totalFound: number;
  validRecords: number;
  invalidRecords: number;
  duplicatesSkipped: number;
  inserted: number;
  insertFailed: number;
  dbVerification: {
    checked: number;
    found: number;
    missing: number;
    missingPrompts: string[];
  };
  totalQuestionsInBank: number;
  validationErrors: ValidationError[];
  insertErrors: InsertError[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TYPES     = new Set(Object.values(QuestionType));
const VALID_DIFFS     = new Set(Object.values(Difficulty));
const VALID_OPTIONS   = new Set(['A', 'B', 'C', 'D']);
const OPTION_KEYS     = { A: 'optionA', B: 'optionB', C: 'optionC', D: 'optionD' } as const;
const URL_RE          = /^https?:\/\/.+/i;

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidUrl(v: unknown): boolean {
  return typeof v === 'string' && URL_RE.test(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function validateQuestion(q: RawQuestion): string[] {
  const errors: string[] = [];

  // type
  if (!q.type || typeof q.type !== 'string') {
    errors.push('Missing or non-string "type"');
  } else if (!VALID_TYPES.has(q.type as QuestionType)) {
    errors.push(`Unknown type "${q.type}"; must be one of: ${[...VALID_TYPES].join(', ')}`);
  }

  // prompt
  if (!q.prompt || typeof q.prompt !== 'string' || !q.prompt.trim()) {
    errors.push('Missing or empty "prompt"');
  }

  // difficulty
  if (q.difficulty !== undefined && q.difficulty !== null) {
    if (!VALID_DIFFS.has(q.difficulty as Difficulty)) {
      errors.push(`Invalid difficulty "${q.difficulty}"; must be EASY | MEDIUM | HARD`);
    }
  }

  // marks
  if (q.marks !== undefined && q.marks !== null) {
    const m = Number(q.marks);
    if (!Number.isInteger(m) || m < 0) {
      errors.push(`"marks" must be a non-negative integer; got ${JSON.stringify(q.marks)}`);
    }
  }

  // negativeMarks
  if (q.negativeMarks !== undefined && q.negativeMarks !== null) {
    const nm = Number(q.negativeMarks);
    if (isNaN(nm) || nm < 0) {
      errors.push(`"negativeMarks" must be a non-negative number; got ${JSON.stringify(q.negativeMarks)}`);
    }
  }

  // tags
  if (q.tags !== undefined && q.tags !== null) {
    if (!Array.isArray(q.tags) || !(q.tags as unknown[]).every((t) => typeof t === 'string')) {
      errors.push('"tags" must be an array of strings');
    }
  }

  // image URL fields
  const imageFields = [
    'promptImageUrl',
    'optionAImageUrl',
    'optionBImageUrl',
    'optionCImageUrl',
    'optionDImageUrl',
    'explanationImageUrl',
  ] as const;
  for (const field of imageFields) {
    const v = q[field];
    if (v !== undefined && v !== null && str(v).trim() !== '' && !isValidUrl(v)) {
      errors.push(`"${field}" is not a valid http/https URL: ${JSON.stringify(v)}`);
    }
  }

  // Bail early if type is unknown — per-type checks cannot run
  if (!q.type || !VALID_TYPES.has(q.type as QuestionType)) return errors;

  const type = q.type as QuestionType;

  // ── Per-type checks ────────────────────────────────────────────────────────

  if (type === QuestionType.MCQ_SINGLE) {
    if (!q.optionA || !q.optionB) {
      errors.push('MCQ_SINGLE requires at least optionA and optionB');
    }
    if (!q.correctAnswer || typeof q.correctAnswer !== 'string') {
      errors.push('MCQ_SINGLE requires "correctAnswer" (A | B | C | D)');
    } else {
      const ca = (q.correctAnswer as string).toUpperCase();
      if (!VALID_OPTIONS.has(ca)) {
        errors.push(`MCQ_SINGLE "correctAnswer" must be A, B, C, or D; got "${q.correctAnswer}"`);
      } else if (!q[OPTION_KEYS[ca as keyof typeof OPTION_KEYS]]) {
        errors.push(`correctAnswer is "${ca}" but option${ca} is missing or empty`);
      }
    }
  }

  if (type === QuestionType.MCQ_MULTIPLE) {
    if (!q.optionA || !q.optionB) {
      errors.push('MCQ_MULTIPLE requires at least optionA and optionB');
    }
    if (!Array.isArray(q.correctOptions)) {
      errors.push('MCQ_MULTIPLE requires "correctOptions" as an array');
    } else {
      const opts = q.correctOptions as unknown[];
      if (opts.length < 2) {
        errors.push(`MCQ_MULTIPLE "correctOptions" must have at least 2 entries; got ${opts.length}`);
      }
      const invalid = opts.filter(
        (o) => typeof o !== 'string' || !VALID_OPTIONS.has((o as string).toUpperCase()),
      );
      if (invalid.length > 0) {
        errors.push(`MCQ_MULTIPLE "correctOptions" contains invalid entries: ${JSON.stringify(invalid)}`);
      }
      // Verify every selected letter has a corresponding option value
      opts.forEach((o) => {
        if (typeof o === 'string' && VALID_OPTIONS.has(o.toUpperCase())) {
          const key = OPTION_KEYS[o.toUpperCase() as keyof typeof OPTION_KEYS];
          if (!q[key]) {
            errors.push(`correctOptions includes "${o.toUpperCase()}" but option${o.toUpperCase()} is missing`);
          }
        }
      });
    }
  }

  if (type === QuestionType.TRUE_FALSE) {
    const hasCA = q.correctAnswer !== undefined && q.correctAnswer !== null;
    const hasCB = q.correctBoolean !== undefined && q.correctBoolean !== null;
    if (!hasCA && !hasCB) {
      errors.push('TRUE_FALSE requires "correctAnswer" ("TRUE"|"FALSE") or "correctBoolean" (boolean)');
    } else if (hasCA) {
      const ca = str(q.correctAnswer).toUpperCase();
      if (ca !== 'TRUE' && ca !== 'FALSE') {
        errors.push(`TRUE_FALSE "correctAnswer" must be "TRUE" or "FALSE"; got "${q.correctAnswer}"`);
      }
    }
  }

  if (type === QuestionType.FILL_IN_BLANK) {
    if (!q.correctAnswer || typeof q.correctAnswer !== 'string' || !str(q.correctAnswer).trim()) {
      errors.push('FILL_IN_BLANK requires a non-empty "correctAnswer"');
    }
  }

  if (type === QuestionType.MATCH_THE_COLUMN) {
    if (!Array.isArray(q.matchPairs)) {
      errors.push('MATCH_THE_COLUMN requires "matchPairs" as an array');
    } else {
      const pairs = q.matchPairs as unknown[];
      if (pairs.length < 2) {
        errors.push(`MATCH_THE_COLUMN "matchPairs" must have at least 2 pairs; got ${pairs.length}`);
      }
      const badPairs = pairs.filter(
        (p) =>
          typeof p !== 'object' ||
          p === null ||
          typeof (p as Record<string, unknown>).left !== 'string' ||
          !str((p as Record<string, unknown>).left).trim() ||
          typeof (p as Record<string, unknown>).right !== 'string' ||
          !str((p as Record<string, unknown>).right).trim(),
      );
      if (badPairs.length > 0) {
        errors.push(
          'MATCH_THE_COLUMN "matchPairs" entries must be objects with non-empty "left" and "right" strings',
        );
      }
    }
  }

  if (type === QuestionType.DESCRIPTIVE) {
    if (
      !q.modelAnswer ||
      typeof q.modelAnswer !== 'string' ||
      !str(q.modelAnswer).trim()
    ) {
      errors.push('DESCRIPTIVE requires a non-empty "modelAnswer" (needed for grading)');
    }
  }

  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDifficulty(d: unknown): Difficulty {
  if (typeof d === 'string' && VALID_DIFFS.has(d as Difficulty)) return d as Difficulty;
  return Difficulty.MEDIUM;
}

function toMarks(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

function toNegMarks(v: unknown): number {
  const n = Number(v);
  return !isNaN(n) && n >= 0 ? n : 0;
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function buildCreateData(q: RawQuestion, creatorId: string) {
  return {
    type: q.type as QuestionType,
    prompt: str(q.prompt).trim(),
    promptImageUrl: toStringOrNull(q.promptImageUrl),

    optionA: toStringOrNull(q.optionA),
    optionAImageUrl: toStringOrNull(q.optionAImageUrl),
    optionB: toStringOrNull(q.optionB),
    optionBImageUrl: toStringOrNull(q.optionBImageUrl),
    optionC: toStringOrNull(q.optionC),
    optionCImageUrl: toStringOrNull(q.optionCImageUrl),
    optionD: toStringOrNull(q.optionD),
    optionDImageUrl: toStringOrNull(q.optionDImageUrl),

    correctAnswer: toStringOrNull(q.correctAnswer),
    // correctOptions/matchPairs/tags are LongText columns storing JSON strings
    // (see prisma/schema.prisma + the runtime toJson() helper in src/utils/json.ts).
    correctOptions: JSON.stringify(
      Array.isArray(q.correctOptions)
        ? (q.correctOptions as string[]).map((o) => o.toUpperCase())
        : [],
    ),
    correctBoolean: typeof q.correctBoolean === 'boolean' ? q.correctBoolean : null,
    modelAnswer: toStringOrNull(q.modelAnswer),

    matchPairs:
      Array.isArray(q.matchPairs) && q.matchPairs.length > 0
        ? JSON.stringify(q.matchPairs)
        : null,

    explanation: toStringOrNull(q.explanation),
    explanationImageUrl: toStringOrNull(q.explanationImageUrl),

    marks: toMarks(q.marks),
    negativeMarks: toNegMarks(q.negativeMarks),
    difficulty: toDifficulty(q.difficulty),
    language: typeof q.language === 'string' && q.language.trim() ? q.language : 'English',
    tags: JSON.stringify(Array.isArray(q.tags) ? q.tags : []),

    createdById: creatorId,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Resolve JSON source path ────────────────────────────────────────────
  const rawArg = process.argv[2];
  let jsonPath: string;
  if (rawArg) {
    jsonPath = isAbsolute(rawArg) ? rawArg : resolve(process.cwd(), rawArg);
  } else {
    jsonPath = resolve(process.cwd(), '..', 'questions_1_100.json');
  }

  // ── 2. Load and parse JSON ────────────────────────────────────────────────
  let raw: unknown[];
  try {
    const content = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Root element must be a JSON array');
    raw = parsed;
  } catch (err) {
    throw new Error(`Cannot load "${jsonPath}": ${(err as Error).message}`);
  }

  // ── 3. Find creator user ──────────────────────────────────────────────────
  const creator = await prisma.user.findFirst({
    where: {
      role: {
        in: [Role.SUPER_ADMIN, Role.PUBLICATION_ADMIN, Role.CONTENT_MANAGER, Role.TEACHER],
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, role: true },
  });

  if (!creator) {
    throw new Error(
      'No admin/teacher user found in the database.\n' +
        'Run `npm run prisma:seed` first to create the default admin user.',
    );
  }

  // ── 4. Print header ───────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Epoch Quiz — Question Import');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Source  : ${jsonPath}`);
  console.log(`  Creator : ${creator.email} (${creator.role})`);
  console.log(`  Records : ${raw.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 5. Validate all records ───────────────────────────────────────────────
  console.log('[ Step 1/4 ] Validating records…\n');

  const validationErrors: ValidationError[] = [];
  const validQueue: Array<{ raw: RawQuestion; index: number }> = [];

  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as RawQuestion;
    const errors = validateQuestion(q);
    if (errors.length > 0) {
      validationErrors.push({
        index: i + 1,
        prompt: str(q.prompt).slice(0, 80) || '(no prompt)',
        errors,
      });
      const short = errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : '');
      console.warn(`  ⚠️  [${String(i + 1).padStart(3)}] INVALID — ${short}`);
    } else {
      validQueue.push({ raw: q, index: i + 1 });
    }
  }

  console.log(`\n  Valid: ${validQueue.length}  |  Invalid: ${validationErrors.length}\n`);

  // ── 6. Deduplicate: check prompts already in DB ───────────────────────────
  console.log('[ Step 2/4 ] Checking for duplicates…\n');

  const existing = await prisma.question.findMany({ select: { prompt: true } });
  const seenSet  = new Set(existing.map((q) => q.prompt.trim()));

  const toInsert: Array<{ raw: RawQuestion; index: number }> = [];
  let duplicatesSkipped = 0;

  for (const item of validQueue) {
    const prompt = str(item.raw.prompt).trim();
    if (seenSet.has(prompt)) {
      duplicatesSkipped++;
      console.log(`  ⏭️  [${String(item.index).padStart(3)}] SKIP (duplicate) — "${prompt.slice(0, 70)}"`);
    } else {
      seenSet.add(prompt); // prevent same prompt appearing twice in the file from being inserted twice
      toInsert.push(item);
    }
  }

  console.log(`\n  To insert: ${toInsert.length}  |  Duplicates skipped: ${duplicatesSkipped}\n`);

  // ── 7. Batch insert ───────────────────────────────────────────────────────
  console.log('[ Step 3/4 ] Inserting questions…\n');

  let inserted = 0;
  const insertErrors: InsertError[] = [];
  const insertedPrompts: string[] = [];

  for (let batchStart = 0; batchStart < toInsert.length; batchStart += BATCH_SIZE) {
    const batch = toInsert.slice(batchStart, batchStart + BATCH_SIZE);
    const batchData = batch.map(({ raw: q }) => buildCreateData(q, creator.id));

    let batchSuccess = false;
    try {
      await prisma.$transaction(batchData.map((data) => prisma.question.create({ data })));
      batchSuccess = true;
    } catch {
      // Batch failed — fall back to individual inserts to isolate the bad row
    }

    if (batchSuccess) {
      for (let j = 0; j < batch.length; j++) {
        inserted++;
        insertedPrompts.push(batchData[j].prompt);
        console.log(`  ✅ [${String(batch[j].index).padStart(3)}] ${batchData[j].prompt.slice(0, 72)}`);
      }
    } else {
      for (let j = 0; j < batch.length; j++) {
        const { index } = batch[j];
        const data = batchData[j];
        try {
          await prisma.question.create({ data });
          inserted++;
          insertedPrompts.push(data.prompt);
          console.log(`  ✅ [${String(index).padStart(3)}] ${data.prompt.slice(0, 72)}`);
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          insertErrors.push({ index, prompt: data.prompt.slice(0, 80), error: msg });
          console.error(`  ❌ [${String(index).padStart(3)}] INSERT FAILED — ${msg.slice(0, 100)}`);
        }
      }
    }
  }

  // ── 8. DB verification ────────────────────────────────────────────────────
  console.log('\n[ Step 4/4 ] Verifying import…\n');

  let dbVerification: ImportReport['dbVerification'] = {
    checked: 0,
    found: 0,
    missing: 0,
    missingPrompts: [],
  };

  if (insertedPrompts.length > 0) {
    // Verify in batches of 100 to avoid oversized IN queries
    const VERIFY_BATCH = 100;
    const verifiedSet = new Set<string>();
    for (let i = 0; i < insertedPrompts.length; i += VERIFY_BATCH) {
      const slice = insertedPrompts.slice(i, i + VERIFY_BATCH);
      const rows = await prisma.question.findMany({
        where: { prompt: { in: slice } },
        select: { prompt: true },
      });
      rows.forEach((r) => verifiedSet.add(r.prompt));
    }

    const missingPrompts = insertedPrompts.filter((p) => !verifiedSet.has(p));
    dbVerification = {
      checked: insertedPrompts.length,
      found: verifiedSet.size,
      missing: missingPrompts.length,
      missingPrompts: missingPrompts.map((p) => p.slice(0, 80)),
    };

    if (dbVerification.missing === 0) {
      console.log(`  All ${dbVerification.checked} inserted questions verified in DB ✅`);
    } else {
      console.warn(`  ⚠️  ${dbVerification.missing} question(s) NOT found in DB after insert:`);
      dbVerification.missingPrompts.forEach((p) => console.warn(`       - "${p}"`));
    }
  } else {
    console.log('  No new questions inserted — skipping verification.');
  }

  const totalInBank = await prisma.question.count();
  console.log(`\n  Total questions in Question Bank : ${totalInBank}`);

  // ── 9. Final report ───────────────────────────────────────────────────────
  const report: ImportReport = {
    generatedAt: new Date().toISOString(),
    sourceFile: jsonPath,
    creator: { email: creator.email, role: creator.role },
    totalFound: raw.length,
    validRecords: validQueue.length,
    invalidRecords: validationErrors.length,
    duplicatesSkipped,
    inserted,
    insertFailed: insertErrors.length,
    dbVerification,
    totalQuestionsInBank: totalInBank,
    validationErrors,
    insertErrors,
  };

  const reportPath = join(dirname(jsonPath), `import-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IMPORT REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total records found      : ${raw.length}
  Valid records            : ${validQueue.length}
  Invalid (validation err) : ${validationErrors.length}
  Duplicates skipped       : ${duplicatesSkipped}
  ─────────────────────────────────────────────────────
  Successfully inserted    : ${inserted}
  Insert failures          : ${insertErrors.length}
  ─────────────────────────────────────────────────────
  DB verification
    Checked  : ${dbVerification.checked}
    Found    : ${dbVerification.found}
    Missing  : ${dbVerification.missing}
  ─────────────────────────────────────────────────────
  Total questions in bank  : ${totalInBank}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (validationErrors.length > 0) {
    console.log('\n  Validation errors:');
    validationErrors.forEach(({ index, prompt, errors }) => {
      console.log(`  [${index}] "${prompt}"`);
      errors.forEach((e) => console.log(`        • ${e}`));
    });
  }

  console.log(`\n  Full report → ${reportPath}\n`);
}

main()
  .catch((err) => {
    console.error('\n❌ Import failed:', (err as Error).message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
