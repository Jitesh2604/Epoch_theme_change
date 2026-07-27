/**
 * Single source of truth mapping the raw QuestionType enum to display text.
 * Kept on the client, consistent with how other raw enums (quizType,
 * attempt status) already cross the wire as-is with the client owning
 * display text, rather than baking labels server-side.
 *
 * MATCH_THE_COLUMN/DESCRIPTIVE are Assessment-only (excluded from Practice/
 * Mixed question selection — see GRADABLE_TYPES in quiz.service.ts) and so
 * can't actually appear in this feature's data today, but are handled here
 * defensively rather than silently falling back to the raw enum string.
 */
export function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'MCQ_SINGLE':        return 'Multiple Choice (MCQ)';
    case 'MCQ_MULTIPLE':      return 'Multiple Choice (Multiple Answers)';
    case 'TRUE_FALSE':        return 'True / False';
    case 'FILL_IN_BLANK':     return 'Fill in the Blanks';
    case 'MATCH_THE_COLUMN':  return 'Match the Following';
    case 'DESCRIPTIVE':       return 'Descriptive';
    default:                  return type;
  }
}
