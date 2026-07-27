import type { SubjectStat } from '../hooks/useStudentAnalytics';

/** Same shape as resultsSort.ts (a SORT_OPTIONS array + a sort function) but
 *  over SubjectStat's fields — kept as its own small utility rather than
 *  overloading resultsSort.ts, since the field set genuinely differs
 *  (accuracy/score/attempt-count/name vs. date/score/percent). */
export type SubjectSortKey =
  | 'highestAccuracy' | 'lowestAccuracy'
  | 'highestScore'
  | 'mostPracticed' | 'leastPracticed'
  | 'alphabetical';

export const SUBJECT_SORT_OPTIONS: { value: SubjectSortKey; label: string }[] = [
  { value: 'highestAccuracy', label: 'Highest Accuracy' },
  { value: 'lowestAccuracy',  label: 'Lowest Accuracy' },
  { value: 'highestScore',    label: 'Highest Average Score' },
  { value: 'mostPracticed',   label: 'Most Practiced' },
  { value: 'leastPracticed',  label: 'Least Practiced' },
  { value: 'alphabetical',    label: 'Alphabetical' },
];

export function sortSubjects(items: SubjectStat[], key: SubjectSortKey): SubjectStat[] {
  const sorted = [...items];
  switch (key) {
    case 'lowestAccuracy':  sorted.sort((a, b) => a.accuracyPercent - b.accuracyPercent); break;
    case 'highestScore':    sorted.sort((a, b) => b.averageScore - a.averageScore); break;
    case 'mostPracticed':   sorted.sort((a, b) => b.totalAttempts - a.totalAttempts); break;
    case 'leastPracticed':  sorted.sort((a, b) => a.totalAttempts - b.totalAttempts); break;
    case 'alphabetical':    sorted.sort((a, b) => a.subjectName.localeCompare(b.subjectName)); break;
    case 'highestAccuracy':
    default:                sorted.sort((a, b) => b.accuracyPercent - a.accuracyPercent); break;
  }
  return sorted;
}
