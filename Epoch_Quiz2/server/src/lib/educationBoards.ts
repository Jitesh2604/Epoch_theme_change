/**
 * Education boards — curated, app-level taxonomy stored on user profiles.
 *
 * This is intentionally a code list (not a Prisma enum) so new boards can be
 * added by editing this one array, with no DB migration. It is distinct from
 * the admin-managed `Board` catalog (which associates books/quizzes/assessments
 * with a publisher board) — this represents the user's own curriculum board.
 *
 * Keep this file in sync with `client/src/lib/educationBoards.ts`.
 */

export const EDUCATION_BOARDS = [
  { code: 'CBSE',        label: 'CBSE' },
  { code: 'ICSE',        label: 'ICSE / CISCE' },
  { code: 'IB',          label: 'IB (International Baccalaureate)' },
  { code: 'CAMBRIDGE',   label: 'Cambridge (IGCSE / A Levels)' },
  { code: 'STATE_BOARD', label: 'State Board' },
] as const;

export type EducationBoardCode = (typeof EDUCATION_BOARDS)[number]['code'];

export const EDUCATION_BOARD_CODES = EDUCATION_BOARDS.map((b) => b.code) as [
  EducationBoardCode,
  ...EducationBoardCode[],
];

export function isEducationBoardCode(value: string): value is EducationBoardCode {
  return (EDUCATION_BOARD_CODES as readonly string[]).includes(value);
}

/**
 * Known state → state-board name overrides (canonical names / aliases).
 * Anything not listed falls back to `"<State> State Board"`, so every state is
 * handled gracefully and new explicit names can be added incrementally.
 */
const STATE_BOARD_OVERRIDES: Record<string, string> = {
  'maharashtra':     'Maharashtra State Board (MSBSHSE)',
  'delhi':           'Delhi State Board',
  'new delhi':       'Delhi State Board',
  'uttar pradesh':   'UP Board (UPMSP)',
  'up':              'UP Board (UPMSP)',
  'madhya pradesh':  'MP Board (MPBSE)',
  'mp':              'MP Board (MPBSE)',
  'bihar':           'Bihar Board (BSEB)',
  'rajasthan':       'Rajasthan Board (RBSE)',
  'gujarat':         'Gujarat State Board (GSEB)',
  'tamil nadu':      'Tamil Nadu State Board',
  'karnataka':       'Karnataka State Board (KSEEB)',
  'kerala':          'Kerala State Board',
  'west bengal':     'West Bengal Board (WBBSE)',
  'andhra pradesh':  'Andhra Pradesh Board (BSEAP)',
  'telangana':       'Telangana State Board (TSBIE)',
  'punjab':          'Punjab School Education Board (PSEB)',
  'haryana':         'Haryana Board (BSEH)',
  'odisha':          'Odisha Board (BSE Odisha)',
  'assam':           'Assam Board (SEBA)',
  'jharkhand':       'Jharkhand Board (JAC)',
  'chhattisgarh':    'Chhattisgarh Board (CGBSE)',
  'uttarakhand':     'Uttarakhand Board (UBSE)',
  'himachal pradesh':'Himachal Pradesh Board (HPBOSE)',
  'goa':             'Goa Board (GBSHSE)',
  'jammu and kashmir':'J&K Board (JKBOSE)',
};

/** Suggest the state-board name for a given address state. Returns '' when unknown/empty. */
export function suggestStateBoard(state?: string | null): string {
  const raw = (state ?? '').trim();
  if (!raw) return '';
  return STATE_BOARD_OVERRIDES[raw.toLowerCase()] ?? `${raw} State Board`;
}
