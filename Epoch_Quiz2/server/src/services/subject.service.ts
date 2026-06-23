import { q, q1 } from '../lib/db';

export const SubjectService = {
  async list() {
    return q<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM subjects ORDER BY name ASC',
    );
  },

  async findById(id: string) {
    return q1<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM subjects WHERE id = ?',
      [id],
    );
  },
};
