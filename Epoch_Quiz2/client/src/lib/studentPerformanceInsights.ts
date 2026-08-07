import { AT_RISK_INACTIVITY_DAYS } from './atRiskDetection';

/**
 * Feature 6: Platform-wide AI Insights — an ordered rule list over the
 * already-assembled per-student rows (StudentPerformancePage's `rows`), the
 * same architecture as learningInsightsEngine.ts: each rule independently
 * inspects shared, already-derived data and either abstains (returns null)
 * or contributes one line. No rule performs a new fetch or recomputes a
 * per-student number — accuracy, trend, and at-risk status are all reused
 * from what the table already computed for that row.
 *
 * Every threshold is a documented constant so insight sensitivity can be
 * tuned in one place, same convention as atRiskDetection.ts.
 */

/** A class/subject comparison needs at least this many data points to be
 *  worth stating — otherwise one student's score would masquerade as a
 *  class- or subject-wide pattern. */
const MIN_SAMPLE_FOR_COMPARISON = 3;

export interface SubjectAccuracyPoint {
  subjectId: string;
  subjectName: string;
  accuracyPercent: number;
}

export interface PlatformInsightRow {
  id: string;
  name: string;
  className: string | null;
  hasPracticeData: boolean;
  accuracyPercent: number | null;
  practiceTrendDirection: 'improved' | 'declined' | 'consistent' | null;
  practiceTrendDeltaPercent: number | null;
  lastPracticeDate: string | null;
  assessmentAveragePercent: number | null;
  assessmentTrendDirection: 'improved' | 'declined' | 'consistent' | null;
  atRisk: boolean;
  subjects: SubjectAccuracyPoint[];
}

function daysSince(dateIso: string | null, now: number): number | null {
  if (!dateIso) return null;
  return Math.floor((now - new Date(dateIso).getTime()) / 86_400_000);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function ruleInactivity(rows: PlatformInsightRow[], now: number): string | null {
  const inactive = rows.filter(r => {
    const d = daysSince(r.lastPracticeDate, now);
    return d === null || d > AT_RISK_INACTIVITY_DAYS;
  });
  if (!inactive.length) return null;
  return `${inactive.length} student${inactive.length === 1 ? ' has' : 's have'} not practiced in the last ${AT_RISK_INACTIVITY_DAYS} days.`;
}

function ruleTopClassAccuracy(rows: PlatformInsightRow[]): string | null {
  const byClass = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.className || r.accuracyPercent == null) continue;
    const list = byClass.get(r.className) ?? [];
    list.push(r.accuracyPercent);
    byClass.set(r.className, list);
  }
  const eligible = [...byClass.entries()].filter(([, vals]) => vals.length >= MIN_SAMPLE_FOR_COMPARISON);
  if (eligible.length < 2) return null;
  const [topClass, topVals] = eligible.reduce((best, cur) => (mean(cur[1]) > mean(best[1]) ? cur : best));
  return `${topClass} has the highest average accuracy at ${Math.round(mean(topVals))}%.`;
}

function ruleBiggestImprovement(rows: PlatformInsightRow[]): string | null {
  const improving = rows.filter(r => r.practiceTrendDirection === 'improved' && r.practiceTrendDeltaPercent != null);
  if (!improving.length) return null;
  const best = improving.reduce((a, b) => (b.practiceTrendDeltaPercent! > a.practiceTrendDeltaPercent! ? b : a));
  return `${best.name} has improved accuracy by ${Math.round(best.practiceTrendDeltaPercent!)}% since their first attempt.`;
}

function ruleDecliningAtRisk(rows: PlatformInsightRow[]): string | null {
  const declining = rows.filter(r => r.atRisk && (r.practiceTrendDirection === 'declined' || r.assessmentTrendDirection === 'declined'));
  if (declining.length) {
    return `${declining.length} student${declining.length === 1 ? ' is' : 's are'} at risk due to declining performance.`;
  }
  const atRiskCount = rows.filter(r => r.atRisk).length;
  if (!atRiskCount) return null;
  return `${atRiskCount} student${atRiskCount === 1 ? ' is' : 's are'} currently flagged as at-risk.`;
}

function ruleWeakestSubjectByClass(rows: PlatformInsightRow[]): string | null {
  // key = "className::subjectName" -> accuracy samples
  const byClassSubject = new Map<string, { className: string; subjectName: string; values: number[] }>();
  for (const r of rows) {
    if (!r.className) continue;
    for (const s of r.subjects) {
      const key = `${r.className}::${s.subjectName}`;
      const entry = byClassSubject.get(key) ?? { className: r.className, subjectName: s.subjectName, values: [] };
      entry.values.push(s.accuracyPercent);
      byClassSubject.set(key, entry);
    }
  }
  const eligible = [...byClassSubject.values()].filter(e => e.values.length >= MIN_SAMPLE_FOR_COMPARISON);
  if (!eligible.length) return null;
  const weakest = eligible.reduce((worst, cur) => (mean(cur.values) < mean(worst.values) ? cur : worst));
  return `${weakest.subjectName} is the weakest subject across ${weakest.className}, averaging ${Math.round(mean(weakest.values))}% accuracy.`;
}

export function buildPlatformInsights(rows: PlatformInsightRow[], now: Date = new Date()): string[] {
  const nowMs = now.getTime();
  const rules = [
    () => ruleInactivity(rows, nowMs),
    () => ruleTopClassAccuracy(rows),
    () => ruleBiggestImprovement(rows),
    () => ruleDecliningAtRisk(rows),
    () => ruleWeakestSubjectByClass(rows),
  ];
  return rules.map(rule => rule()).filter((line): line is string => line !== null);
}
