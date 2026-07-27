import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/authStore';
import { toDateKey } from '../lib/studyPlanEngine';

/**
 * Feature 9: Personalized Study Plan — local "did I do today's plan"
 * tracking. Deliberately localStorage-backed rather than a new backend
 * table/endpoint: which of today's generated task ids are checked off is
 * pure UI/engagement state, not an analytics fact the server needs to know,
 * and every other Feature-9 number (streaks, badges, weekly plan) is
 * derived from real fetched analytics regardless of what's stored here.
 * Scoped per student id so a shared browser never mixes two accounts'
 * progress.
 */

interface StoredProgress {
  completedTasksByDate: Record<string, string[]>;
}

const EMPTY: StoredProgress = { completedTasksByDate: {} };

function storageKey(studentId: string): string {
  return `epoch:studyPlan:v1:${studentId}`;
}

function readStored(studentId: string): StoredProgress {
  try {
    const raw = localStorage.getItem(storageKey(studentId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return { completedTasksByDate: parsed.completedTasksByDate ?? {} };
  } catch {
    return EMPTY;
  }
}

function writeStored(studentId: string, data: StoredProgress) {
  try {
    localStorage.setItem(storageKey(studentId), JSON.stringify(data));
  } catch {
    // Private-browsing / quota — progress just won't survive a reload this session.
  }
}

export function useStudyPlanProgress() {
  const user = useAuth();
  const studentId = user?.id ?? null;
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const [stored, setStored] = useState<StoredProgress>(() => (studentId ? readStored(studentId) : EMPTY));

  useEffect(() => {
    setStored(studentId ? readStored(studentId) : EMPTY);
  }, [studentId]);

  const completedTaskIds = useMemo(() => new Set(stored.completedTasksByDate[todayKey] ?? []), [stored, todayKey]);

  const toggleTask = useCallback((taskId: string) => {
    if (!studentId) return;
    setStored(prev => {
      const current = new Set(prev.completedTasksByDate[todayKey] ?? []);
      if (current.has(taskId)) current.delete(taskId); else current.add(taskId);
      const next: StoredProgress = { completedTasksByDate: { ...prev.completedTasksByDate, [todayKey]: [...current] } };
      writeStored(studentId, next);
      return next;
    });
  }, [studentId, todayKey]);

  const completeAll = useCallback((taskIds: string[]) => {
    if (!studentId) return;
    setStored(prev => {
      const next: StoredProgress = { completedTasksByDate: { ...prev.completedTasksByDate, [todayKey]: taskIds } };
      writeStored(studentId, next);
      return next;
    });
  }, [studentId, todayKey]);

  // Every calendar date with at least one task marked complete — feeds the
  // streak calculation alongside real practice-attempt dates.
  const locallyEngagedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const [date, ids] of Object.entries(stored.completedTasksByDate)) {
      if (ids.length > 0) dates.add(date);
    }
    return dates;
  }, [stored]);

  return { todayKey, completedTaskIds, toggleTask, completeAll, locallyEngagedDates };
}
