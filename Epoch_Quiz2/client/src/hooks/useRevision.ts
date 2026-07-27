import { useAsync } from './useApi';
import { api } from '../lib/api';
import type { PracticeAttemptData } from './usePracticeQuiz';

// Feature 13: Revision Center & Spaced Revision.

export type RevisionDueStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';
export type RevisionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RevisionQueueItem {
  id:            string;
  questionId:    string;
  prompt:        string;
  difficulty:    'EASY' | 'MEDIUM' | 'HARD';
  subject:       { id: string; name: string } | null;
  topic:         { id: string; name: string } | null;
  reasons:       string[];
  intervalIndex: number;
  timesRevised:  number;
  wrongCount:    number;
  skipCount:     number;
  lastResult:    'CORRECT' | 'WRONG' | 'SKIPPED' | null;
  lastSeenAt:    string | null;
  nextDueAt:     string;
  dueStatus:     RevisionDueStatus;
  bookmarked:    boolean;
  priority:      RevisionPriority;
  priorityScore: number;
}

export interface RevisionTopicCoverage {
  topicId:   string;
  topicName: string;
  dueCount:  number;
}

export interface RevisionDashboard {
  items: RevisionQueueItem[];
  counts: {
    dueToday: number;
    overdue: number;
    upcoming: number;
    completedRevisions: number;
  };
  revisionAccuracyPercent: number;
  topicCoverage: RevisionTopicCoverage[];
  streak: {
    currentStreak: number;
    bestStreak: number;
    totalSessions: number;
    /** Feature 14 (Achievements & Milestones) — best-effort "date earned"
     *  for revision-streak badges. */
    lastSessionDate: string | null;
  };
}

export function useRevisionDashboard() {
  return useAsync<RevisionDashboard>(() => api.get('/revision/dashboard'), []);
}

export const revisionApi = {
  /** "Start Today's Revision" — reuses the existing Practice player (same
   *  PracticeAttemptData shape startPractice/startRetry return), no new
   *  Question records. */
  start: () => api.post<PracticeAttemptData>('/revision/start'),
};
