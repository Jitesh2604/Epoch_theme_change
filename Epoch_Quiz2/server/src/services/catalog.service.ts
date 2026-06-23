import { q, q1 } from '../lib/db';

export const CatalogService = {
  listBoards: () =>
    q<{ id: string; name: string }>(
      "SELECT id, name FROM boards WHERE status = 'ACTIVE' ORDER BY name ASC",
    ),

  listClasses: () =>
    q<{ id: string; name: string; serial: string | null }>(
      "SELECT id, name, serial FROM classes WHERE status = 'ACTIVE' ORDER BY serial ASC, name ASC",
    ),

  listSeries: () =>
    q<{ id: string; name: string }>(
      "SELECT id, name FROM series WHERE status = 'ACTIVE' ORDER BY name ASC",
    ),

  listBooks: (params: { boardId?: string; classId?: string; seriesId?: string }) => {
    const conditions: string[] = ["status = 'ACTIVE'"];
    const values: unknown[] = [];
    if (params.boardId)  { conditions.push('boardId = ?');  values.push(params.boardId); }
    if (params.classId)  { conditions.push('classId = ?');  values.push(params.classId); }
    if (params.seriesId) { conditions.push('seriesId = ?'); values.push(params.seriesId); }
    return q<{ id: string; name: string }>(
      `SELECT id, name FROM books WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      values,
    );
  },

  async resolveTeacherCode(code: string) {
    const teacher = await q1<{
      id: string; userId: string; boardId: string | null;
      teacherName: string;
      boardName: string | null;
    }>(
      `SELECT tp.id, tp.userId, tp.boardId,
              u.name AS teacherName,
              b.name AS boardName
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.userId
       LEFT JOIN boards b ON b.id = tp.boardId
       WHERE tp.teacherCode = ?`,
      [code],
    );
    if (!teacher) return null;

    const [classes, seriesList, books] = await Promise.all([
      q<{ name: string }>(
        `SELECT cl.name FROM teacher_classes tc
         JOIN classes cl ON cl.id = tc.classId
         WHERE tc.teacherProfileId = ?`,
        [teacher.id],
      ),
      q<{ name: string }>(
        `SELECT s.name FROM teacher_series ts
         JOIN series s ON s.id = ts.seriesId
         WHERE ts.teacherProfileId = ?`,
        [teacher.id],
      ),
      q<{ name: string }>(
        `SELECT bk.name FROM teacher_books tb
         JOIN books bk ON bk.id = tb.bookId
         WHERE tb.teacherProfileId = ?`,
        [teacher.id],
      ),
    ]);

    return {
      teacherCode: code,
      teacherName: teacher.teacherName,
      board:       teacher.boardId ? { id: teacher.boardId, name: teacher.boardName! } : null,
      classes:     classes.map((c: { name: string }) => c.name),
      series:      seriesList.map((s: { name: string }) => s.name),
      books:       books.map((b: { name: string }) => b.name),
    };
  },
};
