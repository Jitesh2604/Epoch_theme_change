import { useEffect, useSyncExternalStore } from 'react';

// Module-level store (not React state) so App.tsx can know whether a
// test-taking screen is currently active without route-string matching —
// OlympiadPlayPage has internal preview/playing/result phases that don't
// map cleanly onto the URL.
let active = false;
const listeners = new Set<() => void>();

function setActive(value: boolean) {
  if (active === value) return;
  active = value;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return active;
}

/** Read whether exam mode (distraction-free, chrome hidden) is active. */
export function useExamModeActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Call from a test-taking screen with whether it should currently be in
 * exam mode. Always restores chrome on unmount, so leaving the page,
 * submitting, or navigating away brings the navbar back automatically.
 */
export function useExamMode(active: boolean) {
  useEffect(() => {
    setActive(active);
    return () => setActive(false);
  }, [active]);
}
