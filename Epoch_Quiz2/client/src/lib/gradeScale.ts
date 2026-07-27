/**
 * Feature 10: Personalized Report Card — overall/subject letter grade.
 *
 * Single source of truth mapping an accuracy percentage to a letter grade,
 * mirroring performanceBand.ts/speedBand.ts's exact "one documented,
 * tunable scale" shape — so the overall grade and every per-subject grade
 * always agree, and the cutoffs live in exactly one place if they ever need
 * adjusting.
 */
export interface GradeInfo {
  letter: string;
  label: string;
  pillClass: string;
}

const GOOD_PILL = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25';
const FAIR_PILL = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25';
const WARN_PILL = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25';
const POOR_PILL = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25';

const GRADE_SCALE: { min: number; letter: string; label: string; pillClass: string }[] = [
  { min: 95, letter: 'A+', label: 'Outstanding',   pillClass: GOOD_PILL },
  { min: 90, letter: 'A',  label: 'Excellent',     pillClass: GOOD_PILL },
  { min: 85, letter: 'B+', label: 'Very Good',     pillClass: FAIR_PILL },
  { min: 75, letter: 'B',  label: 'Good',          pillClass: FAIR_PILL },
  { min: 60, letter: 'C',  label: 'Satisfactory',  pillClass: WARN_PILL },
  { min: 0,  letter: 'D',  label: 'Needs Work',    pillClass: POOR_PILL },
];

export function getGrade(accuracyPercent: number): GradeInfo {
  const band = GRADE_SCALE.find(g => accuracyPercent >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
  return { letter: band.letter, label: band.label, pillClass: band.pillClass };
}
