/**
 * Generic date/math utilities shared by every platform-wide admin analytics
 * feature — Practice Olympiad (Features 3/4, via practiceAnalyticsShared.
 * service.ts) and Assessment (Feature 5, via assessmentAnalyticsShared.
 * service.ts). None of this is scoped to either domain's data model; it's
 * pure rounding + calendar bucketing, extracted here once a second domain
 * needed the identical week/month bucketing so neither duplicates it.
 */

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Week/month/year bucketing — shared by every trend endpoint ────────────

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  x.setDate(x.getDate() - diffToMonday);
  return x;
}

export function weekKey(d: Date): string {
  return startOfWeek(d).toISOString().slice(0, 10);
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function yearKey(d: Date): string {
  return String(d.getFullYear());
}

export function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function addYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}

export const WEEKLY_BUCKETS = 12;
export const MONTHLY_BUCKETS = 6;
export const YEARLY_BUCKETS = 5;

export interface TrendPoint { date: string; count: number }
