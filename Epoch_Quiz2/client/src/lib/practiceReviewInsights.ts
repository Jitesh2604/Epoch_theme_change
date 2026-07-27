import type { SubjectStat, QuestionTypeStat, TopicStat } from '../hooks/useStudentAnalytics';
import { getQuestionTypeLabel } from './questionTypeLabel';

/**
 * Feature 12: Practice Review & Mistake Analysis — "Learning Summary".
 *
 * Pure derivation over Feature 2/5/7's already-fetched SubjectStat[] /
 * QuestionTypeStat[] / TopicStat[] (AnalyticsPage.tsx fetches all three
 * already) — no new query, no recomputed analytics, same "each line only
 * appears if the data actually backs it" rule as every other insights
 * engine in this app.
 */

export const HIGH_SKIP_RATE_THRESHOLD = 20; // percent
export const QUESTION_TYPE_GAP_THRESHOLD = 20; // percentage points, best vs. worst type

function skipRatePercent(s: { totalSkipped: number; totalQuestionsAttempted: number }): number {
  return s.totalQuestionsAttempted > 0 ? Math.round((s.totalSkipped / s.totalQuestionsAttempted) * 10000) / 100 : 0;
}

export function buildReviewLearningSummary(
  subjects: SubjectStat[],
  questionTypes: QuestionTypeStat[],
  topics: TopicStat[],
): string[] {
  const lines: string[] = [];

  // Most mistakes (wrong answers) came from a specific subject — only
  // meaningful with more than one subject to compare against.
  if (subjects.length >= 2) {
    const mostWrong = subjects.reduce((a, b) => (b.totalWrong > a.totalWrong ? b : a));
    if (mostWrong.totalWrong > 0) {
      lines.push(`Most mistakes came from ${mostWrong.subjectName} (${mostWrong.totalWrong} wrong answer${mostWrong.totalWrong === 1 ? '' : 's'}).`);
    }
  }

  // A subject with a genuinely high skip rate.
  const worstSkipSubject = subjects
    .map(s => ({ s, rate: skipRatePercent(s) }))
    .filter(x => x.rate >= HIGH_SKIP_RATE_THRESHOLD)
    .sort((a, b) => b.rate - a.rate)[0];
  if (worstSkipSubject) {
    lines.push(`You skipped many ${worstSkipSubject.s.subjectName} questions (${worstSkipSubject.rate}% skipped).`);
  }

  // Question-type accuracy gap — "accurate on X but struggled with Y", only
  // when the gap is large enough to be a real pattern, not noise.
  if (questionTypes.length >= 2) {
    const sorted = [...questionTypes].sort((a, b) => b.accuracyPercent - a.accuracyPercent);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (best.questionType !== worst.questionType && best.accuracyPercent - worst.accuracyPercent >= QUESTION_TYPE_GAP_THRESHOLD) {
      lines.push(
        `You answered ${getQuestionTypeLabel(best.questionType)} questions accurately (${best.accuracyPercent}%) but struggled with ${getQuestionTypeLabel(worst.questionType)} (${worst.accuracyPercent}%).`,
      );
    }
  }

  // Most mistakes at the topic (chapter) level — same ≥2-questions
  // eligibility bar Feature 7's own ranking uses.
  const eligibleTopics = topics.filter(t => t.totalQuestionsAttempted >= 2);
  if (eligibleTopics.length) {
    const mostWrongTopic = eligibleTopics.reduce((a, b) => (b.totalWrong > a.totalWrong ? b : a));
    if (mostWrongTopic.totalWrong > 0) {
      lines.push(`Most mistakes occurred in ${mostWrongTopic.topicName} (${mostWrongTopic.totalWrong} wrong answer${mostWrongTopic.totalWrong === 1 ? '' : 's'}).`);
    }
  }

  return lines;
}
