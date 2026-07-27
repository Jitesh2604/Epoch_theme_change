import { useEffect, useState } from 'react';

const STORAGE_KEY = 'epoch-achievement-celebrations-seen';

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage unavailable (private mode, quota) — the celebration just
    // won't persist across reloads; not fatal to the rest of the feature.
  }
}

/**
 * Feature 14 (Achievements & Milestones) — tracks which unlocked badge ids
 * have already shown their celebration popup, so a badge that was already
 * unlocked before the student's first visit this session doesn't celebrate
 * on every page load. Purely a client-side UX concern (not analytics data),
 * so localStorage is the right store — same pattern Feature 9's
 * useStudyPlanProgress.ts already established for "client-only interaction
 * state" that shouldn't need a server round-trip.
 *
 * A badge id is marked "seen" as soon as it's queued for celebration (not
 * when the modal is dismissed) — the safer failure mode if a tab closes
 * mid-animation is "shown once, maybe missed" rather than "shows again
 * every reload."
 */
export function useAchievementCelebrations(unlockedIds: string[]) {
  const [queue, setQueue] = useState<string[]>([]);
  const key = unlockedIds.join(',');

  useEffect(() => {
    if (!unlockedIds.length) return;
    const seen = loadSeen();
    const newlyUnlocked = unlockedIds.filter(id => !seen.has(id));
    if (!newlyUnlocked.length) return;

    setQueue(prev => [...prev, ...newlyUnlocked.filter(id => !prev.includes(id))]);
    const updated = new Set(seen);
    newlyUnlocked.forEach(id => updated.add(id));
    saveSeen(updated);
    // `key` (the joined id list) is the real dependency — using it instead
    // of `unlockedIds` avoids re-running on every render from a new array
    // reference with the same contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = queue[0] ?? null;
  const dismiss = () => setQueue(prev => prev.slice(1));

  return { current, dismiss };
}
