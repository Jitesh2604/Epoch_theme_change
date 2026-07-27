import type { RevisionDashboard } from '../hooks/useRevision';

/**
 * Feature 13: Revision Center & Spaced Revision — Smart Reminders.
 *
 * Pure derivation over the already-fetched RevisionDashboard payload — no
 * new query, no recomputed analytics. Same "only emit a line the data
 * actually backs" rule as every other insights engine in this app.
 */

export const STALE_TOPIC_DAYS_THRESHOLD = 7;

export function buildRevisionReminders(dashboard: RevisionDashboard): string[] {
  const lines: string[] = [];
  const { counts, items } = dashboard;

  if (counts.dueToday > 0) {
    lines.push(`You have ${counts.dueToday} revision question${counts.dueToday === 1 ? '' : 's'} due today.`);
  }

  if (counts.overdue > 0) {
    lines.push(`You have ${counts.overdue} overdue revision question${counts.overdue === 1 ? '' : 's'} — these were due before today.`);
  }

  // Subject with the most overdue items, named specifically ("Biology
  // revision is overdue") rather than just the overall count above.
  const overdueBySubject = new Map<string, number>();
  for (const item of items) {
    if (item.dueStatus === 'OVERDUE' && item.subject) {
      overdueBySubject.set(item.subject.name, (overdueBySubject.get(item.subject.name) ?? 0) + 1);
    }
  }
  const worstOverdueSubject = [...overdueBySubject.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worstOverdueSubject) {
    lines.push(`${worstOverdueSubject[0]} revision is overdue.`);
  }

  // Topic that has gone the longest without being revised — only mentioned
  // once it crosses a real threshold, not for every topic.
  const topicLastSeenMs = new Map<string, number | null>();
  for (const item of items) {
    if (!item.topic) continue;
    const seenMs = item.lastSeenAt ? new Date(item.lastSeenAt).getTime() : null;
    const cur = topicLastSeenMs.get(item.topic.name);
    if (cur === undefined) {
      topicLastSeenMs.set(item.topic.name, seenMs);
    } else if (seenMs !== null && (cur === null || seenMs > cur)) {
      topicLastSeenMs.set(item.topic.name, seenMs);
    }
  }
  let stalestTopic: { name: string; days: number | null } | null = null;
  for (const [name, seenMs] of topicLastSeenMs) {
    const days = seenMs === null ? null : Math.floor((Date.now() - seenMs) / 86_400_000);
    const isStale = days === null || days >= STALE_TOPIC_DAYS_THRESHOLD;
    if (!isStale) continue;
    const rank = days ?? Number.POSITIVE_INFINITY;
    const curRank = stalestTopic ? (stalestTopic.days ?? Number.POSITIVE_INFINITY) : -1;
    if (!stalestTopic || rank > curRank) stalestTopic = { name, days };
  }
  if (stalestTopic) {
    lines.push(stalestTopic.days === null
      ? `You haven't revised ${stalestTopic.name} yet.`
      : `You haven't revised ${stalestTopic.name} in ${stalestTopic.days} days.`);
  }

  return lines.slice(0, 4);
}
