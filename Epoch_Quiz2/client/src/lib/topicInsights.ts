import type { TopicStat } from '../hooks/useStudentAnalytics';

/**
 * Feature 7: Topic-wise Analytics — pure derivation over TopicStat[] (already
 * fetched by AnalyticsPage.tsx's useTopicBreakdown). No fetching of its own,
 * no recalculation of anything the backend already computed.
 *
 * Unlike Features 4/5 (which pick a single best/worst via pickBy), this
 * feature explicitly asks for Top-5 ranked lists, so these are plain sorts +
 * slice(0, 5) rather than pickBy's single-winner-with-tiebreak pattern.
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TopicImprovementPick {
  topic: TopicStat;
  improvementPercent: number; // > 0, latest - first
}

export interface TopicInsights {
  /** Top 5 by accuracy — topics with only one attempted question are
   *  excluded, per the request ("ignore ... to avoid misleading
   *  recommendations"). */
  strongestTopics: TopicStat[];
  weakestTopics: TopicStat[];
  /** Top 5 by totalQuestionsAttempted — no exclusion (every TopicStat is
   *  already an attempted topic by construction). */
  mostPracticedTopics: TopicStat[];
  /** Bottom 5 by totalQuestionsAttempted — same set, ascending. */
  neglectedTopics: TopicStat[];
  /** Top 5 most-improved (latest - first > 0), chronological, ranked
   *  descending by improvement. Empty when nothing qualifies. */
  mostImprovedTopics: TopicImprovementPick[];
  insightLines: string[];
  recommendationLines: string[];
}

export function deriveTopicInsights(topics: TopicStat[]): TopicInsights | null {
  if (!topics.length) return null;

  const eligibleForRanking = topics.filter(t => t.totalQuestionsAttempted >= 2);

  const byAccuracyDesc = [...eligibleForRanking].sort((a, b) => b.accuracyPercent - a.accuracyPercent);
  const byAccuracyAsc  = [...eligibleForRanking].sort((a, b) => a.accuracyPercent - b.accuracyPercent);
  const strongestTopics = byAccuracyDesc.slice(0, 5);
  const weakestTopics   = byAccuracyAsc.slice(0, 5);

  const byAttemptedDesc = [...topics].sort((a, b) => b.totalQuestionsAttempted - a.totalQuestionsAttempted);
  const byAttemptedAsc  = [...topics].sort((a, b) => a.totalQuestionsAttempted - b.totalQuestionsAttempted);
  const mostPracticedTopics = byAttemptedDesc.slice(0, 5);
  const neglectedTopics     = byAttemptedAsc.slice(0, 5);

  const withHistory = topics.filter(t => t.totalAttempts >= 2);
  const mostImprovedTopics: TopicImprovementPick[] = withHistory
    .map(topic => ({ topic, improvementPercent: round(topic.latestAttemptAccuracy - topic.firstAttemptAccuracy) }))
    .filter(pick => pick.improvementPercent > 0)
    .sort((a, b) => b.improvementPercent - a.improvementPercent)
    .slice(0, 5);

  const insightLines: string[] = [];
  const recommendationLines: string[] = [];

  if (strongestTopics.length) {
    insightLines.push(`You perform strongly in ${strongestTopics[0].topicName}.`);
  }
  if (weakestTopics.length) {
    insightLines.push(`${weakestTopics[0].topicName} needs more attention.`);
    recommendationLines.push(`Spend more time practicing ${weakestTopics[0].topicName}.`);
  }
  if (mostImprovedTopics.length) {
    const top = mostImprovedTopics[0];
    insightLines.push(`Your accuracy in ${top.topic.topicName} has improved by ${top.improvementPercent}%.`);
  }
  if (neglectedTopics.length && topics.length > 1) {
    recommendationLines.push(`Practice ${neglectedTopics[0].topicName} more often to build consistency.`);
  }
  if (weakestTopics.length && strongestTopics.length && weakestTopics[0].topicId !== strongestTopics[0].topicId) {
    recommendationLines.push('Focus on your weaker topics before attempting another mixed practice session.');
  }

  return {
    strongestTopics,
    weakestTopics,
    mostPracticedTopics,
    neglectedTopics,
    mostImprovedTopics,
    insightLines,
    recommendationLines,
  };
}
