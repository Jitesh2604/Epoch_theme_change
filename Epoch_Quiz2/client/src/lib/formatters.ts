/** Shared time/date formatters for the Student Analytics pages — extracted
 *  once two+ files needed the same formatting (Feature 4's derivation
 *  utility and cards, on top of AnalyticsPage.tsx's existing Feature 1-3
 *  usage), rather than duplicating them a third time. */

/** "1h 30m", "12m", "45s" — drops seconds once minutes are shown; used for
 *  headline totals where second-level precision isn't the point. */
export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** "1h 30m 42s", "12m 5s", "45s" — always includes seconds, for the
 *  explicit Hours/Minutes/Seconds breakdowns Feature 4 asks for. */
export function fmtDurationHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** "1m 6s", "23s" — for small, per-question-scale durations. */
export function fmtSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
