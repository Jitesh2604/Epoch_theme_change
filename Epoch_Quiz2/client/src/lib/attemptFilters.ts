import type { PracticeResultAnswer } from '../hooks/usePracticeQuiz';

/**
 * Feature 12: Practice Review & Mistake Analysis — Review screen Filters +
 * Search. Pure predicate logic over the already-fetched
 * PracticeResultAnswer[] (from the existing GET /quizzes/attempts/:id
 * endpoint) — everything here is a client-side re-filter of data already in
 * memory, no new query per filter change.
 */

export type AnswerStatus = 'CORRECT' | 'WRONG' | 'SKIPPED';

export function answerStatus(a: PracticeResultAnswer): AnswerStatus {
  if (a.yourAnswer.isSkipped) return 'SKIPPED';
  return a.isCorrect ? 'CORRECT' : 'WRONG';
}

export interface AttemptFilterState {
  subjectId:      string | null;
  questionType:   string | null;
  difficulty:     string | null;
  status:         AnswerStatus | 'ALL';
  bookmarkedOnly: boolean;
  search:         string;
}

export const DEFAULT_ATTEMPT_FILTERS: AttemptFilterState = {
  subjectId: null, questionType: null, difficulty: null, status: 'ALL', bookmarkedOnly: false, search: '',
};

export function hasActiveFilters(filters: AttemptFilterState): boolean {
  return Boolean(
    filters.subjectId || filters.questionType || filters.difficulty
    || filters.status !== 'ALL' || filters.bookmarkedOnly || filters.search.trim(),
  );
}

export function filterAnswers(
  answers: PracticeResultAnswer[],
  filters: AttemptFilterState,
  isBookmarked: (questionId: string) => boolean,
): PracticeResultAnswer[] {
  const q = filters.search.trim().toLowerCase();

  return answers.filter(a => {
    if (filters.subjectId && a.question.subject?.id !== filters.subjectId) return false;
    if (filters.questionType && a.correct.type !== filters.questionType) return false;
    if (filters.difficulty && a.question.difficulty !== filters.difficulty) return false;
    if (filters.status !== 'ALL' && answerStatus(a) !== filters.status) return false;
    if (filters.bookmarkedOnly && !isBookmarked(a.questionId)) return false;

    if (q) {
      const haystack = [a.question.prompt, ...a.question.options.map(o => o.text)].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

/** Distinct subjects present in one attempt's answers, for the Subject filter
 *  dropdown — most attempts are single-subject (nothing to show), Mixed/
 *  Retry attempts can have several. */
export function distinctSubjects(answers: PracticeResultAnswer[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const a of answers) {
    if (a.question.subject) map.set(a.question.subject.id, a.question.subject.name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function distinctQuestionTypes(answers: PracticeResultAnswer[]): string[] {
  return [...new Set(answers.map(a => a.correct.type))];
}

export function distinctDifficulties(answers: PracticeResultAnswer[]): string[] {
  const order = ['EASY', 'MEDIUM', 'HARD'];
  return [...new Set(answers.map(a => a.question.difficulty))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
