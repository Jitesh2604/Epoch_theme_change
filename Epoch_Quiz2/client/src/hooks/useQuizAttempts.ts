import { api } from '../lib/api';
import { useAsync } from './useApi';

// ── Admin-only, cross-student report over every Practice/Olympiad attempt —
//    the QuizAttempt equivalent of useSubmissions.ts. ─────────────────────

export interface QuizAttemptListItem {
  id:            string;
  attemptNumber: number;
  student:       { id: string; name: string; email: string };
  quiz: {
    id:       string;
    title:    string;
    quizType: 'PRACTICE' | 'OLYMPIAD' | 'CHAPTER_TEST' | 'MOCK_TEST' | 'LIVE_QUIZ' | 'ASSIGNMENT';
    subject:  { id: string; name: string } | null;
  };
  status:         'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';
  startTime:      string;
  endTime:        string | null;
  timeTakenSec:   number;
  score:          number;
  percentage:     number;
  correctAnswers: number;
  wrongAnswers:   number;
  skipped:        number;
  isSubmitted:    boolean;
}

export interface QuizAttemptsPage {
  items: QuizAttemptListItem[];
  meta:  { page: number; limit: number; total: number; totalPages: number };
}

export type QuizAttemptSortBy = 'latest' | 'score_desc' | 'score_asc' | 'time_desc' | 'time_asc';

export interface QuizAttemptsQuery {
  page?:              number;
  limit?:             number;
  status?:            string;
  quizType?:          string;
  studentId?:         string;
  subjectExternalId?: string;
  dateFrom?:          string;
  dateTo?:            string;
  sortBy?:            QuizAttemptSortBy;
}

export function useQuizAttempts(params: QuizAttemptsQuery = {}) {
  return useAsync<QuizAttemptsPage>(
    () => api.getWithQuery('/quizzes/attempts', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}
