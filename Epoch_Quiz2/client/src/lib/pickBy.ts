/**
 * Generic argmax/argmin-with-tie-break — the same pattern hand-written in
 * strengthWeaknessInsights.ts (Feature 3) and speedInsights.ts (Feature 4)
 * for their subject picks. Extracted here now that a third caller
 * (questionTypeInsights.ts, Feature 5) needs the identical shape — Features
 * 3/4's own files are left exactly as shipped, only new code uses this.
 */
export function pickBy<T>(
  items: T[],
  score: (item: T) => number,
  direction: 'max' | 'min',
  tieBreak: (a: T, b: T) => T,
): T {
  return items.reduce((best, item) => {
    const bestScore = score(best), itemScore = score(item);
    if (itemScore === bestScore) return tieBreak(best, item);
    if (direction === 'max') return itemScore > bestScore ? item : best;
    return itemScore < bestScore ? item : best;
  });
}
