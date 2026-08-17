import type { SchoolStudentRow } from '../../hooks/useSchoolPanel';

/**
 * Client-side aggregation over the real, already-fetched student roster
 * (`GET /school-panel/students`, which already carries averageScore/
 * averagePercentage/assessmentsAttempted per student). No backend endpoint
 * exists for branch/class comparisons, top performers, or "needs attention"
 * — rather than add new backend surface for a presentation feature, these
 * are computed here from data the School Panel already has. Every number
 * traces back to a real student row; nothing here is invented.
 */

export interface GroupStat {
  key: string;
  label: string;
  studentCount: number;
  participatingCount: number;
  participationPercent: number;
  averagePercentage: number;
  topPerformer: { name: string; percent: number } | null;
}

function summarize(key: string, label: string, rows: SchoolStudentRow[]): GroupStat {
  const participating = rows.filter(r => r.assessmentsAttempted > 0);
  const avgPct = participating.length
    ? Math.round((participating.reduce((s, r) => s + r.averagePercentage, 0) / participating.length) * 10) / 10
    : 0;
  const top = participating.length
    ? participating.reduce((a, b) => (b.averagePercentage > a.averagePercentage ? b : a))
    : null;
  return {
    key, label,
    studentCount: rows.length,
    participatingCount: participating.length,
    participationPercent: rows.length ? Math.round((participating.length / rows.length) * 100) : 0,
    averagePercentage: avgPct,
    topPerformer: top ? { name: top.name, percent: top.averagePercentage } : null,
  };
}

export function groupByBranch(students: SchoolStudentRow[]): GroupStat[] {
  const byBranch = new Map<string, SchoolStudentRow[]>();
  for (const s of students) {
    const key = s.branchName ?? 'No branch assigned';
    const list = byBranch.get(key);
    if (list) list.push(s); else byBranch.set(key, [s]);
  }
  return [...byBranch.entries()]
    .map(([name, rows]) => summarize(name, name, rows))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function groupByClass(students: SchoolStudentRow[]): GroupStat[] {
  const byClass = new Map<string, SchoolStudentRow[]>();
  for (const s of students) {
    const key = s.className ?? 'No class assigned';
    const list = byClass.get(key);
    if (list) list.push(s); else byClass.set(key, [s]);
  }
  return [...byClass.entries()]
    .map(([name, rows]) => summarize(name, name, rows))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface RankedStudent {
  id: string; name: string; avatarHue: number;
  className: string | null; branchName: string | null;
  averagePercentage: number; assessmentsAttempted: number;
}

/** Top performers by average percentage — only students with at least one
 *  attempted assessment (an average of 0 attempts is "no data", not "0%"). */
export function topPerformers(students: SchoolStudentRow[], limit = 5): RankedStudent[] {
  return students
    .filter(s => s.assessmentsAttempted > 0)
    .sort((a, b) => b.averagePercentage - a.averagePercentage)
    .slice(0, limit);
}

/** Students needing attention: has attempted at least 2 assessments (enough
 *  to be a real signal, not one bad day) and sits in the bottom-scoring
 *  band. Threshold of 60% mirrors the same "Below 60%" band already used in
 *  the student-facing Practice Analytics distribution (analytics.service.ts
 *  DISTRIBUTION_BANDS), reused here for consistency rather than inventing a
 *  new cutoff. */
export function studentsNeedingAttention(students: SchoolStudentRow[], limit = 5): RankedStudent[] {
  return students
    .filter(s => s.assessmentsAttempted >= 2 && s.averagePercentage < 60)
    .sort((a, b) => a.averagePercentage - b.averagePercentage)
    .slice(0, limit);
}
