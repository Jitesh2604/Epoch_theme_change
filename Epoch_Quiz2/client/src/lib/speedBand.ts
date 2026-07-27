/**
 * Single source of truth for the speed bands (average seconds per
 * question) — mirrors performanceBand.ts's exact shape for accuracy, so
 * "consistent thresholds" applies to speed too, and any future feature
 * reads from the same one place.
 */
export interface SpeedBand {
  label: string;
  emoji: string;
  barColorClass: string;
  pillClass: string;
}

export function getSpeedBand(avgSecPerQuestion: number): SpeedBand {
  if (avgSecPerQuestion < 20) {
    return { label: 'Fast', emoji: '🟢', barColorClass: 'bg-emerald-400', pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' };
  }
  if (avgSecPerQuestion <= 35) {
    return { label: 'Good', emoji: '🔵', barColorClass: 'bg-sky-400', pillClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25' };
  }
  if (avgSecPerQuestion <= 50) {
    return { label: 'Average', emoji: '🟡', barColorClass: 'bg-amber-400', pillClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25' };
  }
  if (avgSecPerQuestion <= 70) {
    return { label: 'Slow', emoji: '🟠', barColorClass: 'bg-orange-400', pillClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/25' };
  }
  return { label: 'Very Slow', emoji: '🔴', barColorClass: 'bg-rose-400', pillClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' };
}
