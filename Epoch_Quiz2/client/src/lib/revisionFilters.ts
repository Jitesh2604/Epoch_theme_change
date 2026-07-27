import type { RevisionQueueItem, RevisionPriority } from '../hooks/useRevision';

/**
 * Feature 13: Revision Center & Spaced Revision — queue Filters. Pure
 * predicate logic over the already-fetched RevisionQueueItem[] (from the
 * existing GET /revision/dashboard endpoint) — client-side re-filter of
 * data already in memory, no new query per filter change.
 */

export interface RevisionFilterState {
  subjectId:      string | null;
  topicId:        string | null;
  priority:       RevisionPriority | null;
  dueStatus:      'ALL' | 'DUE_TODAY' | 'OVERDUE';
  bookmarkedOnly: boolean;
  completedOnly:  boolean;
}

export const DEFAULT_REVISION_FILTERS: RevisionFilterState = {
  subjectId: null, topicId: null, priority: null, dueStatus: 'ALL', bookmarkedOnly: false, completedOnly: false,
};

export function hasActiveRevisionFilters(filters: RevisionFilterState): boolean {
  return Boolean(
    filters.subjectId || filters.topicId || filters.priority
    || filters.dueStatus !== 'ALL' || filters.bookmarkedOnly || filters.completedOnly,
  );
}

export function filterRevisionItems(items: RevisionQueueItem[], filters: RevisionFilterState): RevisionQueueItem[] {
  return items.filter(i => {
    if (filters.subjectId && i.subject?.id !== filters.subjectId) return false;
    if (filters.topicId && i.topic?.id !== filters.topicId) return false;
    if (filters.priority && i.priority !== filters.priority) return false;
    if (filters.dueStatus === 'DUE_TODAY' && i.dueStatus !== 'DUE_TODAY') return false;
    if (filters.dueStatus === 'OVERDUE' && i.dueStatus !== 'OVERDUE') return false;
    if (filters.bookmarkedOnly && !i.bookmarked) return false;
    if (filters.completedOnly && i.timesRevised === 0) return false;
    return true;
  });
}

export function distinctRevisionSubjects(items: RevisionQueueItem[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const i of items) if (i.subject) map.set(i.subject.id, i.subject.name);
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function distinctRevisionTopics(items: RevisionQueueItem[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const i of items) if (i.topic) map.set(i.topic.id, i.topic.name);
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
