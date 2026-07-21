import { api } from '../lib/api';

// ── Types for the assessment-taking flow ──────────────────────────

export interface AssessmentMeta {
  id:          string;
  title:       string;
  description: string | null;
  duration:    number;
  subject:     { id: string; name: string; slug: string } | null;
  passingMarks: number;
}

export interface OptionWithImage {
  text:     string;
  imageUrl: string | null;
}

export interface MatchPair {
  left:  string;
  right: string;
}

export interface TakeQuestion {
  order:           number;
  questionId:      string;
  type:            string;
  prompt:          string;
  promptImageUrl:  string | null;
  options:         OptionWithImage[] | null;
  matchPairs:      MatchPair[] | null;
  marks:           number;
}

export interface DraftSave {
  questionId:      string;
  selectedOption:  number | null;
  selectedOptions: number[];           // MCQ_MULTIPLE
  selectedBoolean: boolean | null;
  textAnswer:      string | null;
}

/** Returned by POST /assessments/:id/start when the attempt is still open. */
export interface TakeSubmission {
  id:          string;
  status:      string;
  startedAt:   string;
  expiresAt:   string;
  remainingSec: number;
  totalMarks:  number;
  assessment:  AssessmentMeta;
  questions:   TakeQuestion[];
  savedAnswers: DraftSave[];
  /** Last question the student was viewing — restored on resume. */
  currentQuestionIndex?: number;
}

/** One question in the post-submission results. */
export interface ResultQuestion {
  order:               number;
  questionId:          string;
  type:                string;
  prompt:              string;
  promptImageUrl:      string | null;
  options:             OptionWithImage[] | null;
  matchPairs:          MatchPair[] | null;
  marks:               number;
  yourAnswer: {
    selectedOption:  number | null;
    selectedOptions: number[];
    selectedBoolean: boolean | null;
    textAnswer:      string | null;
    timeMs:          number | null;
  } | null;
  // revealed after submission:
  correctAnswer?:      string | null;
  correctOptions?:     string[];
  correctBoolean?:     boolean | null;
  modelAnswer?:        string | null;
  explanation?:        string | null;
  explanationImageUrl?: string | null;
  isCorrect?:          boolean | null;
  marksAwarded?:       number;
}

/** Returned by POST /submissions/:id/submit  OR  GET /submissions/:id (after submission). */
export interface SubmissionResult {
  id:           string;
  status:       string;
  score:        number;
  totalMarks:   number;
  percent:      number;
  startedAt:    string;
  submittedAt:  string | null;
  timeTakenSec: number;
  assessment:   AssessmentMeta;
  questions:    ResultQuestion[];
  /** Only meaningful while status is IN_PROGRESS — used to rebuild the
   *  countdown deadline and restore the last-viewed question on refresh. */
  totalPausedSec?:       number;
  currentQuestionIndex?: number;
}

// ── API ───────────────────────────────────────────────────────────

export const assessmentTakeApi = {
  /** Start (or resume) an assessment.  Returns TakeSubmission when still open,
   *  or { autoSubmitted: true, submission: SubmissionResult } if time already expired. */
  start: (assessmentId: string) =>
    api.post<{ submission: TakeSubmission | SubmissionResult; autoSubmitted?: boolean }>(
      `/assessments/${assessmentId}/start`,
    ),

  /** Fetch a submission by id.  For IN_PROGRESS returns questions without answers.
   *  For SUBMITTED / GRADED reveals correct answers + explanations. */
  getById: (submissionId: string) =>
    api.get<SubmissionResult>(`/submissions/${submissionId}`),

  /** Autosave a single answer (fire-and-forget). */
  saveAnswer: (
    submissionId: string,
    data: {
      questionId:       string;
      selectedOption?:  number | null;
      selectedOptions?: number[];
      selectedBoolean?: boolean | null;
      textAnswer?:      string | null;
    },
  ) => api.post(`/submissions/${submissionId}/answer`, data),

  /** Finalize the attempt with all current answers. */
  submit: (submissionId: string, answers: DraftSave[]) =>
    api.post<SubmissionResult>(`/submissions/${submissionId}/submit`, { answers }),

  /** Debounced index-tracking ping (paused omitted) and the explicit Pause
   *  action (paused: true) share this call. */
  pause: (submissionId: string, data: { currentQuestionIndex: number; paused?: boolean }) =>
    api.post<{ ok: true }>(`/submissions/${submissionId}/pause`, data),
};
