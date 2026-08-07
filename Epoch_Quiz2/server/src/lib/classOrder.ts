/**
 * Canonical academic ordering for classes/standards (Nursery → LKG → UKG →
 * Class 1 → … → Class 12), independent of whatever order the Content API
 * returns. catalog.service.ts previously sorted by the API's numeric
 * `order` field compared AS A STRING, which sorts "10" before "2" — a
 * curated, fixed sequence sidesteps that class of bug entirely. A class
 * name that isn't in this list sorts after every known class, alphabetically
 * among the unknowns — never fabricated a position, never dropped.
 *
 * Keep this file in sync with `client/src/lib/classOrder.ts`.
 */

export const CLASS_ORDER = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12',
] as const;

const CLASS_ORDER_INDEX = new Map(CLASS_ORDER.map((name, i) => [name.toLowerCase(), i]));

/** Comparator: known classes in curriculum order; unknown names sort after
 *  every known class, alphabetically among themselves. */
export function compareClassNames(a: string, b: string): number {
  const ai = CLASS_ORDER_INDEX.get(a.trim().toLowerCase());
  const bi = CLASS_ORDER_INDEX.get(b.trim().toLowerCase());
  if (ai !== undefined && bi !== undefined) return ai - bi;
  if (ai !== undefined) return -1;
  if (bi !== undefined) return 1;
  return a.localeCompare(b);
}

/** Sort any array of items by class name via a name-extractor — the one
 *  reusable helper every class list/dropdown/filter should route through.
 *  Returns a new array; never mutates the input. */
export function sortByClassName<T>(items: T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareClassNames(nameOf(a), nameOf(b)));
}
