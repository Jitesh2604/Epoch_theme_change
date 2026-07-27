import type { PracticeResultAnswer } from '../hooks/usePracticeQuiz';

/**
 * Feature 12: Practice Review & Mistake Analysis — Mistake Classification.
 *
 * Pure derivation over a single `PracticeResultAnswer` (already fetched by
 * the existing `GET /quizzes/attempts/:id` → buildResult() endpoint — no new
 * query). Deliberately does NOT rely on true per-question timing:
 * AttemptAnswer.timeSpentSec is optional and rarely populated (see
 * analytics.service.ts's own comment on this), so every rule below is built
 * only from fields that are always present — correctness, skip state,
 * selected vs. correct options, question difficulty, and the attempt's
 * overall time usage.
 *
 * Rules are checked in order; the first match wins. Documented here so the
 * classification is transparent rather than a black box:
 *
 *  1. Correct answer            → not a mistake (returns null).
 *  2. Skipped                   → "Skipped Question".
 *  3. MCQ_MULTIPLE, partial hit  → "Multiple Incorrect Selections" — at least
 *     one correct option was picked but the exact set didn't match, i.e. the
 *     student had the right idea but missed/over-selected options.
 *  4. Late in the attempt + most of the time budget already used →
 *     "Time Pressure" — a wrong answer near the end of a nearly-time-out
 *     attempt is plausibly a rushed guess, not a knowledge gap.
 *  5. Wrong answer on an EASY question → "Careless Mistake" — Easy questions
 *     are the ones a student who understands the material essentially always
 *     gets right, so a miss there reads as a slip rather than not knowing it.
 *  6. Everything else (wrong on MEDIUM/HARD, no other signal) →
 *     "Incorrect Concept".
 */

export type MistakeType =
  | 'Skipped Question'
  | 'Multiple Incorrect Selections'
  | 'Time Pressure'
  | 'Careless Mistake'
  | 'Incorrect Concept';

export interface MistakeClassification {
  type: MistakeType;
  explanation: string;
}

// Tunable, documented thresholds for the "Time Pressure" rule.
export const TIME_PRESSURE_THRESHOLDS = {
  /** Question must fall in the final X% of the attempt by order. */
  lateQuestionFraction: 0.75,
  /** Attempt must have used at least X% of its total time budget. */
  timeUsedFraction: 0.9,
} as const;

export interface AttemptTimingContext {
  totalQuestions: number;
  timeTakenSec: number;
  timeLimitSec: number | null;
}

export function classifyMistake(
  answer: PracticeResultAnswer,
  ctx: AttemptTimingContext,
): MistakeClassification | null {
  if (answer.isCorrect === true) return null;

  if (answer.yourAnswer.isSkipped) {
    return { type: 'Skipped Question', explanation: 'This question was left unanswered.' };
  }

  if (answer.correct.type === 'MCQ_MULTIPLE') {
    const correctSet = new Set(answer.correct.correctOptions);
    const selected = answer.yourAnswer.selectedOptions;
    if (selected.length && selected.some(s => correctSet.has(s))) {
      return {
        type: 'Multiple Incorrect Selections',
        explanation: 'Some, but not all, of the correct options were selected.',
      };
    }
  }

  if (ctx.timeLimitSec && ctx.totalQuestions > 0) {
    const isLateQuestion  = answer.order / ctx.totalQuestions >= TIME_PRESSURE_THRESHOLDS.lateQuestionFraction;
    const usedMostOfTime  = ctx.timeTakenSec / ctx.timeLimitSec >= TIME_PRESSURE_THRESHOLDS.timeUsedFraction;
    if (isLateQuestion && usedMostOfTime) {
      return {
        type: 'Time Pressure',
        explanation: 'This question came late in the attempt, after most of the allotted time had already been used.',
      };
    }
  }

  if (answer.question.difficulty === 'EASY') {
    return {
      type: 'Careless Mistake',
      explanation: 'An Easy-difficulty question was answered incorrectly — likely a slip rather than a knowledge gap.',
    };
  }

  return {
    type: 'Incorrect Concept',
    explanation: `A ${answer.question.difficulty.toLowerCase()}-difficulty question was answered incorrectly — likely a gap in understanding this concept.`,
  };
}
