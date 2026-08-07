// Feature 13: Revision Center & Spaced Revision. The UI itself (and its
// client fetch/API calls) has been removed — these types remain because
// the admin-side student performance view (useStudentPerformance.ts)
// still reuses the RevisionDashboard shape for its own data.

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
