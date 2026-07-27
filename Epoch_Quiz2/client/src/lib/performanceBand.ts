/**
 * Single source of truth for the accuracy performance bands — reused
 * everywhere a per-subject (or, later, any other) accuracy percentage needs
 * a label/color, so the thresholds never drift between features.
 */
export interface PerformanceBand {
  label: string;
  emoji: string;
  /** Tailwind background class for a solid accuracy-meter bar. */
  barColorClass: string;
  /** Tailwind classes for a small text pill matching the band. */
  pillClass: string;
}

export function getPerformanceBand(accuracyPercent: number): PerformanceBand {
  if (accuracyPercent >= 90) {
    return { label: 'Excellent', emoji: '🟢', barColorClass: 'bg-emerald-400', pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25' };
  }
  if (accuracyPercent >= 80) {
    return { label: 'Very Good', emoji: '🔵', barColorClass: 'bg-sky-400', pillClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25' };
  }
  if (accuracyPercent >= 70) {
    return { label: 'Good', emoji: '🟡', barColorClass: 'bg-amber-400', pillClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25' };
  }
  if (accuracyPercent >= 50) {
    return { label: 'Needs Improvement', emoji: '🟠', barColorClass: 'bg-orange-400', pillClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/25' };
  }
  return { label: 'Weak', emoji: '🔴', barColorClass: 'bg-rose-400', pillClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25' };
}
