/**
 * Excel question import.
 *
 * Sheet:    first sheet of the workbook (any name).
 * Headers:  case-insensitive; spaces/underscores ignored. Recognised:
 *
 *   type             MCQ_SINGLE | TRUE_FALSE | DESCRIPTIVE (also: MCQ, TF, DESC)
 *   prompt           Question text
 *   option1..option4 MCQ options (min 2 non-empty, max 4)
 *   correctOption    MCQ: letter A..D  OR  1-based index
 *   correctBoolean   TF:  TRUE/FALSE/T/F/YES/NO/Y/N/1/0
 *   modelAnswer      DESC: sample answer (optional)
 *   marks            Integer ≥ 1     (default 1)
 *   difficulty       EASY | MEDIUM | HARD  (default MEDIUM)
 *   tags             Comma-separated
 *   subject          Subject name or slug (must already exist)
 */
import * as XLSX from 'xlsx';
import { Difficulty, QuestionType } from '../lib/enums';
import { prisma } from '../lib/prisma';
import { toJson } from '../utils/json';
import { ApiError } from '../utils/ApiError';
import { isAdminRole } from '../utils/roles';
import { recalcTotalMarks } from './question.service';
import { ContentMeta } from './content.service';
import type { Actor } from './assessment.service';

function slugifySubject(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'subject';
}

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdQuestions: number;
  attachedToAssessment: number;
  dryRun: boolean;
  errors: RowError[];
}

const MAX_ROWS = 1000;

function normKey(s: string): string {
  return String(s).toLowerCase().replace(/[\s_-]+/g, '').trim();
}

function normStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function parseType(raw: string): QuestionType | null {
  const v = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (v === 'mcq' || v === 'mcqsingle' || v === 'multiplechoice') return QuestionType.MCQ_SINGLE;
  if (v === 'truefalse' || v === 'tf' || v === 'boolean') return QuestionType.TRUE_FALSE;
  if (v === 'descriptive' || v === 'desc' || v === 'subjective') return QuestionType.DESCRIPTIVE;
  return null;
}

function parseDifficulty(raw: string): Difficulty | null {
  const v = raw.toUpperCase().trim();
  if (v === '')                             return Difficulty.MEDIUM;
  if (v === 'EASY')                         return Difficulty.EASY;
  if (v === 'MEDIUM' || v === 'MED')        return Difficulty.MEDIUM;
  if (v === 'HARD')                         return Difficulty.HARD;
  return null;
}

function parseBoolean(raw: string): boolean | null {
  const v = raw.toLowerCase().trim();
  if (['true', 't', 'yes', 'y', '1'].includes(v))  return true;
  if (['false', 'f', 'no',  'n', '0'].includes(v)) return false;
  return null;
}

const LETTER_MAP: Record<string, string> = { A: 'A', B: 'B', C: 'C', D: 'D' };

/** Accept 'A','b',… or '1','2',… → letter A..D. */
function parseCorrectLetter(raw: string, optCount: number): string | null {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if (/^[A-D]$/.test(v)) {
    const idx = v.charCodeAt(0) - 'A'.charCodeAt(0);
    return idx < optCount ? LETTER_MAP[v] ?? null : null;
  }
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  const idx = n - 1;
  if (idx < 0 || idx >= optCount) return null;
  return ['A', 'B', 'C', 'D'][idx] ?? null;
}

function parseTags(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 20);
}

interface RawRow {
  rowNo: number;
  cells: Record<string, string>;
}

export function parseWorkbook(buffer: Buffer): RawRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw ApiError.badRequest('Could not read the file as an Excel workbook');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw ApiError.badRequest('Workbook has no sheets');
  const sheet = workbook.Sheets[sheetName];

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });

  if (grid.length < 2) throw ApiError.badRequest('Workbook contains no data rows');
  if (grid.length - 1 > MAX_ROWS) {
    throw ApiError.badRequest(`Too many rows (max ${MAX_ROWS}, got ${grid.length - 1})`);
  }

  const headers = (grid[0] as unknown[]).map((h) => normKey(String(h ?? '')));
  const rows: RawRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const arr = grid[i] as unknown[];
    const cells: Record<string, string> = {};
    headers.forEach((h, idx) => { cells[h] = normStr(arr[idx]); });
    if (Object.values(cells).every((v) => v === '')) continue;
    rows.push({ rowNo: i + 1, cells });
  }
  return rows;
}

interface QuestionData {
  type: QuestionType;
  prompt: string;
  marks: number;
  difficulty: Difficulty;
  tags: string[];
  subjectId?: string;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  correctAnswer?: string | null;
  correctBoolean?: boolean | null;
  modelAnswer?: string | null;
}

interface ValidatedRow {
  rowNo: number;
  data: QuestionData;
}

interface ValidationResult {
  valid: ValidatedRow[];
  errors: RowError[];
}

function validateRows(
  rows: RawRow[],
  subjectIndex: Map<string, string>,
  actorId: string,
): ValidationResult {
  // actorId is captured into the transaction, not per-row, but kept for signature parity
  void actorId;
  const valid: ValidatedRow[] = [];
  const errors: RowError[] = [];

  for (const r of rows) {
    const c = r.cells;
    const push = (field: string, message: string) => errors.push({ row: r.rowNo, field, message });

    const typeRaw = c['type'] ?? '';
    if (!typeRaw) { push('type', 'type is required'); continue; }
    const type = parseType(typeRaw);
    if (!type) { push('type', `Unknown type "${typeRaw}"`); continue; }

    const prompt = c['prompt'] ?? '';
    if (!prompt) { push('prompt', 'prompt is required'); continue; }
    if (prompt.length > 5000) { push('prompt', 'prompt is too long (max 5000)'); continue; }

    let marks = 1;
    if (c['marks']) {
      const n = Number(c['marks']);
      if (!Number.isInteger(n) || n < 1 || n > 100) { push('marks', 'marks must be an integer 1..100'); continue; }
      marks = n;
    }

    const difficulty = parseDifficulty(c['difficulty'] ?? '');
    if (!difficulty) { push('difficulty', 'difficulty must be EASY / MEDIUM / HARD'); continue; }

    const tags = parseTags(c['tags'] ?? '');

    let subjectId: string | undefined;
    if (c['subject']) {
      const key = c['subject'].toLowerCase().trim();
      const found = subjectIndex.get(key);
      if (!found) { push('subject', `Unknown subject "${c['subject']}"`); continue; }
      subjectId = found;
    }

    const base: QuestionData = { type, prompt, marks, difficulty, tags, subjectId };

    if (type === QuestionType.MCQ_SINGLE) {
      const options = [c['option1'], c['option2'], c['option3'], c['option4']]
        .map((v) => (v ?? '').trim())
        .filter((s) => s.length > 0);
      if (options.length < 2) { push('option1', 'MCQ needs at least 2 non-empty options'); continue; }

      const correctRaw = c['correctoption'] ?? '';
      if (!correctRaw) { push('correctOption', 'correctOption is required for MCQ'); continue; }
      const correctLetter = parseCorrectLetter(correctRaw, options.length);
      if (!correctLetter) {
        push('correctOption', `correctOption "${correctRaw}" must be a letter A..D or a number 1..${options.length}`);
        continue;
      }

      base.optionA       = options[0] ?? null;
      base.optionB       = options[1] ?? null;
      base.optionC       = options[2] ?? null;
      base.optionD       = options[3] ?? null;
      base.correctAnswer = correctLetter;
    }

    if (type === QuestionType.TRUE_FALSE) {
      const raw = c['correctboolean'] ?? '';
      if (!raw) { push('correctBoolean', 'correctBoolean is required for TRUE_FALSE'); continue; }
      const b = parseBoolean(raw);
      if (b === null) { push('correctBoolean', `Could not parse "${raw}" as boolean`); continue; }
      base.correctBoolean = b;
      base.correctAnswer  = b ? 'TRUE' : 'FALSE';
    }

    if (type === QuestionType.DESCRIPTIVE) {
      const ma = c['modelanswer'] ?? '';
      if (ma) {
        if (ma.length > 5000) { push('modelAnswer', 'modelAnswer is too long (max 5000)'); continue; }
        base.modelAnswer = ma;
      }
    }

    valid.push({ rowNo: r.rowNo, data: base });
  }

  return { valid, errors };
}

export const ExcelService = {
  async importQuestions(
    actor: Actor,
    buffer: Buffer,
    opts: { dryRun: boolean; assessmentId?: string; stopOnError: boolean },
  ): Promise<ImportSummary> {
    if (actor.role !== 'TEACHER' && !isAdminRole(actor.role)) {
      throw ApiError.forbidden('Only teachers can upload questions');
    }

    const rows = parseWorkbook(buffer);

    let target: { id: string; status: string } | null = null;
    if (opts.assessmentId) {
      const a = await prisma.assessment.findUnique({
        where: { id: opts.assessmentId }, select: { id: true, status: true, createdById: true },
      });
      if (!a) throw ApiError.badRequest('assessmentId does not exist');
      if (a.status === 'ARCHIVED') throw ApiError.badRequest('Cannot attach to an archived assessment');
      if (!isAdminRole(actor.role) && a.createdById !== actor.id) {
        throw ApiError.forbidden('You can only import into assessments you created');
      }
      target = { id: a.id, status: a.status };
    }

    // Subjects come from the Content API (single source of truth). Build a
    // name/slug -> external-id index so spreadsheet subject names resolve to the
    // external id we store on each question.
    const subjectNames = await ContentMeta.subjects();
    const subjectIndex = new Map<string, string>();
    for (const [extId, name] of subjectNames) {
      subjectIndex.set(name.toLowerCase().trim(), extId);
      subjectIndex.set(slugifySubject(name), extId);
    }

    const { valid, errors } = validateRows(rows, subjectIndex, actor.id);

    if ((opts.stopOnError && errors.length > 0) || opts.dryRun || valid.length === 0) {
      return { totalRows: rows.length, validRows: valid.length, invalidRows: errors.length, createdQuestions: 0, attachedToAssessment: 0, dryRun: opts.dryRun, errors };
    }

    const createdIds: string[] = [];
    await prisma.$transaction(async (txc) => {
      for (const row of valid) {
        const d = row.data;
        const created = await txc.question.create({
          data: {
            type: d.type, prompt: d.prompt, marks: d.marks, difficulty: d.difficulty,
            tags: toJson(d.tags), correctOptions: '[]',
            subjectExternalId: d.subjectId ?? null,
            optionA: d.optionA ?? null, optionB: d.optionB ?? null, optionC: d.optionC ?? null, optionD: d.optionD ?? null,
            correctAnswer: d.correctAnswer ?? null,
            correctBoolean: d.correctBoolean ?? null,
            modelAnswer: d.modelAnswer ?? null,
            createdById: actor.id,
          },
          select: { id: true },
        });
        createdIds.push(created.id);
      }

      if (target) {
        const maxAgg = await txc.assessmentQuestion.aggregate({ where: { assessmentId: target.id }, _max: { order: true } });
        let nextOrder = (maxAgg._max.order ?? 0) + 1;
        await txc.assessmentQuestion.createMany({
          data: createdIds.map(qid => ({ assessmentId: target!.id, questionId: qid, order: nextOrder++ })),
        });
        await recalcTotalMarks(target.id, txc);
      }
    });

    return {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: errors.length,
      createdQuestions: createdIds.length,
      attachedToAssessment: target ? createdIds.length : 0,
      dryRun: false,
      errors,
    };
  },

  buildTemplateBuffer(): Buffer {
    const headers = ['type', 'prompt', 'option1', 'option2', 'option3', 'option4', 'correctOption', 'correctBoolean', 'modelAnswer', 'marks', 'difficulty', 'tags', 'subject'];
    const examples = [
      ['MCQ_SINGLE',   'What is 2 + 2?', '3', '4', '5', '6', 'B', '', '',   1, 'EASY',   'arithmetic', 'Mathematics'],
      ['TRUE_FALSE',   'The Earth is flat.', '', '', '', '', '', 'FALSE', '', 1, 'EASY',   'general',    ''],
      ['DESCRIPTIVE',  "Explain Newton's first law.", '', '', '', '', '', '', 'An object at rest stays at rest unless acted upon by an external force.', 5, 'MEDIUM', 'physics', 'Science'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  },
};
