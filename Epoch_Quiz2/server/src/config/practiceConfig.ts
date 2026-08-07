import { Difficulty } from '../lib/enums';

/**
 * Question count + time limit per difficulty for Subject Practice quizzes.
 * The client never chooses these — it only picks a difficulty, and this table
 * is the single source of truth for how many questions and how much time that
 * difficulty gets. Change values here only; no frontend change needed.
 *
 * questionCount is a *target*, not a guarantee — every selection site
 * (startPractice/startMixedPractice/pickMixedQuestions/preview*) already
 * bounds this against however many matching questions actually exist
 * (`Math.min(...)`/`.slice(...)`) rather than padding with duplicates, so a
 * subject/difficulty with fewer than 100 real questions simply serves all of
 * them — see quiz.service.ts.
 */
export const PracticeConfig: Record<Difficulty, { questionCount: number; timeLimitMinutes: number }> = {
  [Difficulty.EASY]:   { questionCount: 100, timeLimitMinutes: 30 },
  [Difficulty.MEDIUM]: { questionCount: 100, timeLimitMinutes: 30 },
  [Difficulty.HARD]:   { questionCount: 100, timeLimitMinutes: 30 },
};
