import { ACTIVE_WINDOW_DAYS, INACTIVE_WINDOW_DAYS, daysSince, type StudentRow, type Trend } from './studentRowBuilder';
import { TREND_DEAD_ZONE } from './accuracyInsights';
import { classifyStudentPerformance, type PerformanceGrade } from './studentPerformanceGrade';
import { evaluateClassRisk } from './classRiskDetection';
import type { ClassPerformanceRow } from '../hooks/useAssessmentAnalytics';

/**
 * Admin Analytics — Feature 8: Class Analytics aggregation.
 *
 * Groups already-computed per-student rows (studentRowBuilder.ts, Feature 6)
 * by class — no per-student number is recomputed here, only summed/averaged.
 * The Assessment side is not re-derived from students at all: it comes
 * straight from Feature 5's own classPerformance rollup (assessmentOverview.
 * service.ts's getOverview()), which is already correctly weighted by real
 * submission counts — averaging per-student assessment percentages instead
 * would silently under-weight students who took more assessments.
 *
 * "Practice Average" / "Assessment Average" below are each domain's raw
 * average score (mirrors the "Avg Score" column Feature 6 already shows per
 * student). "Accuracy" is practice's %-correct metric specifically —
 * Assessment has no separate accuracy concept in this app, only a
 * percentage, which is what "Overall Score" blends against.
 */

const UNASSIGNED_CLASS_ID = '__unassigned__';
const UNASSIGNED_CLASS_NAME = 'No Class Assigned';

function mean(xs: number[]): number { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function round(n: number): number { return Math.round(n * 100) / 100; }

export interface ClassSubjectAggregate {
  subjectId: string;
  subjectName: string;
  avgAccuracy: number;
  avgScore: number;
  /** Number of this class's students who have practiced this subject. */
  participation: number;
  trendDirection: Trend;
}

export interface ClassPracticeAggregate {
  classId: string;
  className: string;
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  atRiskStudentCount: number;
  totalPracticeAttempts: number;
  totalQuestionsSolved: number;
  avgPracticeAccuracy: number | null;
  avgPracticeScore: number | null;
  avgTimePerQuestionSec: number | null;
  practiceTrendDeltaPercent: number | null;
  practiceTrendDirection: Trend | null;
  subjects: ClassSubjectAggregate[];
}

/** One pass over already-computed StudentRow[], grouped by classExternalId
 *  (falling back to an explicit "No Class Assigned" bucket, never dropping
 *  students silently). */
export function groupPracticeByClass(rows: StudentRow[], now: number = Date.now()): Map<string, ClassPracticeAggregate> {
  const byClass = new Map<string, StudentRow[]>();
  for (const r of rows) {
    const key = r.classExternalId ?? UNASSIGNED_CLASS_ID;
    const list = byClass.get(key) ?? [];
    list.push(r);
    byClass.set(key, list);
  }

  const result = new Map<string, ClassPracticeAggregate>();
  for (const [classId, students] of byClass) {
    const className = students[0].className ?? UNASSIGNED_CLASS_NAME;

    const activeStudents = students.filter(s => {
      const d = daysSince(s.lastActiveDate, now);
      return d !== null && d <= ACTIVE_WINDOW_DAYS;
    }).length;
    const inactiveStudents = students.filter(s => {
      const d = daysSince(s.lastActiveDate, now);
      return d === null || d > INACTIVE_WINDOW_DAYS;
    }).length;
    const atRiskStudentCount = students.filter(s => s.atRisk).length;
    const withData = students.filter(s => s.hasData);

    const totalPracticeAttempts = students.reduce((s, r) => s + r.totalAttempts, 0);
    const totalQuestionsSolved = students.reduce((s, r) => s + r.totalQuestionsSolved, 0);
    const avgPracticeAccuracy = withData.length ? round(mean(withData.map(s => s.accuracyPercent))) : null;
    const avgPracticeScore = withData.length ? round(mean(withData.map(s => s.averageScore))) : null;
    const avgTimePerQuestionSec = withData.length ? round(mean(withData.map(s => s.averageTimePerQuestionSec))) : null;

    const withTrend = withData.filter((s): s is StudentRow & { practiceTrendDeltaPercent: number } => s.practiceTrendDeltaPercent !== null);
    const practiceTrendDeltaPercent = withTrend.length ? round(mean(withTrend.map(s => s.practiceTrendDeltaPercent))) : null;
    const practiceTrendDirection: Trend | null = practiceTrendDeltaPercent === null ? null :
      practiceTrendDeltaPercent > TREND_DEAD_ZONE ? 'Improving' :
      practiceTrendDeltaPercent < -TREND_DEAD_ZONE ? 'Declining' : 'Stable';

    // Subject aggregation — mean accuracy/score per subject across this
    // class's students, plus a per-subject improvement trend from the same
    // firstAttemptAccuracy/latestAttemptAccuracy fields Feature 3 already
    // computes per student (no new fetch).
    const bySubject = new Map<string, { subjectName: string; accuracies: number[]; scores: number[]; firsts: number[]; latests: number[] }>();
    for (const s of withData) {
      for (const subj of s.subjects) {
        const entry = bySubject.get(subj.subjectId) ?? { subjectName: subj.subjectName, accuracies: [], scores: [], firsts: [], latests: [] };
        entry.accuracies.push(subj.accuracyPercent);
        entry.scores.push(subj.averageScore);
        entry.firsts.push(subj.firstAttemptAccuracy);
        entry.latests.push(subj.latestAttemptAccuracy);
        bySubject.set(subj.subjectId, entry);
      }
    }
    const subjects: ClassSubjectAggregate[] = [...bySubject.entries()].map(([subjectId, e]) => {
      const deltaMean = mean(e.latests) - mean(e.firsts);
      const trendDirection: Trend = deltaMean > TREND_DEAD_ZONE ? 'Improving' : deltaMean < -TREND_DEAD_ZONE ? 'Declining' : 'Stable';
      return {
        subjectId, subjectName: e.subjectName,
        avgAccuracy: round(mean(e.accuracies)), avgScore: round(mean(e.scores)),
        participation: e.accuracies.length, trendDirection,
      };
    });

    result.set(classId, {
      classId, className,
      totalStudents: students.length, activeStudents, inactiveStudents, atRiskStudentCount,
      totalPracticeAttempts, totalQuestionsSolved,
      avgPracticeAccuracy, avgPracticeScore, avgTimePerQuestionSec,
      practiceTrendDeltaPercent, practiceTrendDirection, subjects,
    });
  }
  return result;
}

export interface ClassAnalyticsRow {
  classId: string;
  className: string;
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  practiceAttempts: number;
  assessmentAttempts: number;
  practiceAverage: number | null;
  assessmentAverage: number | null;
  overallScorePercent: number | null;
  accuracyPercent: number | null;
  avgTimePerQuestionSec: number | null;
  grade: PerformanceGrade | null;
  gradeReasons: string[];
  atRisk: boolean;
  atRiskReasons: string[];
  practiceTrendDirection: Trend | null;
  practiceTrendDeltaPercent: number | null;
  subjects: ClassSubjectAggregate[];
  assessmentParticipationRate: number | null;
  assessmentPassRate: number | null;
  totalAssessments: number;
}

/** Merges one class's practice aggregate with Feature 5's own classPerformance
 *  row for the same class (matched by classId — assessmentOverview.service.
 *  ts's ClassPerformanceRow.classId is the same classExternalId). A class
 *  with assessments but zero enrolled-and-fetched students (or vice versa)
 *  still produces a row — neither side is silently dropped. */
export function buildClassAnalyticsRow(practice: ClassPracticeAggregate, assessment: ClassPerformanceRow | undefined): ClassAnalyticsRow {
  const assessmentAverage = assessment && assessment.completedAttempts > 0 ? assessment.averagePercentage : null;
  const signals = [practice.avgPracticeAccuracy, assessmentAverage].filter((v): v is number => v !== null);
  const overallScorePercent = signals.length ? round(mean(signals)) : null;

  const risk = evaluateClassRisk({
    totalStudents: practice.totalStudents,
    activeStudents: practice.activeStudents,
    inactiveStudents: practice.inactiveStudents,
    avgPracticeAccuracy: practice.avgPracticeAccuracy,
    avgAssessmentPercent: assessmentAverage,
    practiceTrendDirection: practice.practiceTrendDirection,
  });

  const grade = classifyStudentPerformance({
    atRisk: risk.atRisk, atRiskReasons: risk.reasons,
    accuracyPercent: practice.avgPracticeAccuracy, assessmentAveragePercent: assessmentAverage,
  });

  return {
    classId: practice.classId, className: practice.className,
    totalStudents: practice.totalStudents, activeStudents: practice.activeStudents, inactiveStudents: practice.inactiveStudents,
    practiceAttempts: practice.totalPracticeAttempts, assessmentAttempts: assessment?.totalAttempts ?? 0,
    practiceAverage: practice.avgPracticeScore, assessmentAverage: assessment && assessment.completedAttempts > 0 ? assessment.averageScore : null,
    overallScorePercent, accuracyPercent: practice.avgPracticeAccuracy, avgTimePerQuestionSec: practice.avgTimePerQuestionSec,
    grade: grade.grade, gradeReasons: grade.reasons, atRisk: risk.atRisk, atRiskReasons: risk.reasons,
    practiceTrendDirection: practice.practiceTrendDirection, practiceTrendDeltaPercent: practice.practiceTrendDeltaPercent,
    subjects: practice.subjects,
    assessmentParticipationRate: assessment?.participationRate ?? null,
    assessmentPassRate: assessment && assessment.completedAttempts > 0 ? assessment.passRate : null,
    totalAssessments: assessment?.totalAssessments ?? 0,
  };
}

/** Assembles the full per-class array from a student roster (already turned
 *  into StudentRow[] via buildRow) and Feature 5's classPerformance array —
 *  the single entry point ClassAnalyticsPage.tsx calls.
 *
 *  classPerformance's classId===null means "assessment assigned to All
 *  Classes" (assessmentOverview.service.ts) — a DIFFERENT null than a
 *  student having no classExternalId (UNASSIGNED_CLASS_ID below). Merging
 *  those two would misattribute a platform-wide assessment to whichever
 *  students happen to lack a class, so classId===null rows are excluded
 *  from the per-class merge entirely rather than guessed at. */
export function buildClassAnalyticsRows(studentRows: StudentRow[], classPerformance: ClassPerformanceRow[]): ClassAnalyticsRow[] {
  const practiceByClass = groupPracticeByClass(studentRows);
  const assessmentByClass = new Map(
    classPerformance.filter(c => c.classId !== null).map(c => [c.classId as string, c]),
  );

  const classIds = new Set([...practiceByClass.keys(), ...assessmentByClass.keys()]);
  const rows: ClassAnalyticsRow[] = [];
  for (const classId of classIds) {
    const practice = practiceByClass.get(classId) ?? {
      classId, className: assessmentByClass.get(classId)?.className ?? UNASSIGNED_CLASS_NAME,
      totalStudents: 0, activeStudents: 0, inactiveStudents: 0, atRiskStudentCount: 0,
      totalPracticeAttempts: 0, totalQuestionsSolved: 0,
      avgPracticeAccuracy: null, avgPracticeScore: null, avgTimePerQuestionSec: null,
      practiceTrendDeltaPercent: null, practiceTrendDirection: null, subjects: [],
    };
    rows.push(buildClassAnalyticsRow(practice, assessmentByClass.get(classId)));
  }
  return rows;
}
