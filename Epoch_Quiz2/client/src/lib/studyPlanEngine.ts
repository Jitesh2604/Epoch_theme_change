import type { PracticeOverviewData } from '../hooks/useStudentAnalytics';

/**
 * Practice-streak helpers. This file previously also generated the
 * Personalized Study Plan (today's tasks, weekly subject rotation, badges)
 * for AnalyticsPage.tsx's now-removed Personalized Study Plan section; that
 * generation logic has been removed along with it. The date-key/streak
 * utilities below remain — still used by consistencyEngine.ts,
 * studentRowBuilder.ts, and several admin pages.
 */

// ── Date helpers ─────────────────────────────────────────────────────────
// All date-key arithmetic stays in local calendar time throughout (never
// mixes in `new Date(isoString)` UTC parsing for the key itself), so a
// student's "today" always matches their own clock.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local-calendar-day set of every real practice attempt, from Feature 1/6's
 *  already-fetched accuracyTrend.history — zero new query. */
export function practiceDatesFromOverview(overview: PracticeOverviewData): Set<string> {
  return new Set(overview.accuracyTrend.history.map(h => toDateKey(new Date(h.date))));
}

// ── Study Streaks ───────────────────────────────────────────────────────
// engagedDates = real practice-attempt days ∪ locallyEngagedDates, an
// optional second set of "also counts as engaged" days a caller can supply
// (e.g. days a locally-tracked plan was marked complete) — callers with no
// such source just pass an empty set. A day counts once either way — no
// double-counting, no fabricated engagement.

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  practicedToday: boolean;
}

export function computeStreak(practiceDates: Set<string>, locallyEngagedDates: Set<string>, today: Date): StreakInfo {
  const engaged = new Set([...practiceDates, ...locallyEngagedDates]);
  const todayKey = toDateKey(today);
  const practicedToday = engaged.has(todayKey);

  let currentStreak = 0;
  let cursor = practicedToday ? today : addDays(today, -1);
  while (engaged.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const sortedKeys = [...engaged].sort();
  let bestStreak = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of sortedKeys) {
    const isConsecutive = prevKey !== null && toDateKey(addDays(parseDateKey(prevKey), 1)) === key;
    run = isConsecutive ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prevKey = key;
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  return { currentStreak, bestStreak, practicedToday };
}
