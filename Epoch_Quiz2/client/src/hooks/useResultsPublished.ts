import { useAsync } from './useApi';
import { api } from '../lib/api';
import { useAuth, toUIRole } from '../lib/authStore';

interface AssessmentPublishFlag {
  resultsVisible: boolean;
}

/**
 * Whether the current session's assessment has its results published — the
 * single source of truth tying both the Leaderboard's navbar visibility
 * (see NavBar.tsx) and the Leaderboard page's own direct-URL gating (see
 * LeaderboardPage.tsx) to the same Assessment Results publish state: hidden
 * until results are out, then shown automatically, no manual flag needed.
 * Only fetches for logged-in students (the only role this ever affects);
 * the hook itself is still called unconditionally per React's rules of
 * hooks, the fetch is just a no-op otherwise, so this is free for every
 * other page. `loading` starts true even for non-students so callers can
 * avoid flashing "not published" before the check has actually run.
 */
export function useResultsPublished(): { published: boolean; loading: boolean } {
  const user = useAuth();
  const isStudent = !!user && toUIRole(user.role) === 'student';

  const { data, loading } = useAsync<{ items: AssessmentPublishFlag[] } | null>(
    () => isStudent
      ? api.getWithQuery('/assessments', { status: 'PUBLISHED', limit: 1 })
      : Promise.resolve(null),
    [isStudent],
  );

  return { published: !!data?.items?.[0]?.resultsVisible, loading };
}
