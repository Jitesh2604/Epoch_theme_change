/** Generic sort for any result-like history list (score + percentage + a
 *  date). Callers supply field getters instead of this module knowing about
 *  a specific shape, so it can be reused wherever a results list needs the
 *  same "marks / percentage / date" ordering — Practice Olympiad today,
 *  future result lists (e.g. Assessment, once that reappears) later. */
export type ResultsSortKey =
  | 'newest' | 'oldest'
  | 'highestScore' | 'lowestScore'
  | 'highestPercent' | 'lowestPercent';

export const RESULTS_SORT_OPTIONS: { value: ResultsSortKey; label: string }[] = [
  { value: 'newest',         label: 'Newest First' },
  { value: 'oldest',         label: 'Oldest First' },
  { value: 'highestScore',   label: 'Highest Marks' },
  { value: 'lowestScore',    label: 'Lowest Marks' },
  { value: 'highestPercent', label: 'Highest Percentage' },
  { value: 'lowestPercent',  label: 'Lowest Percentage' },
];

export function sortResults<T>(
  items: T[],
  key: ResultsSortKey,
  getters: {
    date:    (item: T) => string | number | Date;
    score:   (item: T) => number;
    percent: (item: T) => number;
  },
): T[] {
  const sorted = [...items];
  switch (key) {
    case 'oldest':         sorted.sort((a, b) => +new Date(getters.date(a)) - +new Date(getters.date(b))); break;
    case 'highestScore':   sorted.sort((a, b) => getters.score(b) - getters.score(a)); break;
    case 'lowestScore':    sorted.sort((a, b) => getters.score(a) - getters.score(b)); break;
    case 'highestPercent': sorted.sort((a, b) => getters.percent(b) - getters.percent(a)); break;
    case 'lowestPercent':  sorted.sort((a, b) => getters.percent(a) - getters.percent(b)); break;
    case 'newest':
    default:               sorted.sort((a, b) => +new Date(getters.date(b)) - +new Date(getters.date(a))); break;
  }
  return sorted;
}
