import { Difficulty } from '../lib/enums';

/**
 * Default structure for an auto-generated Assessment — the single source
 * of truth for question count, marks, duration, and difficulty mix.
 * Mirrors PracticeConfig's "change values here only" convention
 * (server/src/config/practiceConfig.ts) for the Assessment side of the app.
 *
 * Consumed by AssessmentService.generate() (question selection, marks
 * distribution, duration) and exposed read-only via
 * GET /assessments/generate-config so the admin UI can render the current
 * numbers instead of hardcoding them. Nothing else in the app should ever
 * hardcode 30/100/60/20/5/5 — change them here only.
 */
export const ASSESSMENT_CONFIG = {
  totalQuestions: 30,
  totalMarks: 100,
  durationMinutes: 60,
  difficultyDistribution: {
    [Difficulty.EASY]: 20,
    [Difficulty.MEDIUM]: 5,
    [Difficulty.HARD]: 5,
  } as Record<Difficulty, number>,
};

/**
 * Fails at server startup (import time), not lazily on the first generate
 * request — a bad edit here should never be able to silently produce a
 * malformed Assessment (e.g. a difficulty mix that doesn't add up, or
 * marks so low a question would round down to 0).
 */
function assertValidAssessmentConfig(): void {
  const { totalQuestions, totalMarks, durationMinutes, difficultyDistribution } = ASSESSMENT_CONFIG;
  const parts = Object.entries(difficultyDistribution) as [Difficulty, number][];

  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
    throw new Error(`ASSESSMENT_CONFIG.totalQuestions must be a positive integer, got ${totalQuestions}`);
  }
  if (!Number.isInteger(totalMarks) || totalMarks <= 0) {
    throw new Error(`ASSESSMENT_CONFIG.totalMarks must be a positive integer, got ${totalMarks}`);
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`ASSESSMENT_CONFIG.durationMinutes must be a positive integer, got ${durationMinutes}`);
  }
  for (const [difficulty, count] of parts) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`ASSESSMENT_CONFIG.difficultyDistribution.${difficulty} must be a non-negative integer, got ${count}`);
    }
  }

  const sum = parts.reduce((s, [, count]) => s + count, 0);
  if (sum !== totalQuestions) {
    const breakdown = parts.map(([d, count]) => `${d.toLowerCase()}(${count})`).join(' + ');
    throw new Error(
      `ASSESSMENT_CONFIG is invalid: difficulty distribution ${breakdown} = ${sum}, but totalQuestions is ` +
      `${totalQuestions}. easy + medium + hard must equal totalQuestions.`
    );
  }

  // Every selected question must be worth at least 1 mark once totalMarks
  // is spread across totalQuestions (see distributeMarksEvenly in
  // assessment.service.ts) — otherwise some questions would round down to
  // 0 marks, an incorrect assessment.
  if (totalMarks < totalQuestions) {
    throw new Error(
      `ASSESSMENT_CONFIG is invalid: totalMarks (${totalMarks}) is less than totalQuestions (${totalQuestions}) — ` +
      `every question needs at least 1 mark, so totalMarks must be >= totalQuestions.`
    );
  }
}

assertValidAssessmentConfig();
