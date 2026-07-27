import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

// Feature 12 (Practice Review & Mistake Analysis) — bookmarking a Question
// found difficult while reviewing a past Practice Olympiad attempt.

export interface BookmarkRecord {
  questionId: string;
  createdAt:  string;
}

export const bookmarkApi = {
  list:   ()                   => api.get<BookmarkRecord[]>('/bookmarks'),
  add:    (questionId: string) => api.post<{ ok: true; bookmarked: true }>('/bookmarks', { questionId }),
  remove: (questionId: string) => api.delete<{ ok: true; bookmarked: false }>(`/bookmarks/${questionId}`),
};

/**
 * The student's full bookmarked-question-id set, kept in local state and
 * toggled optimistically — a student's own bookmarks are a small list, so a
 * single upfront fetch + local Set is simpler than paginating, and a toggle
 * click should feel instant rather than waiting on a round-trip. Failed
 * toggles roll back to the pre-click state rather than leaving the UI
 * showing a bookmark that didn't actually persist.
 */
export function useBookmarks() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bookmarkApi.list()
      .then(rows => { if (!cancelled) setIds(new Set(rows.map(r => r.questionId))); })
      .catch((err: any) => { if (!cancelled) setError(err?.message ?? 'Failed to load bookmarks'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async (questionId: string) => {
    const wasBookmarked = ids.has(questionId);
    setIds(prev => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(questionId); else next.add(questionId);
      return next;
    });
    try {
      if (wasBookmarked) await bookmarkApi.remove(questionId);
      else await bookmarkApi.add(questionId);
    } catch (err) {
      setIds(prev => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(questionId); else next.delete(questionId);
        return next;
      });
      throw err;
    }
  }, [ids]);

  return {
    loading, error,
    isBookmarked: (questionId: string) => ids.has(questionId),
    toggle,
  };
}
