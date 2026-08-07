import { prisma } from '../lib/prisma';
import { AttemptStatus, QuizType } from '../lib/enums';
import { parseStrArr, toJson } from '../utils/json';
import { AnalyticsService } from './analytics.service';
import { BookmarkService } from './bookmark.service';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';
import {
  REVISION_INTERVALS_DAYS, TOPIC_ACCURACY_THRESHOLD,
  PRIORITY_WEIGHTS, PRIORITY_THRESHOLDS,
} from '../config/revisionConfig';

/**
 * Feature 13: Revision Center & Spaced Revision.
 *
 * Owns the revision-queue/priority/schedule/streak *domain logic* only —
 * Practice-Olympiad-scoped, reusing Feature 7's getTopicBreakdown (topic
 * accuracy) and Feature 12's BookmarkService (bookmark state) rather than
 * recomputing either. Attempt creation/grading mechanics (the actual
 * "start a quiz" / "submit an attempt" primitives) stay owned by
 * quiz.service.ts, same as every other mode (Practice, Mixed, Olympiad,
 * Retry) — QuizService.startRevisionSession/submitAttempt call into this
 * service at exactly two hand-off points (see quiz.service.ts):
 *   1. getDueQuestionIds() when a Revision Session attempt is started.
 *   2. recordSessionCompletion() right after a Revision Session attempt is
 *      graded, reusing the grading result submitAttempt already computed —
 *      no second query.
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** intervalIndex → the due date that index represents, counted from `from`. */
function computeNextDueDate(intervalIndex: number, from: Date): Date {
  const idx = Math.min(intervalIndex, REVISION_INTERVALS_DAYS.length - 1);
  return new Date(from.getTime() + REVISION_INTERVALS_DAYS[idx] * 86_400_000);
}

// ── Priority scoring ──────────────────────────────────────────────────────
// Every sub-score is normalized to 0-100 before weighting (see
// revisionConfig.ts's PRIORITY_WEIGHTS, which sum to 1.0), so the final
// score is always 0-100 and the band cutoffs (PRIORITY_THRESHOLDS) are
// stable regardless of how extreme any one input gets.
//
//  - wrongCount:        +25 points per wrong revision attempt, capped at 100
//                        (4+ wrong attempts maxes this factor out).
//  - skipCount:         +20 points per skip, capped at 100 (5+ skips maxes out).
//  - daysSinceLastSeen: never revised (null) scores 100 (most urgent); else
//                        +5 points per day since last seen, capped at 100
//                        (20+ days maxes out).
//  - topicAccuracyGap:  0 if the topic is at/above TOPIC_ACCURACY_THRESHOLD;
//                        otherwise 2x the percentage-point gap below it,
//                        capped at 100 (a topic 50 points below threshold
//                        maxes out).
//  - bookmarked:        100 if bookmarked, 0 otherwise — a deliberate signal
//                        the student flagged this themselves.
export interface PriorityInput {
  wrongCount: number;
  skipCount: number;
  lastSeenAt: Date | null;
  topicAccuracy: number | null;
  isBookmarked: boolean;
}

export interface PriorityResult {
  score: number;
  label: 'HIGH' | 'MEDIUM' | 'LOW';
  emoji: string;
}

export function computePriority(input: PriorityInput): PriorityResult {
  const wrongScore = Math.min(100, input.wrongCount * 25);
  const skipScore = Math.min(100, input.skipCount * 20);

  const daysSinceLastSeen = input.lastSeenAt
    ? (Date.now() - input.lastSeenAt.getTime()) / 86_400_000
    : null;
  const recencyScore = daysSinceLastSeen === null ? 100 : Math.min(100, daysSinceLastSeen * 5);

  const topicGap = input.topicAccuracy !== null ? Math.max(0, TOPIC_ACCURACY_THRESHOLD - input.topicAccuracy) : 0;
  const topicGapScore = Math.min(100, topicGap * 2);

  const bookmarkScore = input.isBookmarked ? 100 : 0;

  const score = Math.round(
    wrongScore * PRIORITY_WEIGHTS.wrongCount
    + skipScore * PRIORITY_WEIGHTS.skipCount
    + recencyScore * PRIORITY_WEIGHTS.daysSinceLastSeen
    + topicGapScore * PRIORITY_WEIGHTS.topicAccuracyGap
    + bookmarkScore * PRIORITY_WEIGHTS.bookmarked,
  );

  const label: PriorityResult['label'] = score >= PRIORITY_THRESHOLDS.high ? 'HIGH' : score >= PRIORITY_THRESHOLDS.medium ? 'MEDIUM' : 'LOW';
  const emoji = label === 'HIGH' ? '🔴' : label === 'MEDIUM' ? '🟠' : '🟢';
  return { score, label, emoji };
}

// ── Queue generation (candidate discovery) ───────────────────────────────

/**
 * Idempotently ensures every current candidate question has a RevisionItem
 * row. A question is a candidate if, across the student's own Practice
 * Olympiad history (SUBMITTED, quizType !== OLYMPIAD — same scope as every
 * analytics feature), it was ever answered wrong, ever skipped, is
 * currently bookmarked, or belongs to a topic at/below
 * TOPIC_ACCURACY_THRESHOLD (Feature 7's getTopicBreakdown, reused as-is —
 * not recomputed here).
 *
 * "Avoid duplicates": only question ids with NO existing RevisionItem row
 * get one created — a question already being tracked keeps its existing
 * schedule untouched even if it resurfaces as a candidate again (e.g. wrong
 * a second time doesn't reset progress by itself; only an actual revision
 * answer does, via recordSessionCompletion).
 */
async function syncQueue(studentId: string): Promise<void> {
  const rows = await prisma.attemptAnswer.findMany({
    where: { attempt: { studentId, status: AttemptStatus.SUBMITTED, quiz: { quizType: { not: QuizType.OLYMPIAD } } } },
    select: { questionId: true, isCorrect: true, isSkipped: true, question: { select: { chapterExternalId: true } } },
  });
  if (!rows.length) return;

  const topics = await AnalyticsService.getTopicBreakdown(studentId);
  const weakChapterIds = new Set(topics.filter(t => t.accuracyPercent <= TOPIC_ACCURACY_THRESHOLD).map(t => t.topicId));

  const bookmarks = await BookmarkService.list(studentId);
  const bookmarkedIds = new Set(bookmarks.map(b => b.questionId));

  const reasonsByQuestion = new Map<string, Set<string>>();
  const addReason = (questionId: string, reason: string) => {
    const set = reasonsByQuestion.get(questionId) ?? new Set<string>();
    set.add(reason);
    reasonsByQuestion.set(questionId, set);
  };

  for (const r of rows) {
    if (r.isCorrect === false) addReason(r.questionId, 'WRONG');
    if (r.isSkipped) addReason(r.questionId, 'SKIPPED');
    if (r.question.chapterExternalId && weakChapterIds.has(r.question.chapterExternalId)) addReason(r.questionId, 'WEAK_TOPIC');
  }
  for (const questionId of bookmarkedIds) addReason(questionId, 'BOOKMARKED');

  if (!reasonsByQuestion.size) return;

  const candidateIds = [...reasonsByQuestion.keys()];
  const existing = await prisma.revisionItem.findMany({
    where: { studentId, questionId: { in: candidateIds } },
    select: { questionId: true },
  });
  const existingIds = new Set(existing.map(e => e.questionId));
  const newIds = candidateIds.filter(id => !existingIds.has(id));
  if (!newIds.length) return;

  const now = new Date();
  // A brand-new candidate is due immediately, not on Day 1 — it's already a
  // known problem area (wrong/skipped/bookmarked/weak-topic), so the point
  // is to surface it for revision right away. The Day 1/3/7/14/30 schedule
  // governs the gap AFTER each subsequent revision event (see
  // recordSessionCompletion's advance/reset via computeNextDueDate),
  // starting from intervalIndex 0 the first time it's actually revised.
  await prisma.revisionItem.createMany({
    data: newIds.map(questionId => ({
      studentId, questionId, intervalIndex: 0, nextDueAt: now,
      reasons: toJson([...reasonsByQuestion.get(questionId)!]),
    })),
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export type DueStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export interface RevisionQueueItem {
  id: string;
  questionId: string;
  prompt: string;
  difficulty: string;
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
  reasons: string[];
  intervalIndex: number;
  timesRevised: number;
  wrongCount: number;
  skipCount: number;
  lastResult: string | null;
  lastSeenAt: Date | null;
  nextDueAt: Date;
  dueStatus: DueStatus;
  bookmarked: boolean;
  priority: PriorityResult['label'];
  priorityScore: number;
}

async function getDashboard(studentId: string) {
  await syncQueue(studentId);

  const items = await prisma.revisionItem.findMany({
    where: { studentId },
    orderBy: { nextDueAt: 'asc' },
    include: {
      question: { select: { prompt: true, difficulty: true, subjectExternalId: true, chapterExternalId: true } },
    },
  });

  const now = new Date();
  const startToday = startOfDay(now);
  const endToday = new Date(startToday.getTime() + 86_400_000 - 1);

  const [topics, bookmarks, subjectNames] = await Promise.all([
    AnalyticsService.getTopicBreakdown(studentId),
    BookmarkService.list(studentId),
    ContentMeta.subjects(),
  ]);
  const topicAccuracyMap = new Map(topics.map(t => [t.topicId, t.accuracyPercent]));
  const topicNameMap = new Map(topics.map(t => [t.topicId, t.topicName]));
  const bookmarkedSet = new Set(bookmarks.map(b => b.questionId));

  const enriched: RevisionQueueItem[] = items.map(item => {
    const topicId = item.question.chapterExternalId;
    const topicAccuracy = topicId ? topicAccuracyMap.get(topicId) ?? null : null;
    const isBookmarked = bookmarkedSet.has(item.questionId);
    const priority = computePriority({
      wrongCount: item.wrongCount, skipCount: item.skipCount,
      lastSeenAt: item.lastSeenAt, topicAccuracy, isBookmarked,
    });
    const dueStatus: DueStatus = item.nextDueAt < startToday ? 'OVERDUE' : item.nextDueAt <= endToday ? 'DUE_TODAY' : 'UPCOMING';

    return {
      id: item.id,
      questionId: item.questionId,
      prompt: item.question.prompt,
      difficulty: item.question.difficulty,
      subject: item.question.subjectExternalId
        ? { id: item.question.subjectExternalId, name: subjectNames.get(item.question.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME }
        : null,
      topic: topicId ? { id: topicId, name: topicNameMap.get(topicId) ?? UNKNOWN_TOPIC_NAME } : null,
      reasons: parseStrArr(item.reasons),
      intervalIndex: item.intervalIndex,
      timesRevised: item.timesRevised,
      wrongCount: item.wrongCount,
      skipCount: item.skipCount,
      lastResult: item.lastResult,
      lastSeenAt: item.lastSeenAt,
      nextDueAt: item.nextDueAt,
      dueStatus,
      bookmarked: isBookmarked,
      priority: priority.label,
      priorityScore: priority.score,
    };
  });

  const dueToday = enriched.filter(i => i.dueStatus === 'DUE_TODAY').length;
  const overdue = enriched.filter(i => i.dueStatus === 'OVERDUE').length;
  const upcoming = enriched.filter(i => i.dueStatus === 'UPCOMING').length;

  const totalRevisionEvents = items.reduce((s, i) => s + i.timesRevised, 0);
  const totalWrongEvents = items.reduce((s, i) => s + i.wrongCount, 0);
  const totalSkipEvents = items.reduce((s, i) => s + i.skipCount, 0);
  const totalCorrectEvents = Math.max(0, totalRevisionEvents - totalWrongEvents - totalSkipEvents);
  const revisionAccuracyPercent = totalRevisionEvents > 0 ? round((totalCorrectEvents / totalRevisionEvents) * 100) : 0;

  // Topic Coverage — due (overdue + due today) items grouped by topic.
  const topicCoverageMap = new Map<string, { topicId: string; topicName: string; dueCount: number }>();
  for (const i of enriched) {
    if (!i.topic || i.dueStatus === 'UPCOMING') continue;
    const entry = topicCoverageMap.get(i.topic.id) ?? { topicId: i.topic.id, topicName: i.topic.name, dueCount: 0 };
    entry.dueCount += 1;
    topicCoverageMap.set(i.topic.id, entry);
  }
  const topicCoverage = [...topicCoverageMap.values()].sort((a, b) => b.dueCount - a.dueCount);

  const streak = await prisma.revisionStreakState.findUnique({ where: { studentId } });

  return {
    items: enriched,
    counts: {
      dueToday, overdue, upcoming,
      completedRevisions: totalRevisionEvents,
    },
    revisionAccuracyPercent,
    topicCoverage,
    streak: {
      currentStreak: streak?.currentStreak ?? 0,
      bestStreak: streak?.bestStreak ?? 0,
      totalSessions: streak?.totalSessions ?? 0,
      // Feature 14 (Achievements & Milestones) — used as the best-effort
      // "date earned" for revision-streak badges; already fetched on the
      // same row above, not a new query.
      lastSessionDate: streak?.lastSessionDate ?? null,
    },
  };
}

// ── Session start / completion (called from quiz.service.ts) ────────────

/** Question ids currently due (overdue + due today), syncing the queue
 *  first so a candidate that just became eligible is included. */
async function getDueQuestionIds(studentId: string): Promise<string[]> {
  await syncQueue(studentId);
  const now = new Date();
  const due = await prisma.revisionItem.findMany({
    where: { studentId, nextDueAt: { lte: now } },
    select: { questionId: true },
  });
  return due.map(d => d.questionId);
}

export interface RevisionResult {
  questionId: string;
  isCorrect: boolean | null;
  isSkipped: boolean;
}

/**
 * Applies the spaced-repetition advance/reset rule to every revised
 * question, then records one revision-streak "session". Called once per
 * submitted Revision Session attempt (see quiz.service.ts's submitAttempt),
 * reusing the grading results it already computed — no re-fetch of answers.
 *
 * Advance/reset rule: correct → advance one interval step (capped at the
 * last entry); wrong or skipped → reset to interval 0 (Day 1).
 */
async function recordSessionCompletion(studentId: string, results: RevisionResult[]): Promise<void> {
  if (!results.length) return;
  const now = new Date();

  const items = await prisma.revisionItem.findMany({
    where: { studentId, questionId: { in: results.map(r => r.questionId) } },
  });
  const byQuestionId = new Map(items.map(i => [i.questionId, i]));

  await prisma.$transaction(async (txc) => {
    for (const r of results) {
      const item = byQuestionId.get(r.questionId);
      if (!item) continue; // not a tracked revision item — nothing to update

      let nextIntervalIndex: number;
      let lastResult: string;
      if (r.isSkipped) {
        nextIntervalIndex = 0;
        lastResult = 'SKIPPED';
      } else if (r.isCorrect === true) {
        nextIntervalIndex = Math.min(item.intervalIndex + 1, REVISION_INTERVALS_DAYS.length - 1);
        lastResult = 'CORRECT';
      } else {
        nextIntervalIndex = 0;
        lastResult = 'WRONG';
      }

      await txc.revisionItem.update({
        where: { id: item.id },
        data: {
          intervalIndex: nextIntervalIndex,
          nextDueAt: computeNextDueDate(nextIntervalIndex, now),
          lastSeenAt: now,
          lastResult,
          timesRevised: { increment: 1 },
          ...(r.isSkipped ? { skipCount: { increment: 1 } } : {}),
          ...(r.isCorrect === false ? { wrongCount: { increment: 1 } } : {}),
        },
      });
    }

    // Revision streak — day-based, one increment per calendar day with at
    // least one submitted Revision Session (same day repeats don't
    // double-count), deliberately separate from Feature 9's practice streak.
    const existing = await txc.revisionStreakState.findUnique({ where: { studentId } });
    const today = startOfDay(now);
    const lastDay = existing?.lastSessionDate ? startOfDay(existing.lastSessionDate) : null;

    let currentStreak = existing?.currentStreak ?? 0;
    if (!lastDay) {
      currentStreak = 1;
    } else {
      const diffDays = Math.round((today.getTime() - lastDay.getTime()) / 86_400_000);
      if (diffDays === 1) currentStreak += 1;
      else if (diffDays > 1) currentStreak = 1;
      // diffDays === 0: same-day repeat session, streak unchanged.
    }
    const bestStreak = Math.max(existing?.bestStreak ?? 0, currentStreak);
    const totalSessions = (existing?.totalSessions ?? 0) + 1;

    await txc.revisionStreakState.upsert({
      where: { studentId },
      create: { studentId, currentStreak, bestStreak, totalSessions, lastSessionDate: now },
      update: { currentStreak, bestStreak, totalSessions, lastSessionDate: now },
    });
  });
}

export const RevisionService = {
  syncQueue,
  getDashboard,
  getDueQuestionIds,
  recordSessionCompletion,
  computePriority,
};
