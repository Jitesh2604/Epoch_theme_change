import { createContext, useContext } from 'react';

/**
 * The Practice/Assessment pages under dashboards/student/pages hardcode their
 * internal navigate() targets relative to a "base" (e.g. "/student/practice").
 * That base defaults to the Student Dashboard mount so nothing changes for
 * the existing sidebar-wrapped routes. The standalone practice/assessment
 * shell (mounted at a different URL, no dashboard chrome) overrides it via
 * BasePathContext.Provider so the exact same page components stay correct
 * under either mount point — no forked/duplicated page logic.
 */
const BasePathContext = createContext('/student');

export const BasePathProvider = BasePathContext.Provider;

export function useBasePath(): string {
  return useContext(BasePathContext);
}
