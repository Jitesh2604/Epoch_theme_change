/**
 * Education boards — curated taxonomy for the profile board selector.
 * Keep in sync with `server/src/lib/educationBoards.ts`.
 *
 * Add a new board by appending to EDUCATION_BOARDS (and the server copy).
 */

export const EDUCATION_BOARDS = [
  { code: 'CBSE',        label: 'CBSE' },
  { code: 'ICSE',        label: 'ICSE / CISCE' },
  { code: 'IB',          label: 'IB (International Baccalaureate)' },
  { code: 'CAMBRIDGE',   label: 'Cambridge (IGCSE / A Levels)' },
  { code: 'STATE_BOARD', label: 'State Board' },
] as const;

export type EducationBoardCode = (typeof EDUCATION_BOARDS)[number]['code'];

export const EDUCATION_BOARD_OPTIONS = EDUCATION_BOARDS.map((b) => ({
  value: b.code,
  label: b.label,
}));

/**
 * Known state → state-board name overrides. Anything not listed falls back to
 * `"<State> State Board"`, so every state resolves to something sensible.
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
