import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

/**
 * Feature 12 (Practice Review & Mistake Analysis) — bookmarking a Question
 * found difficult while reviewing a past Practice Olympiad attempt. Backed
 * by the Bookmark model (schema.prisma) — one row per (studentId,
 * questionId), enforced unique so add/remove is an idempotent toggle, never
 * an append-only log.
 */
export const BookmarkService = {
  /** Every question id this student has bookmarked — the Review screen uses
   *  this to render bookmark state across all of an attempt's questions in
   *  one call, and to power the "Bookmarked" filter. */
  async list(studentId: string) {
    const rows = await prisma.bookmark.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { questionId: true, createdAt: true },
    });
    return rows;
  },

  async add(studentId: string, questionId: string) {
    const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!question) throw ApiError.notFound('Question not found');

    await prisma.bookmark.upsert({
      where: { studentId_questionId: { studentId, questionId } },
      create: { studentId, questionId },
      update: {},
    });
    return { ok: true, bookmarked: true };
  },

  async remove(studentId: string, questionId: string) {
    await prisma.bookmark.deleteMany({ where: { studentId, questionId } });
    return { ok: true, bookmarked: false };
  },
};
