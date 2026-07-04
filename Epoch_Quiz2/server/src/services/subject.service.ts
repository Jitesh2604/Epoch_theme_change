import { q, q1 } from '../lib/db';

export const SubjectService = {
  // Every active subject, including the special Olympiad "modes" (kind !=
  // SUBJECT). `kind` lets the client branch behaviour without hardcoding.
  async list() {
    return q<{ id: string; name: string; slug: string; kind: string }>(
      "SELECT id, name, slug, kind FROM subjects WHERE status = 'ACTIVE' ORDER BY serial ASC, name ASC",
    );
  },

  async findById(id: string) {
    return q1<{ id: string; name: string; slug: string; kind: string }>(
      'SELECT id, name, slug, kind FROM subjects WHERE id = ?',
      [id],
    );
  },
};
