import type { QuestionTypeStat } from '../hooks/useStudentAnalytics';

/** Same shape as subjectSort.ts (a SORT_OPTIONS array + a sort function),
 *  over QuestionTypeStat's field set instead — a new small, purpose-built
 *  utility rather than forcing a third differing field set through a
 *  shared sorter (see subjectSort.ts's own header comment for why this
 *  pattern is repeated per list rather than generalized). */
export type QuestionTypeSortKey =
  | 'highestAccuracy' | 'lowestAccuracy'
  | 'fastest' | 'slowest'
  | 'mostAttempted' | 'leastAttempted';

export const QUESTION_TYPE_SORT_OPTIONS: { value: QuestionTypeSortKey; label: string }[] = [
  { value: 'highestAccuracy', label: 'Highest Accuracy' },
  { value: 'lowestAccuracy',  label: 'Lowest Accuracy' },
  { value: 'fastest',         label: 'Fastest' },
  { value: 'slowest',         label: 'Slowest' },
  { value: 'mostAttempted',   label: 'Most Attempted' },
  { value: 'leastAttempted',  label: 'Least Attempted' },
];

export function sortQuestionTypes(items: QuestionTypeStat[], key: QuestionTypeSortKey): QuestionTypeStat[] {
  const sorted = [...items];
  switch (key) {
    case 'lowestAccuracy':  sorted.sort((a, b) => a.accuracyPercent - b.accuracyPercent); break;
    case 'fastest':         sorted.sort((a, b) => a.averageTimePerQuestionSec - b.averageTimePerQuestionSec); break;
    case 'slowest':         sorted.sort((a, b) => b.averageTimePerQuestionSec - a.averageTimePerQuestionSec); break;
    case 'mostAttempted':   sorted.sort((a, b) => b.totalAttempts - a.totalAttempts); break;
    case 'leastAttempted':  sorted.sort((a, b) => a.totalAttempts - b.totalAttempts); break;
    case 'highestAccuracy':
    default:                sorted.sort((a, b) => b.accuracyPercent - a.accuracyPercent); break;
  }
  return sorted;
}
