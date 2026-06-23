import { q, q1, run, newId, toJson } from '../lib/db';
import { NotificationType, NotificationTarget } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import type { Actor } from './assessment.service';

export interface CreateNotificationInput {
  title:       string;
  message:     string;
  type?:       NotificationType;
  target?:     NotificationTarget;
  targetIds?:  string[];
  scheduledAt?: Date | null;
}

export const NotificationService = {
  async create(_actor: Actor, input: CreateNotificationInput) {
    const id    = newId();
    const type  = input.type    ?? NotificationType.GENERAL;
    const target = input.target ?? NotificationTarget.ALL;
    await run(
      `INSERT INTO notifications (id, title, message, \`type\`, target, targetIds, scheduledAt, isSent, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [id, input.title, input.message, type, target, toJson(input.targetIds ?? []), input.scheduledAt ?? null],
    );
    return q1(
      'SELECT * FROM notifications WHERE id = ?', [id],
    );
  },

  async list(_actor: Actor, query: { page?: number; limit?: number; type?: NotificationType }) {
    const { page = 1, limit = 20, type } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const conds: string[] = [];
    const params: unknown[] = [];
    if (type) { conds.push('`type` = ?'); params.push(type); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [items, countRows] = await Promise.all([
      q(
        `SELECT * FROM notifications ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM notifications ${where}`,
        params,
      ),
    ]);
    const total = countRows[0]?.cnt ?? 0;
    return { items, meta: pageMeta(total, page, limit) };
  },

  async findById(_actor: Actor, id: string) {
    const n = await q1('SELECT * FROM notifications WHERE id = ?', [id]);
    if (!n) throw ApiError.notFound('Notification not found');
    return n;
  },

  async remove(_actor: Actor, id: string) {
    const n = await q1('SELECT id FROM notifications WHERE id = ?', [id]);
    if (!n) throw ApiError.notFound('Notification not found');
    await run('DELETE FROM notifications WHERE id = ?', [id]);
  },
};
