import type { PracticeOverviewData, SubjectStat } from '../hooks/useStudentAnalytics';
import {
  type LearningInsights, type DerivedAnalytics,
  MIN_ATTEMPTS_FOR_INSIGHTS, LOW_ACCURACY_THRESHOLD,
} from './learningInsightsEngine';
import type { StudyPlan } from './studyPlanEngine';
import { getGrade, type GradeInfo } from './gradeScale';
import { computeSubjectConfidence, type ConfidenceBreakdownEntry } from './confidenceScore';
import { getSpeedBand } from './speedBand';
import { getQuestionTypeLabel } from './questionTypeLabel';
import { fmtSeconds } from './formatters';

/**
 * Feature 10: Personalized Report Card.
 *
 * Pure data assembly — every number here is read from Feature 1/2's already
 * -fetched PracticeOverviewData/SubjectStat[], or from Feature 8's
 * LearningInsights (which itself already reused Features 3-7's derived
 * analytics) and Feature 9's StudyPlan. Nothing in this file re-queries or
 * recomputes an analytic Features 1-9 already produced — the only new work
 * is turning those numbers into report-card shape: grades, highlights,
 * period summaries, and one teacher-style remark.
 *
 * `buildReportCard` returns a single plain, serializable ReportCardData
 * object with no React/UI concerns mixed in — deliberately, so a future PDF
 * export can consume the exact same object the on-screen report renders
 * from, without re-deriving anything or refactoring this file.
 */

export const MIN_ATTEMPTS_FOR_REPORT_CARD = MIN_ATTEMPTS_FOR_INSIGHTS;

function round(n: number): number { return Math.round(n * 100) / 100; }

// ── Student Performance Summary ───────────────────────────────────────────

export interface StudentSummary {
  overallGrade: GradeInfo;
  overallAccuracy: number;
  confidenceScore: number;
  confidenceBand: string;
  totalPracticeOlympiads: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  averageTimePerQuestionSec: number;
  /** No ranking system exists yet (leaderboard is explicitly out of scope
   *  for Practice Olympiad analytics) — always "Coming Soon" rather than a
   *  fabricated number, per the spec's own fallback instruction. */
  overallRank: string;
}

// ── Subject Report Card ────────────────────────────────────────────────────

export type PerformanceTrend = 'Improving' | 'Stable' | 'Declining';

export interface SubjectReportCardEntry {
  subjectId: string;
  subjectName: string;
  grade: GradeInfo;
  accuracyPercent: number;
  questionsAttempted: number;
  averageTimePerQuestionSec: number;
  confidence: number;
  trend: PerformanceTrend;
}

// Same dead-zone the overall accuracy trend uses (accuracyInsights.ts) —
// kept as a local, documented constant since that one isn't exported and a
// single subject's first-vs-latest delta is a distinct (smaller-sample)
// signal from the overall one anyway.
const TREND_DEAD_ZONE = 3;

function subjectTrend(subject: SubjectStat): PerformanceTrend {
  if (subject.totalAttempts < 2) return 'Stable'; // not enough history to call it either way
  const delta = subject.latestAttemptAccuracy - subject.firstAttemptAccuracy;
  if (delta > TREND_DEAD_ZONE) return 'Improving';
  if (delta < -TREND_DEAD_ZONE) return 'Declining';
  return 'Stable';
}

function buildSubjectReportCards(subjects: SubjectStat[]): SubjectReportCardEntry[] {
  return subjects
    .map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      grade: getGrade(s.accuracyPercent),
      accuracyPercent: s.accuracyPercent,
      questionsAttempted: s.totalQuestionsAttempted,
      averageTimePerQuestionSec: s.averageTimePerQuestionSec,
      confidence: computeSubjectConfidence(s),
      trend: subjectTrend(s),
    }))
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent);
}

// ── Strongest / Needs-Improvement Highlights ──────────────────────────────

export interface SubjectHighlight {
  subjectName: string;
  accuracyPercent: number;
  confidence: number;
  reason: string;
}

const STRONG_ACCURACY_THRESHOLD = 85;

function buildStrongestSubjects(cards: SubjectReportCardEntry[]): SubjectHighlight[] {
  return cards
    .filter(c => c.accuracyPercent >= STRONG_ACCURACY_THRESHOLD)
    .slice(0, 3)
    .map(c => ({
      subjectName: c.subjectName,
      accuracyPercent: c.accuracyPercent,
      confidence: c.confidence,
      reason: c.trend !== 'Declining'
        ? 'Strong consistency across recent Practice Olympiads.'
        : 'Consistently high accuracy in this subject.',
    }));
}

function buildSubjectsNeedingImprovement(cards: SubjectReportCardEntry[], subjects: SubjectStat[], overallSkippedPercent: number): SubjectHighlight[] {
  return cards
    .filter(c => c.accuracyPercent < LOW_ACCURACY_THRESHOLD)
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent)
    .slice(0, 3)
    .map(c => {
      const raw = subjects.find(s => s.subjectId === c.subjectId)!;
      const subjectSkippedPercent = raw.totalQuestionsAttempted > 0
        ? round((raw.totalSkipped / raw.totalQuestionsAttempted) * 100)
        : 0;

      let reason: string;
      if (subjectSkippedPercent > overallSkippedPercent && subjectSkippedPercent > 15) {
        reason = 'Skipped-question rate remains higher than average.';
      } else if (c.trend === 'Declining') {
        reason = 'Performance has been declining in recent attempts.';
      } else if (['Slow', 'Very Slow'].includes(getSpeedBand(c.averageTimePerQuestionSec).label)) {
        reason = 'Spending more time per question without matching accuracy gains.';
      } else {
        reason = 'Accuracy remains below target — needs more focused practice.';
      }

      return { subjectName: c.subjectName, accuracyPercent: c.accuracyPercent, confidence: c.confidence, reason };
    });
}

// ── Performance Highlights ────────────────────────────────────────────────
// Every line reuses a pick Features 3/4/5/9 already computed — nothing here
// re-scans subjects/questionTypes itself.

function buildPerformanceHighlights(d: DerivedAnalytics, plan: StudyPlan | null): string[] {
  const highlights: string[] = [];

  if (d.subjectInsights) {
    highlights.push(`Highest Accuracy Subject: ${d.subjectInsights.strongest.subjectName} (${d.subjectInsights.strongest.accuracyPercent}%)`);
    highlights.push(`Most Practiced Subject: ${d.subjectInsights.mostPracticed.subjectName} (${d.subjectInsights.mostPracticed.totalAttempts} attempts)`);
    if (d.subjectInsights.biggestImprovement) {
      const { subject, improvementPercent } = d.subjectInsights.biggestImprovement;
      highlights.push(`Most Improved Subject: ${subject.subjectName} (+${improvementPercent}%)`);
    }
  }

  if (d.speedInsights) {
    highlights.push(`Fastest Subject: ${d.speedInsights.fastestSubject.subjectName} (${fmtSeconds(d.speedInsights.fastestSubject.averageTimePerQuestionSec)}/question)`);
  }

  if (d.questionTypeInsights) {
    const best = d.questionTypeInsights.bestType;
    highlights.push(`Best Question Type: ${getQuestionTypeLabel(best.questionType)} (${best.accuracyPercent}%)`);
  }

  if (plan && plan.streak.bestStreak >= 2) {
    highlights.push(`Longest Practice Streak: ${plan.streak.bestStreak} day${plan.streak.bestStreak === 1 ? '' : 's'}`);
  }

  return highlights;
}

// ── Weekly & Monthly Progress ─────────────────────────────────────────────
// Both windows are sliced from Feature 6's accuracyTrend.history — the one
// analytic already fetched at per-attempt date granularity — rather than a
// new query for "attempts this week/month". Questions-solved and
// study-time are estimated from the student's own overall
// questions-per-attempt / time-per-attempt averages (Feature 1), the same
// estimation approach Feature 9's task planner already uses.

export interface PeriodSummary {
  practiceSessions: number;
  accuracyPercent: number;
  /** Real accuracy movement between this window and the one before it —
   *  the fully weighted confidence score can't be recomputed per-window
   *  without per-week subject/type breakdowns Features 2/5 don't expose,
   *  so this reuses the one signal available at per-attempt granularity as
   *  an honest, clearly-scoped stand-in for "confidence change". */
  confidenceChange: number;
  questionsSolved: number;
}

const DAY_MS = 86_400_000;

function averageQuestionsPerAttempt(overview: PracticeOverviewData): number {
  return overview.totalAttempts > 0 ? overview.totalQuestionsAttempted / overview.totalAttempts : 0;
}

function averageSecPerAttempt(overview: PracticeOverviewData): number {
  return overview.totalAttempts > 0 ? overview.totalPracticeTimeSec / overview.totalAttempts : 0;
}

function buildPeriodSummary(overview: PracticeOverviewData, days: number, now: number): PeriodSummary {
  const history = overview.accuracyTrend.history;
  const current = history.filter(h => now - new Date(h.date).getTime() <= days * DAY_MS);
  const prior = history.filter(h => {
    const age = now - new Date(h.date).getTime();
    return age > days * DAY_MS && age <= days * 2 * DAY_MS;
  });

  const avgAccuracy = (pts: typeof history) => pts.length ? round(pts.reduce((s, p) => s + p.accuracy, 0) / pts.length) : 0;
  const currentAccuracy = avgAccuracy(current);

  return {
    practiceSessions: current.length,
    accuracyPercent: currentAccuracy,
    confidenceChange: prior.length ? round(currentAccuracy - avgAccuracy(prior)) : 0,
    questionsSolved: Math.round(current.length * averageQuestionsPerAttempt(overview)),
  };
}

// ── Teacher-Style Remark ──────────────────────────────────────────────────
// One holistic sentence-pair: an opening tied to the overall grade band, a
// closing tied to whichever real issue (or lack thereof) stands out most —
// same priority-of-evidence style as Feature 8's buildPositiveReinforcement.

function buildTeacherRemark(d: DerivedAnalytics, grade: GradeInfo): string {
  const opening = grade.letter === 'A+' || grade.letter === 'A'
    ? 'Excellent progress.'
    : grade.letter === 'B+' || grade.letter === 'B'
      ? 'You have built a strong foundation.'
      : grade.letter === 'C'
        ? 'You are making steady progress.'
        : 'There is real room to grow from here.';

  let closing: string;
  if (d.accuracyInsights.ratios.skippedPercent > 20) {
    closing = 'Focus on reducing skipped questions to improve your confidence score.';
  } else if (d.subjectInsights && d.subjectInsights.weakest.accuracyPercent < LOW_ACCURACY_THRESHOLD) {
    closing = `Continue practising ${d.subjectInsights.weakest.subjectName} regularly to strengthen your overall performance.`;
  } else if (d.accuracyInsights.consistency && ['Inconsistent', 'Highly Inconsistent'].includes(d.accuracyInsights.consistency.label)) {
    closing = 'Work on keeping your accuracy consistent between practice sessions.';
  } else {
    closing = 'Keep up the consistent practice to maintain this level.';
  }

  return `${opening} ${closing}`;
}

// ── Entry point ─────────────────────────────────────────────────────────

export interface ReportCardData {
  generatedAt: string;
  studentSummary: StudentSummary;
  subjectReportCards: SubjectReportCardEntry[];
  strongestSubjects: SubjectHighlight[];
  subjectsNeedingImprovement: SubjectHighlight[];
  performanceHighlights: string[];
  /** insights.summaryLines, joined — the exact text Feature 8's "Overall
   *  Learning Summary" card renders. Not regenerated here. */
  aiSummary: string;
  weeklySummary: PeriodSummary;
  monthlySummary: PeriodSummary & { totalStudyTimeSec: number };
  /** insights.confidence.breakdown, reused as-is for the report's
   *  Performance Breakdown bars. */
  performanceBreakdown: ConfidenceBreakdownEntry[];
  teacherRemark: string;
}

export function buildReportCard(
  overview: PracticeOverviewData,
  subjects: SubjectStat[],
  insights: LearningInsights,
  plan: StudyPlan | null,
  now: number = Date.now(),
): ReportCardData | null {
  if (overview.totalAttempts < MIN_ATTEMPTS_FOR_REPORT_CARD) return null;

  const d = insights.derived;
  const overallGrade = getGrade(overview.accuracyPercent);
  const subjectReportCards = buildSubjectReportCards(subjects);

  const weeklySummary = buildPeriodSummary(overview, 7, now);
  const monthlyBase = buildPeriodSummary(overview, 30, now);
  const monthlySummary = {
    ...monthlyBase,
    totalStudyTimeSec: Math.round(monthlyBase.practiceSessions * averageSecPerAttempt(overview)),
  };

  return {
    generatedAt: new Date(now).toISOString(),
    studentSummary: {
      overallGrade,
      overallAccuracy: overview.accuracyPercent,
      confidenceScore: insights.confidence.score,
      confidenceBand: insights.confidence.band,
      totalPracticeOlympiads: overview.totalAttempts,
      totalQuestionsAttempted: overview.totalQuestionsAttempted,
      totalCorrect: overview.totalCorrect,
      totalWrong: overview.totalWrong,
      totalSkipped: overview.totalSkipped,
      averageTimePerQuestionSec: overview.averageTimePerQuestionSec,
      overallRank: 'Coming Soon',
    },
    subjectReportCards,
    strongestSubjects: buildStrongestSubjects(subjectReportCards),
    subjectsNeedingImprovement: buildSubjectsNeedingImprovement(subjectReportCards, subjects, d.accuracyInsights.ratios.skippedPercent),
    performanceHighlights: buildPerformanceHighlights(d, plan),
    aiSummary: insights.summaryLines.join(' '),
    weeklySummary,
    monthlySummary,
    performanceBreakdown: insights.confidence.breakdown,
    teacherRemark: buildTeacherRemark(d, overallGrade),
  };
}
