import { api } from '../lib/api';
import { useAsync } from './useApi';

// Student Analytics — Feature 1: Overall Performance Dashboard. Practice
// Olympiad only (single-subject Practice + Mixed Subjects Practice); see
// server/src/services/analytics.service.ts for the exact scope/rules.

export interface PracticeOverviewEmpty {
  hasData: false;
}

export interface PracticeSession {
  subjectLabel: string;
  date: string;
  durationSec: number;
}

export interface AccuracyWindowStats {
  count: number;
  averageAccuracy: number;
  bestAccuracy: number;
  lowestAccuracy: number;
}

export interface AccuracyDistributionBand {
  band: string;
  count: number;
  percentage: number;
}

export interface AccuracyHistoryPoint {
  date: string;
  accuracy: number;
}

/** Feature 6: per-attempt accuracy, chronologically — a genuinely different
 *  number from `accuracyPercent` above (that one sums correct/answered
 *  across ALL attempts combined; this is attempt #1, #2, #3... in order).
 *  `history` is the raw reusable list future features can slice/segment
 *  freely; everything else here is a convenience aggregate over it. */
export interface AccuracyTrend {
  firstAttemptAccuracy: number;
  latestAttemptAccuracy: number;
  bestAccuracyAchieved: number;
  lowestAccuracyAchieved: number;
  averageAccuracyAcrossAttempts: number;
  accuracyStdDeviation: number;
  distribution: AccuracyDistributionBand[];
  recentAccuracy: {
    last5: AccuracyWindowStats;
    last10: AccuracyWindowStats | null;
  };
  history: AccuracyHistoryPoint[];
}

export interface PracticeOverviewData {
  hasData: true;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageScore: number;
  bestScore: number;
  lowestScore: number;
  averagePercentage: number;
  totalPracticeTimeSec: number;
  averageTimePerQuestionSec: number;
  firstPracticeDate: string;
  lastPracticeDate: string;
  totalSubjectsPracticed: number;
  totalMixedPracticeAttempts: number;
  /** Feature 4: the single longest/shortest practice session — attempt-level
   *  timeTakenSec, already fetched for every other Feature 1 number above,
   *  just picked out as a min/max here rather than a new query. */
  longestSession: PracticeSession;
  shortestSession: PracticeSession;
  accuracyTrend: AccuracyTrend;
}

export type PracticeOverview = PracticeOverviewEmpty | PracticeOverviewData;

export function usePracticeOverview() {
  return useAsync<PracticeOverview>(() => api.get('/analytics/practice/overview'), []);
}

// Student Analytics — Feature 2: Subject-wise Performance. Aggregated per
// question (via Question.subjectExternalId), not per attempt, so a Mixed
// Subjects Practice attempt correctly contributes to every subject it
// actually touched — see server/src/services/analytics.service.ts's
// getSubjectBreakdown for the full explanation.

export interface SubjectStat {
  subjectId: string;
  subjectName: string;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageScore: number;
  bestScore: number;
  averagePercentage: number;
  averageTimePerQuestionSec: number;
  lastPracticeDate: string;
  /** Accuracy on this subject's chronologically first / most recent attempt
   *  — feeds Feature 3's "Biggest Improvement" pick (see
   *  strengthWeaknessInsights.ts). Computed from the same per-(subject,
   *  attempt) slices as everything else above, not a second query. */
  firstAttemptAccuracy: number;
  latestAttemptAccuracy: number;
  /** Feature 4: same idea, for time-per-question instead of accuracy — see
   *  speedInsights.ts's speedImprovement pick. */
  firstAttemptTimePerQuestionSec: number;
  latestAttemptTimePerQuestionSec: number;
}

export function useSubjectBreakdown() {
  return useAsync<SubjectStat[]>(() => api.get('/analytics/practice/subjects'), []);
}

// Student Analytics — Feature 2b: Subject × Question-Type Performance.
// Question-type accuracy broken down *within* each subject, so Subject-wise
// Performance cards can show "Maths → MCQ 88%, True/False 76%, ..." instead
// of question-type accuracy living in its own cross-subject section — see
// server/src/services/analytics.service.ts's getSubjectQuestionTypeBreakdown.
// Only (subject, type) pairs the student has actually answered appear here —
// no zero-filled/invented rows for types they've never attempted.

export interface SubjectQuestionTypeStat {
  subjectId: string;
  subjectName: string;
  questionType: string; // raw QuestionType enum value, e.g. 'MCQ_SINGLE'
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
}

export function useSubjectQuestionTypeBreakdown() {
  return useAsync<SubjectQuestionTypeStat[]>(() => api.get('/analytics/practice/subject-question-types'), []);
}

// Student Analytics — Feature 5: Question Type Analytics. Same idea as
// SubjectStat, grouped by Question.type instead — a single Practice/Mixed
// attempt can mix question types just as freely as it can mix subjects, so
// this needs the same per-(type, attempt) slicing; see
// server/src/services/analytics.service.ts's getQuestionTypeBreakdown.

export interface QuestionTypeStat {
  questionType: string; // raw QuestionType enum value, e.g. 'MCQ_SINGLE'
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageScore: number;
  bestAccuracy: number;
  averageTimePerQuestionSec: number;
  lastAttemptDate: string;
  firstAttemptAccuracy: number;
  latestAttemptAccuracy: number;
}

export function useQuestionTypeBreakdown() {
  return useAsync<QuestionTypeStat[]>(() => api.get('/analytics/practice/question-types'), []);
}

// Student Analytics — Feature 7: Topic-wise Analytics. The schema/Content API
// have no "Topic" level (boards/classes/subjects/series/books/chapters only),
// so Chapter is used as the Topic unit, per the fallback instruction. Same
// per-(chapter, attempt) slicing as SubjectStat/QuestionTypeStat above; see
// server/src/services/analytics.service.ts's getTopicBreakdown.

export interface TopicStat {
  topicId: string; // chapter external id
  topicName: string;
  subjectId: string | null;
  subjectName: string;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  accuracyPercent: number;
  averageTimePerQuestionSec: number;
  lastPracticedDate: string;
  firstAttemptAccuracy: number;
  latestAttemptAccuracy: number;
}

export function useTopicBreakdown() {
  return useAsync<TopicStat[]>(() => api.get('/analytics/practice/topics'), []);
}
