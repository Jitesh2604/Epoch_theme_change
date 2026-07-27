/**
 * Single source of truth for the 5 accuracy-consistency bands, mirroring
 * performanceBand.ts/speedBand.ts's exact shape. Based on the standard
 * deviation of a student's per-attempt accuracy (percentage points) — the
 * request names these 5 labels but gives no numeric cutoffs (unlike the
 * accuracy/speed bands, which had explicit percentages), so these
 * thresholds are a documented design choice, not a literal spec value:
 * lower spread = more consistent performance attempt-to-attempt.
 */
export interface ConsistencyBand {
  label: string;
  emoji: string;
  barColorClass: string;
  pillClass: string;
}

export function getConsistencyBand(stdDeviation: number): ConsistencyBand {
  if (stdDeviation <= 5) {
    return { label: 'Highly Consistent', emoji: '🟢', barColorClass: 'bg-emerald-400', pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' };
  }
  if (stdDeviation <= 10) {
    return { label: 'Mostly Consistent', emoji: '🔵', barColorClass: 'bg-sky-400', pillClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25' };
  }
  if (stdDeviation <= 20) {
    return { label: 'Moderate', emoji: '🟡', barColorClass: 'bg-amber-400', pillClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25' };
  }
  if (stdDeviation <= 30) {
    return { label: 'Inconsistent', emoji: '🟠', barColorClass: 'bg-orange-400', pillClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/25' };
  }
  return { label: 'Highly Inconsistent', emoji: '🔴', barColorClass: 'bg-rose-400', pillClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' };
}
