/**
 * mysql2 connection pool — single source of truth for all DB access.
 * Replaces Prisma client. All queries use parameterised placeholders (? or named).
 */

import mysql, { type PoolConnection, type OkPacket, type RowDataPacket } from 'mysql2/promise';
import { logger } from '../utils/logger';

// ── Pool ─────────────────────────────────────────────────────────────

export const pool = mysql.createPool({
  host:               process.env.DB_HOST     ?? 'localhost',
  user:               process.env.DB_USER     ?? 'root',
  password:           process.env.DB_PASSWORD ?? '',
  database:           process.env.DB_NAME     ?? 'epoch_quiz',
  port:               Number(process.env.DB_PORT ?? 3306),
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           'Z',
  // Convert TINYINT(1) → boolean automatically
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1';
    }
    return next();
  },
});

// ── Query helpers (pool-level, non-transactional) ─────────────────────

/** Run a SELECT, return all rows typed as T. */
export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** Run a SELECT, return first row or null. */
export async function q1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** Run an INSERT / UPDATE / DELETE, return OkPacket. */
export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<OkPacket> {
  const [result] = await pool.query(sql, params);
  return result as OkPacket;
}

// ── Connection-scoped helpers (use INSIDE a transaction) ─────────────

export async function cq<T = Record<string, unknown>>(
  conn: PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await conn.query(sql, params);
  return rows as T[];
}

export async function cq1<T = Record<string, unknown>>(
  conn: PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await cq<T>(conn, sql, params))[0] ?? null;
}

export async function cr(
  conn: PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<OkPacket> {
  const [result] = await conn.query(sql, params);
  return result as OkPacket;
}

// ── Transaction helper ─────────────────────────────────────────────────

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── ID generation ──────────────────────────────────────────────────────

export { randomUUID as newId } from 'crypto';

// ── JSON helpers for LongText array/object fields ──────────────────────

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

// ── Lifecycle ─────────────────────────────────────────────────────────

export async function connectDatabase(): Promise<void> {
  const conn = await pool.getConnection();
  conn.release();
  logger.info('Database connected (mysql2)');
}

export async function disconnectDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database disconnected');
}
