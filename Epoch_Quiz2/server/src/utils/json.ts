/**
 * JSON helpers for the LongText columns that store JSON payloads as strings
 * (correctOptions, tags, selectedOptions, targetIds, matchPairs, sync stats).
 * Storage-agnostic — used by services regardless of the DB driver.
 */

/** Parse a LongText field that stores a JSON array of strings. */
export function parseStrArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  if (typeof val === 'string' && val.length > 0) {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p.filter((v): v is string => typeof v === 'string') : [];
    } catch { return []; }
  }
  return [];
}

/** Parse a LongText field that stores a JSON array of numbers. */
export function parseIntArr(val: unknown): number[] {
  if (Array.isArray(val)) return val.filter((v): v is number => typeof v === 'number');
  if (typeof val === 'string' && val.length > 0) {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p.filter((v): v is number => typeof v === 'number') : [];
    } catch { return []; }
  }
  return [];
}

/** Serialize an array/object to JSON string for LongText fields. */
export function toJson(val: unknown): string {
  return JSON.stringify(val ?? []);
}
