import { useAsync } from './useApi';
import { api } from '../lib/api';
import { useAuth, toUIRole } from '../lib/authStore';

interface AssessmentPublishFlag {
  resultsVisible: boolean;
}

/**
 * Whether the current session's assessment has its results published —
 * drives the Leaderboard's navbar visibility (see NavBar.tsx): hidden until
 * results are out, then shown automatically, no manual flag needed. Only
 * fetches for logged-in students (the only role this ever affects); the
 * hook itself is still called unconditionally per React's rules of hooks,
 * the fetch is just a no-op otherwise, so this is free for every other page.
 */
export function useResultsPublished(): boolean {
  const user = useAuth();
  const isStudent = !!user && toUIRole(user.role) === 'student';

  const { data } = useAsync<{ items: AssessmentPublishFlag[] } | null>(
    () => isStudent
      ? api.getWithQuery('/assessments', { status: 'PUBLISHED', limit: 1 })
      : Promise.resolve(null),
    [isStudent],
  );

  return !!data?.items?.[0]?.resultsVisible;
}
