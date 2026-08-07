import { Difficulty } from '../lib/enums';
import type { Actor } from './assessment.service';

/**
 * Assessment API adapter — the seam between AssessmentService.list and
 * wherever "real" assessments actually come from.
 *
 * A definition is enough to materialize one real, gradable Assessment (title,
 * subject, difficulty, duration, target question count) — it is NOT the full
 * question bank. Question content still comes from this app's own generator
 * (see devAssessmentFallback.ts's materializeOneAssessment, shared by both
 * the dummy fallback and this API-sourced path) until the real Assessment API
 * also supplies real question content, at which point this shape — and how
 * materialization uses it — can change independently of everything else in
 * the Assessment module.
 */
export interface AssessmentApiDefinition {
  /** Stable id from the real API, used to keep materialization idempotent
   *  (never re-create the same assessment twice for the same student). */
  externalId: string;
  title: string;
  subjectName: string;
  subjectExternalId: string | null;
  difficulty: Difficulty;
  durationMinutes: number;
  questionCount: number;
}

/**
 * TEMPORARY, dev-only test lever — not part of the adapter's real contract,
 * and not read anywhere outside this file. Flip this constant and save (tsx
 * watch reloads the server) to exercise AssessmentService.list's two
 * source-selection branches without a real API to call:
 *   'empty'    → getAssessmentsFromApi() returns [] → dummy fallback shows.
 *   'has-data' → getAssessmentsFromApi() returns MOCK_ASSESSMENTS → only
 *                those show, no dummy fallback.
 * Delete this and MOCK_ASSESSMENTS once getAssessmentsFromApi is wired to a
 * real HTTP call — they exist purely to verify the source-selection logic
 * ahead of that.
 */
const DEV_MOCK_MODE: 'has-data' | 'empty' = 'empty';

const MOCK_ASSESSMENTS: AssessmentApiDefinition[] = [
  {
    externalId: 'mock-math-1', title: 'Math Assessment 1',
    subjectName: 'Mathematics', subjectExternalId: null,
    difficulty: Difficulty.EASY, durationMinutes: 45, questionCount: 100,
  },
  {
    externalId: 'mock-science-1', title: 'Science Assessment 1',
    subjectName: 'Science', subjectExternalId: null,
    difficulty: Difficulty.MEDIUM, durationMinutes: 45, questionCount: 100,
  },
  {
    externalId: 'mock-english-1', title: 'English Assessment 1',
    subjectName: 'English', subjectExternalId: null,
    difficulty: Difficulty.EASY, durationMinutes: 45, questionCount: 100,
  },
];

/**
 * STUB — the ONLY function that should need to change when the real
 * Assessment API is provided. Swap this body for a real HTTP call (or SDK
 * call, matching the ContentService pattern already used for the Content
 * API); everything downstream — materialization into real gradable
 * Assessment rows, listing, start, submit, admin review, publish, student
 * result — is unaffected by what this function does internally, as long as
 * it keeps returning `AssessmentApiDefinition[]`.
 *
 * No network call is made today. Defaults to returning no assessments, so
 * nothing about current student-facing behavior changes until this is
 * actually wired up.
 */
export async function getAssessmentsFromApi(_actor: Actor): Promise<AssessmentApiDefinition[]> {
  return DEV_MOCK_MODE === 'has-data' ? MOCK_ASSESSMENTS : [];
}
