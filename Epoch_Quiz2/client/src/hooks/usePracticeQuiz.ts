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
  /** Last question the student was viewing — restored on resume. */
  currentQuestionIndex?: number;
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
    /** True once this question has been submitted (locked, graded) via
     *  saveAnswer — distinguishes a locked answer from an in-progress draft. */
    isSubmitted:          boolean;
    draftSelectedOption:  string | null;
    draftSelectedOptions: string[];
    draftTextAnswer:      string | null;
    isCorrect:    boolean | null;
    marksAwarded: number;
    /** Present only when isSubmitted — lets a resumed session show the same
     *  feedback panel a fresh submit would, without re-deriving grading. */
    feedback: SaveAnswerFeedback['feedback'] | null;
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
  /** Feature 12 — shown "if available" per the spec. Optional and often
   *  null: AttemptAnswer.timeSpentSec is rarely sent by the client, so this
   *  is a display-only value, never relied on for mistake classification. */
  timeSpentSec: number | null;
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
    /** Feature 12 (Practice Review & Mistake Analysis) — per-question
     *  subject, needed for the Review screen's Subject filter on Mixed/Retry
     *  attempts, which span more than one subject. Single-subject Practice
     *  attempts have the same subject on every question. */
    subject:     { id: string; name: string } | null;
  };
}

export interface PracticeResult {
  attemptId:      string;
  attemptNumber:  number;
  quiz: {
    id:       string;
    title:    string;
    quizType: string | null;
    subject:  { id: string; name: string } | null;
  };
  startTime:      string;
  endTime:        string | null;
  questionCount:  number;
  score:          number;
  totalMarks:     number;
  percent:        number;
  correctAnswers: number;
  wrongAnswers:   number;
  skipped:        number;
  timeTakenSec:   number;
  /** Feature 12 (Practice Review & Mistake Analysis) — the attempt's original
   *  time budget; feeds the mistake-classification engine's "Time Pressure"
   *  read. Null for attempt types with no time cap. */
  timeLimitSec:   number | null;
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
  quizType:       'PRACTICE' | 'OLYMPIAD' | 'CHAPTER_TEST' | 'MOCK_TEST' | 'LIVE_QUIZ' | 'ASSIGNMENT' | null;
  questionCount:  number;
  // Practice quizzes are single-subject; the mixed Olympiad set has no one
  // subject, so this is null there.
  subject:        { id: string; name: string } | null;
  /** Feature 12 (Practice Review & Mistake Analysis) — Attempt History's
   *  Difficulty column. 'MIXED' for retry sessions (which can span several
   *  difficulties); null only if the attempt somehow has no questions. */
  difficulty:     'EASY' | 'MEDIUM' | 'HARD' | 'MIXED' | null;
}

export function useOlympiadAttempts() {
  return useAsync<OlympiadAttemptSummary[]>(() => api.get('/quizzes/olympiad/attempts'), []);
}

// ── Paused attempts — "Resume Paused Quizzes" ──────────────────────
// Start Quiz / Attempt Olympiad never auto-resume these; resuming one is
// always an explicit click through this list. See quiz.service.ts's
// listPaused/discard — Start/Attempt always create a new attempt now.

export interface PausedAttempt {
  attemptId:            string;
  attemptNumber:        number;
  quiz: {
    id:       string;
    title:    string;
    quizType: 'PRACTICE' | 'OLYMPIAD' | 'CHAPTER_TEST' | 'MOCK_TEST' | 'LIVE_QUIZ' | 'ASSIGNMENT';
    subject:  { id: string; name: string } | null;
  };
  startTime:            string;
  pausedAt:             string | null;
  currentQuestionIndex: number;
  timeLimitSec:         number | null;
  questionCount:        number;
}

export function usePausedAttempts() {
  return useAsync<PausedAttempt[]>(() => api.get('/quizzes/attempts/paused'), []);
}

// ── API methods ───────────────────────────────────────────────────

export const practiceApi = {
  previewPractice: (data: { subjectExternalId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }) =>
    api.post<PracticePreview>('/quizzes/practice/preview', data),

  start: (data: { subjectExternalId: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; chapterExternalId?: string }) =>
    api.post<PracticeAttemptData>('/quizzes/practice/start', data),

  startOlympiad: (data: { perSubject?: number } = {}) =>
    api.post<OlympiadAttemptData>('/quizzes/olympiad/start', data),

  /** Mixed Subjects Practice — same contract as previewPractice/start, but
   *  never takes a subject: the server balances a pull across every
   *  eligible Practice subject instead. */
  previewMixedPractice: (data: { difficulty: 'EASY' | 'MEDIUM' | 'HARD' }) =>
    api.post<PracticePreview>('/quizzes/mixed-practice/preview', data),

  startMixedPractice: (data: { difficulty: 'EASY' | 'MEDIUM' | 'HARD' }) =>
    api.post<PracticeAttemptData>('/quizzes/mixed-practice/start', data),

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

  /** Debounced continuous autosave (paused omitted) and the explicit Pause
   *  action (paused: true) share this call. `draft` carries the current
   *  question's in-progress, not-yet-submitted selection, if any. */
  saveProgress: (
    attemptId: string,
    data: {
      currentQuestionIndex: number;
      paused?: boolean;
      draft?: {
        questionId:      string;
        selectedOption?: string;
        selectedOptions?: string[];
        textAnswer?:     string;
      };
    },
  ) => api.post<{ ok: true }>(`/quizzes/attempts/${attemptId}/progress`, data),

  /** Explicitly abandon a paused attempt — the "Discard" action. */
  discardAttempt: (attemptId: string) =>
    api.post<{ ok: true }>(`/quizzes/attempts/${attemptId}/discard`),

  /** Feature 12 (Practice Review & Mistake Analysis) — "Practice Incorrect
   *  Questions Again". Builds a new attempt from `attemptId`'s own
   *  wrong/skipped questions (scope applied server-side); returns the same
   *  shape startPractice/startMixedPractice do, so it plays through the
   *  existing PracticePlayPage with no changes there. */
  retryAttempt: (attemptId: string, scope: 'wrong' | 'skipped' | 'both' = 'both') =>
    api.post<PracticeAttemptData>(`/quizzes/attempts/${attemptId}/retry`, { scope }),
};
