import { useAsync } from './useApi';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────

export interface PracticeSubject {
  id: string;
  name: string;
  slug: string;
  questionCount: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
}

export interface PracticeQuestion {
  order:      number;
  id:         string;
  type:       'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'FILL_IN_BLANK';
  prompt:     string;
  options:    { letter: string; text: string }[] | null;
  marks:      number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface PracticeAttemptData {
  attemptId:     string;
  attemptNumber: number;
  quizId:        string;
  subject:       { id: string; name: string; slug: string };
  difficulty:    string | null;
  questionCount: number;
  /** Backend-assigned time budget for this attempt, in seconds. Null when the
   *  attempt type has no time cap (e.g. Olympiad). */
  timeLimitSec:  number | null;
  totalMarks:    number;
  startTime:     string;
  questions:     PracticeQuestion[];
  /** Present when the attempt is re-fetched (refresh / direct nav) — lets the
   *  play page restore in-progress selections. */
  savedAnswers?: Array<{
    questionId:      string;
    selectedOption:  string | null;
    selectedOptions: string[];
    textAnswer:      string | null;
    isSkipped:       boolean;
    isMarkedReview:  boolean;
  }>;
}

/** Read-only quiz-overview data shown on the confirm screen, before an
 *  attempt (and its time-limit clock) exists. */
export interface PracticePreview {
  subject:          { id: string; name: string };
  difficulty:       'EASY' | 'MEDIUM' | 'HARD';
  questionCount:    number;
  timeLimitSec:     number;
  totalMarks:       number;
  marksPerQuestion: number;
  negativeMarking:  boolean;
}

export interface SaveAnswerFeedback {
  ok:           boolean;
  isCorrect:    boolean | null;
  marksAwarded: number;
  feedback: {
    correctAnswer:  string | null;
    correctOptions: string[];
    correctBoolean: boolean | null;
    explanation:    string | null;
    options:        { letter: string; text: string }[];
  };
}

export interface PracticeResultAnswer {
  order:        number;
  questionId:   string;
  isCorrect:    boolean | null;
  marksAwarded: number;
  yourAnswer: {
    selectedOption:  string | null;
    selectedOptions: string[];
    textAnswer:      string | null;
    isSkipped:       boolean;
  };
  correct: {
    type:           string;
    correctAnswer:  string | null;
    correctOptions: string[];
    correctBoolean: boolean | null;
  };
  question: {
    prompt:      string;
    options:     { letter: string; text: string }[];
    marks:       number;
    difficulty:  string;
    explanation: string | null;
  };
}

export interface PracticeResult {
  attemptId:      string;
  score:          number;
  totalMarks:     number;
  percent:        number;
  correctAnswers: number;
  wrongAnswers:   number;
  skipped:        number;
  timeTakenSec:   number;
  answers:        PracticeResultAnswer[];
}

// ── Hook ──────────────────────────────────────────────────────────

export function usePracticeSubjects() {
  return useAsync<PracticeSubject[]>(() => api.get('/quizzes/subjects'), []);
}

// ── Olympiad ──────────────────────────────────────────────────────

export interface OlympiadAttemptData extends PracticeAttemptData {
  mode: 'OLYMPIAD';
  perSubject: number;
  distribution: { subjectId: string; subject: string; count: number }[];
}

export interface OlympiadAttemptSummary {
  attemptId:      string;
  attemptNumber:  number;
  status:         'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';
  score:          number;
  percentage:     number;
  correctAnswers: number;
  wrongAnswers:   number;
  skipped:        number;
  timeTakenSec:   number;
  startTime:      string;
  endTime:        string | null;
  quizTitle:      string;
  questionCount:  number;
}

export function useOlympiadAttempts() {
  return useAsync<OlympiadAttemptSummary[]>(() => api.get('/quizzes/olympiad/attempts'), []);
}

// ── API methods ───────────────────────────────────────────────────

export const practiceApi = {
  previewPractice: (data: { subjectExternalId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }) =>
    api.post<PracticePreview>('/quizzes/practice/preview', data),

  start: (data: { subjectExternalId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; chapterExternalId?: string }) =>
    api.post<PracticeAttemptData>('/quizzes/practice/start', data),

  startOlympiad: (data: { perSubject?: number } = {}) =>
    api.post<OlympiadAttemptData>('/quizzes/olympiad/start', data),

  saveAnswer: (
    attemptId: string,
    data: {
      questionId:      string;
      selectedOption?: string;
      selectedOptions?: string[];
      textAnswer?:     string;
      timeSpentSec?:   number;
      isSkipped?:      boolean;
    },
  ) => api.post<SaveAnswerFeedback>(`/quizzes/attempts/${attemptId}/answer`, data),

  submit: (attemptId: string, timeTakenSec?: number) =>
    api.post<PracticeResult>(`/quizzes/attempts/${attemptId}/submit`, { timeTakenSec }),

  getAttempt: (attemptId: string) =>
    api.get<PracticeAttemptData>(`/quizzes/attempts/${attemptId}`),
};
