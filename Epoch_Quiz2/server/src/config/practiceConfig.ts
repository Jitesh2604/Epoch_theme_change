import { Difficulty } from '../lib/enums';

/**
 * Question count + time limit per difficulty for Subject Practice quizzes.
 * The client never chooses these — it only picks a difficulty, and this table
 * is the single source of truth for how many questions and how much time that
 * difficulty gets. Change values here only; no frontend change needed.
 */
export const PracticeConfig: Record<Difficulty, { questionCount: number; timeLimitMinutes: number }> = {
  [Difficulty.EASY]:   { questionCount: 30, timeLimitMinutes: 30 },
  [Difficulty.MEDIUM]: { questionCount: 20, timeLimitMinutes: 30 },
  [Difficulty.HARD]:   { questionCount: 10, timeLimitMinutes: 30 },
};
