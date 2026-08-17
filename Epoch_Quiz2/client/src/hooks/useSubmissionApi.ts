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

/**
 * Where a just-finished Assessment attempt should send the student — the
 * Leaderboard's Session/Subject filters (see LeaderboardPage.tsx) are
 * driven by these same query params, not router `state`, specifically so
 * a page refresh still resolves the right ranking (state doesn't survive
 * a reload, the URL does). `session` matches on Assessment.title, the same
 * "session" concept LeaderboardService already ranks by — no new/duplicate
 * ranking lookup key is introduced here.
 */
export function leaderboardLinkForResult(result: { assessment: Pick<AssessmentMeta, 'title' | 'subject'> }): string {
  const params = new URLSearchParams();
  params.set('session', result.assessment.title);
  if (result.assessment.subject?.id) params.set('subject', result.assessment.subject.id);
  params.set('justSubmitted', '1');
  return `/leaderboard?${params.toString()}`;
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
  difficulty:          string;
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

/** Returned by POST /submissions/:id/submit  OR  GET /submissions/:id (after submission).
 *  Before results are published, score/totalMarks/percent/questions are
 *  withheld entirely by the backend — always branch on resultsVisible first. */
export interface SubmissionResult {
  id:           string;
  status:       string;
  score?:       number;
  totalMarks?:  number;
  percent?:     number;
  startedAt:    string;
  submittedAt:  string | null;
  timeTakenSec: number;
  resultsPublished: boolean;
  resultPublishAt:  string | null;
  resultsVisible:   boolean;
  assessment:   AssessmentMeta;
  questions?:   ResultQuestion[];
}

// ── API ───────────────────────────────────────────────────────────

export const assessmentTakeApi = {
  /** Start an assessment. Returns TakeSubmission when still open,
   *  or { autoSubmitted: true, submission: SubmissionResult } if time already expired. */
  start: async (assessmentId: string) => {
    const result = await api.post<{ submission: TakeSubmission | SubmissionResult; autoSubmitted?: boolean }>(
      `/assessments/${assessmentId}/start`,
    );
    // ── TEMPORARY CONTENT CLIENT DEBUG ──
    // Dev-only: server only includes this field when isDev, so it's simply
    // absent (and this never logs) in production. Never contains tokens,
    // passwords, or student-identifying data — just the raw
    // @epochstudio/content-client Subject record for this assessment.
    const debug = (result.submission as any)?.contentClientDebug;
    if (debug) console.log('[CONTENT-CLIENT DATA]', debug);
    // ── END TEMPORARY CONTENT CLIENT DEBUG ──
    return result;
  },

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
};
