import { q, q1, run, newId, tx, cr, cq1 } from '../lib/db';
import { Role, UserStatus } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { hashPassword, comparePassword } from '../utils/password';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { suggestStateBoard } from '../lib/educationBoards';
import type { DbUser } from './auth.service';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  UpdateProfileInput,
  ChangePasswordInput,
  ListUsersQuery,
  ListProfilesQuery,
} from '../validators/user.validator';

export interface PublicUser {
  id:              string;
  name:            string;
  email:           string;
  role:            Role;
  status:          UserStatus;
  avatarHue:       number;
  profileComplete: boolean;
  createdAt:       Date;
  updatedAt:       Date;
  mobileNo?:       string | null;
}

function toPublicUser(u: DbUser): PublicUser {
  return {
    id:              u.id,
    name:            u.name,
    email:           u.email,
    role:            u.role,
    status:          u.status,
    avatarHue:       u.avatarHue,
    profileComplete: Boolean(u.profileComplete),
    createdAt:       u.createdAt,
    updatedAt:       u.updatedAt,
    mobileNo:        u.mobileNo ?? null,
  };
}

export const UserService = {
  async list(query: ListUsersQuery) {
    const { page, limit, role, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const conds: string[] = [];
    const params: unknown[] = [];
    if (role)   { conds.push('u.role = ?');   params.push(role); }
    if (status) { conds.push('u.status = ?'); params.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [users, countRows] = await Promise.all([
      q<DbUser>(
        `SELECT u.* FROM users u ${where} ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM users u ${where}`, params),
    ]);

    const ids = users.map(u => u.id);
    const [teachers, students] = ids.length
      ? await Promise.all([
          q<{ userId: string } & Record<string, unknown>>(
            `SELECT * FROM teacher_profiles WHERE userId IN (?)`, [ids],
          ),
          q<{ userId: string } & Record<string, unknown>>(
            `SELECT * FROM student_profiles WHERE userId IN (?)`, [ids],
          ),
        ])
      : [[], []];

    const tpByUser = new Map(teachers.map(t => [t.userId, t]));
    const spByUser = new Map(students.map(s => [s.userId, s]));

    const items = users.map(u => ({
      ...toPublicUser(u),
      ...(tpByUser.has(u.id) ? { teacherProfile: tpByUser.get(u.id) } : {}),
      ...(spByUser.has(u.id) ? { studentProfile: spByUser.get(u.id) } : {}),
    }));

    return { items, meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
  },

  async findById(id: string) {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw ApiError.notFound('User not found');

    const [tp, sp] = await Promise.all([
      q1('SELECT * FROM teacher_profiles WHERE userId = ?', [id]),
      q1('SELECT * FROM student_profiles WHERE userId = ?',  [id]),
    ]);

    return {
      ...toPublicUser(user),
      ...(tp ? { teacherProfile: tp } : {}),
      ...(sp ? { studentProfile: sp } : {}),
    };
  },

  async create(input: AdminCreateUserInput): Promise<PublicUser> {
    const existing = await q1('SELECT id FROM users WHERE email = ?', [input.email]);
    if (existing) throw ApiError.conflict('Email is already registered');

    const passwordHash = await hashPassword(input.password);
    const userId       = newId();
    const avatarHue    = input.avatarHue ?? Math.floor(Math.random() * 360);
    const userStatus   = input.status ?? UserStatus.ACTIVE;

    await run(
      `INSERT INTO users (id, email, passwordHash, name, role, status, avatarHue, profileComplete, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [userId, input.email, passwordHash, input.name, input.role, userStatus, avatarHue],
    );

    if (input.role === Role.TEACHER) {
      await run(
        'INSERT INTO teacher_profiles (id, userId, schoolName, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
        [newId(), userId, input.schoolName ?? null],
      );
    } else if (input.role === Role.STUDENT) {
      await run(
        'INSERT INTO student_profiles (id, userId, schoolName, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
        [newId(), userId, input.schoolName ?? null],
      );
    }

    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    return toPublicUser(user!);
  },

  async update(id: string, input: AdminUpdateUserInput): Promise<PublicUser> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw ApiError.notFound('User not found');

    if (input.email && input.email !== user.email) {
      const taken = await q1('SELECT id FROM users WHERE email = ?', [input.email]);
      if (taken) throw ApiError.conflict('Email is already in use');
    }

    const sets: string[] = ['updatedAt = NOW()'];
    const vals: unknown[] = [];
    if (input.name      !== undefined) { sets.push('name = ?');      vals.push(input.name); }
    if (input.email     !== undefined) { sets.push('email = ?');     vals.push(input.email); }
    if (input.status    !== undefined) { sets.push('status = ?');    vals.push(input.status); }
    if (input.avatarHue !== undefined) { sets.push('avatarHue = ?'); vals.push(input.avatarHue); }
    vals.push(id);

    await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);

    if (user.role === Role.TEACHER && (input.schoolName !== undefined || input.bio !== undefined)) {
      const tSets = ['updatedAt = NOW()'];
      const tVals: unknown[] = [];
      if (input.schoolName !== undefined) { tSets.push('schoolName = ?'); tVals.push(input.schoolName ?? null); }
      if (input.bio        !== undefined) { tSets.push('bio = ?');        tVals.push(input.bio ?? null); }
      tVals.push(id);
      await run(
        `INSERT INTO teacher_profiles (id, userId, schoolName, createdAt, updatedAt)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE ${tSets.join(', ')}`,
        [newId(), id, input.schoolName ?? null, ...tVals],
      );
    }

    if (user.role === Role.STUDENT && (input.schoolName !== undefined || (input as any).teacherCode !== undefined)) {
      const sSets = ['updatedAt = NOW()'];
      const sVals: unknown[] = [];
      if (input.schoolName !== undefined) { sSets.push('schoolName = ?'); sVals.push(input.schoolName ?? null); }
      if ((input as any).teacherCode !== undefined) { sSets.push('teacherCode = ?'); sVals.push((input as any).teacherCode ?? null); }
      sVals.push(id);
      await run(
        `INSERT INTO student_profiles (id, userId, schoolName, createdAt, updatedAt)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE ${sSets.join(', ')}`,
        [newId(), id, input.schoolName ?? null, ...sVals],
      );
    }

    const updated = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    return toPublicUser(updated!);
  },

  async deactivate(id: string): Promise<PublicUser> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) throw ApiError.notFound('User not found');

    await run("UPDATE users SET status = 'INACTIVE', updatedAt = NOW() WHERE id = ?", [id]);
    await run('UPDATE refresh_tokens SET revokedAt = NOW() WHERE userId = ? AND revokedAt IS NULL', [id]);

    const updated = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    return toPublicUser(updated!);
  },

  async updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw ApiError.notFound('User not found');

    // 1. Update user scalars
    const uSets: string[] = ['profileComplete = 1', 'updatedAt = NOW()'];
    const uVals: unknown[] = [];
    if (input.name      !== undefined) { uSets.push('name = ?');      uVals.push(input.name); }
    if (input.avatarHue !== undefined) { uSets.push('avatarHue = ?'); uVals.push(input.avatarHue); }
    uVals.push(userId);
    await run(`UPDATE users SET ${uSets.join(', ')} WHERE id = ?`, uVals);

    const dob = input.dob !== undefined
      ? (input.dob ? new Date(input.dob + 'T00:00:00.000Z') : null)
      : undefined;

    const existingState = input.state !== undefined ? input.state : null;
    const boardFields: Record<string, unknown> = {};
    if (input.educationBoard !== undefined) {
      boardFields.educationBoard = input.educationBoard;
      boardFields.stateBoard = input.educationBoard === 'STATE_BOARD'
        ? (input.stateBoard?.trim() || suggestStateBoard(existingState) || null)
        : null;
    } else if (input.stateBoard !== undefined) {
      boardFields.stateBoard = input.stateBoard?.trim() || null;
    }

    const sharedFields: Record<string, unknown> = {
      ...(dob           !== undefined && { dob }),
      ...(input.schoolName !== undefined && { schoolName: input.schoolName }),
      ...(input.address    !== undefined && { address:    input.address }),
      ...(input.country    !== undefined && { country:    input.country }),
      ...(input.state      !== undefined && { state:      input.state }),
      ...(input.city       !== undefined && { city:       input.city }),
      ...(input.zip        !== undefined && { zip:        input.zip }),
      ...(input.imageUrl   !== undefined && { imageUrl:   input.imageUrl }),
      ...boardFields,
    };

    if (user.role === Role.TEACHER) {
      const teacherFields: Record<string, unknown> = {
        ...sharedFields,
        ...(input.boardId !== undefined && { boardId: input.boardId }),
        ...(input.bio     !== undefined && { bio:     input.bio }),
      };

      const tp = await q1<{ id: string }>('SELECT id FROM teacher_profiles WHERE userId = ?', [userId]);
      if (tp) {
        const tSets = Object.keys(teacherFields).map(k => `${k} = ?`);
        tSets.push('updatedAt = NOW()');
        await run(
          `UPDATE teacher_profiles SET ${tSets.join(', ')} WHERE userId = ?`,
          [...Object.values(teacherFields), userId],
        );
      } else {
        const cols = ['id', 'userId', ...Object.keys(teacherFields), 'createdAt', 'updatedAt'];
        const placeholders = cols.map(() => '?').join(', ');
        await run(
          `INSERT INTO teacher_profiles (${cols.join(', ')}) VALUES (${placeholders})`,
          [newId(), userId, ...Object.values(teacherFields), new Date(), new Date()],
        );
      }

      const tpFresh = await q1<{ id: string }>('SELECT id FROM teacher_profiles WHERE userId = ?', [userId]);
      if (tpFresh) {
        if (input.classIds !== undefined) {
          await run('DELETE FROM teacher_classes WHERE teacherProfileId = ?', [tpFresh.id]);
          for (const classId of input.classIds) {
            await run('INSERT IGNORE INTO teacher_classes (teacherProfileId, classId) VALUES (?, ?)', [tpFresh.id, classId]);
          }
        }
        if (input.subjectIds !== undefined) {
          await run('DELETE FROM teacher_subjects WHERE teacherProfileId = ?', [tpFresh.id]);
          for (const subjectId of input.subjectIds) {
            await run('INSERT IGNORE INTO teacher_subjects (teacherProfileId, subjectId) VALUES (?, ?)', [tpFresh.id, subjectId]);
          }
        }
        if (input.seriesIds !== undefined) {
          await run('DELETE FROM teacher_series WHERE teacherProfileId = ?', [tpFresh.id]);
          for (const seriesId of input.seriesIds) {
            await run('INSERT IGNORE INTO teacher_series (teacherProfileId, seriesId) VALUES (?, ?)', [tpFresh.id, seriesId]);
          }
        }
        if (input.bookIds !== undefined) {
          await run('DELETE FROM teacher_books WHERE teacherProfileId = ?', [tpFresh.id]);
          for (const bookId of input.bookIds) {
            await run('INSERT IGNORE INTO teacher_books (teacherProfileId, bookId) VALUES (?, ?)', [tpFresh.id, bookId]);
          }
        }
      }
    }

    if (user.role === Role.STUDENT) {
      let inheritedBoardId:  string | null | undefined;
      let inheritedClassId:  string | null | undefined;
      let inheritedSeriesId: string | null | undefined;
      let inheritedBookIds:  string[] | undefined;
      let normalizedCode:    string | null | undefined = input.teacherCode;

      if (input.teacherCode != null && input.teacherCode.trim() !== '') {
        const code    = input.teacherCode.trim().toUpperCase();
        const teacher = await q1<{
          id: string; boardId: string | null;
        }>('SELECT id, boardId FROM teacher_profiles WHERE teacherCode = ?', [code]);
        if (!teacher) throw ApiError.badRequest('Invalid teacher code. Please check the code with your teacher.');

        normalizedCode    = code;
        inheritedBoardId  = teacher.boardId ?? null;

        const [firstClass, firstSeries, allBooks] = await Promise.all([
          q1<{ classId: string }>('SELECT classId FROM teacher_classes WHERE teacherProfileId = ? LIMIT 1', [teacher.id]),
          q1<{ seriesId: string }>('SELECT seriesId FROM teacher_series WHERE teacherProfileId = ? LIMIT 1', [teacher.id]),
          q<{ bookId: string }>('SELECT bookId FROM teacher_books WHERE teacherProfileId = ?', [teacher.id]),
        ]);
        inheritedClassId  = firstClass?.classId  ?? null;
        inheritedSeriesId = firstSeries?.seriesId ?? null;
        inheritedBookIds  = allBooks.map(b => b.bookId);
      }

      const studentFields: Record<string, unknown> = {
        ...sharedFields,
        ...(normalizedCode    !== undefined && { teacherCode: normalizedCode }),
        ...(inheritedBoardId  !== undefined
          ? { boardId:  inheritedBoardId }
          : input.boardId  !== undefined && { boardId:  input.boardId  }),
        ...(input.classId !== undefined
          ? { classId:  input.classId }
          : inheritedClassId !== undefined && { classId: inheritedClassId }),
        ...(inheritedSeriesId !== undefined
          ? { seriesId: inheritedSeriesId }
          : input.seriesId !== undefined && { seriesId: input.seriesId }),
      };

      const sp = await q1<{ id: string }>('SELECT id FROM student_profiles WHERE userId = ?', [userId]);
      if (sp) {
        const sSets = Object.keys(studentFields).map(k => `${k} = ?`);
        sSets.push('updatedAt = NOW()');
        await run(
          `UPDATE student_profiles SET ${sSets.join(', ')} WHERE userId = ?`,
          [...Object.values(studentFields), userId],
        );
      } else {
        const cols = ['id', 'userId', ...Object.keys(studentFields), 'createdAt', 'updatedAt'];
        const placeholders = cols.map(() => '?').join(', ');
        await run(
          `INSERT INTO student_profiles (${cols.join(', ')}) VALUES (${placeholders})`,
          [newId(), userId, ...Object.values(studentFields), new Date(), new Date()],
        );
      }

      const spFresh = await q1<{ id: string }>('SELECT id FROM student_profiles WHERE userId = ?', [userId]);
      const bookIds = inheritedBookIds !== undefined ? inheritedBookIds : input.bookIds;
      if (spFresh && bookIds !== undefined) {
        await run('DELETE FROM student_books WHERE studentProfileId = ?', [spFresh.id]);
        for (const bookId of bookIds) {
          await run('INSERT IGNORE INTO student_books (studentProfileId, bookId) VALUES (?, ?)', [spFresh.id, bookId]);
        }
      }

      // Student ↔ Subjects (many-to-many). Only real subjects (kind = SUBJECT)
      // can be selected — the Olympiad "modes" are never studied subjects.
      if (spFresh && input.subjectIds !== undefined) {
        await run('DELETE FROM student_subjects WHERE studentProfileId = ?', [spFresh.id]);
        if (input.subjectIds.length) {
          const real = await q<{ id: string }>(
            "SELECT id FROM subjects WHERE id IN (?) AND kind = 'SUBJECT'", [input.subjectIds],
          );
          for (const r of real) {
            await run('INSERT IGNORE INTO student_subjects (studentProfileId, subjectId) VALUES (?, ?)', [spFresh.id, r.id]);
          }
        }
      }
    }

    const updatedUser = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    return toPublicUser(updatedUser!);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await q1<DbUser>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw ApiError.notFound('User not found');

    const ok = await comparePassword(input.currentPassword, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Current password is incorrect');

    const passwordHash = await hashPassword(input.newPassword);
    await tx(async conn => {
      await cr(conn, 'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE id = ?', [passwordHash, userId]);
      await cr(conn, 'UPDATE refresh_tokens SET revokedAt = NOW() WHERE userId = ? AND revokedAt IS NULL', [userId]);
    });
  },

  async listTeachers(query: ListProfilesQuery) {
    const { page, limit, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const conds: string[] = ["u.role = 'TEACHER'"];
    const params: unknown[] = [];
    if (status) { conds.push('u.status = ?'); params.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [rows, countRows] = await Promise.all([
      q<DbUser & { schoolName: string | null; bio: string | null; assessmentCount: number }>(
        `SELECT u.*, tp.schoolName, tp.bio,
                (SELECT COUNT(*) FROM assessments a WHERE a.createdById = u.id) AS assessmentCount
         FROM users u
         LEFT JOIN teacher_profiles tp ON tp.userId = u.id
         ${where} ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM users u ${where}`, params),
    ]);

    const items = rows.map(u => ({
      id:          u.id,
      name:        u.name,
      email:       u.email,
      schoolName:  u.schoolName ?? null,
      bio:         u.bio ?? null,
      assessments: Number(u.assessmentCount ?? 0),
      students:    0,
      status:      u.status,
      joinedAt:    u.createdAt,
      avatarHue:   u.avatarHue,
    }));

    return { items, meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
  },

  async listStudents(query: ListProfilesQuery) {
    const { page, limit, status, search } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const conds: string[] = ["u.role = 'STUDENT'"];
    const params: unknown[] = [];
    if (status) { conds.push('u.status = ?'); params.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [rows, countRows] = await Promise.all([
      q<DbUser & { schoolName: string | null; teacherCode: string | null; submissionCount: number }>(
        `SELECT u.*, sp.schoolName, sp.teacherCode,
                (SELECT COUNT(*) FROM submissions s WHERE s.studentId = u.id) AS submissionCount
         FROM users u
         LEFT JOIN student_profiles sp ON sp.userId = u.id
         ${where} ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`,
        [...params, take, skip],
      ),
      q<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM users u ${where}`, params),
    ]);

    const ids = rows.map(r => r.id);
    const [aggs, allTotals] = ids.length
      ? await Promise.all([
          q<{ studentId: string; totalScore: number; totalMarks: number }>(
            `SELECT studentId,
                    SUM(score)      AS totalScore,
                    SUM(totalMarks) AS totalMarks
             FROM submissions
             WHERE studentId IN (?) AND status IN ('SUBMITTED','GRADED')
             GROUP BY studentId`,
            [ids],
          ),
          q<{ studentId: string; totalScore: number }>(
            `SELECT studentId, SUM(score) AS totalScore
             FROM submissions
             WHERE status IN ('SUBMITTED','GRADED')
             GROUP BY studentId
             ORDER BY totalScore DESC`,
          ),
        ])
      : [[], []];

    const aggById  = new Map(aggs.map(a => [a.studentId, a]));
    const rankById = new Map((allTotals as { studentId: string }[]).map((r, i) => [r.studentId, i + 1]));

    const items = rows.map(u => {
      const agg      = aggById.get(u.id);
      const score    = Number(agg?.totalScore ?? 0);
      const total    = Number(agg?.totalMarks ?? 0);
      const avgScore = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
      return {
        id:          u.id,
        name:        u.name,
        email:       u.email,
        schoolName:  u.schoolName  ?? null,
        teacherCode: u.teacherCode ?? null,
        attempted:   Number(u.submissionCount ?? 0),
        avgScore,
        rank:        rankById.get(u.id) ?? 0,
        status:      u.status,
        joinedAt:    u.createdAt,
        avatarHue:   u.avatarHue,
      };
    });

    return { items, meta: pageMeta(countRows[0]?.cnt ?? 0, page, limit) };
  },
};
