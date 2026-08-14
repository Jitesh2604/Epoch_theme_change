import { prisma } from '../lib/prisma';
import { AttemptStatus, QuizType, QuestionType } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';

/**
 * Student Analytics — Feature 1: Overall Performance Dashboard.
 *
 * Practice Olympiad only: single-subject Practice + Mixed Subjects Practice
 * (quiz.quizType !== OLYMPIAD), same definition as the "Practice Olympiad
 * Results" tab on the Results page — Attempt-Olympiad-mode history is
 * excluded, consistent with that mode having no entry point in the current
 * student UI. Never touches Submission (Assessment), leaderboard, or
 * admin-report data.
 *
 * Only SUBMITTED attempts count — IN_PROGRESS/ABANDONED attempts have no
 * real score/accuracy data and would skew every number below.
 *
 * Deliberately a single findMany + plain-JS reduce rather than several
 * aggregate/groupBy calls: per-student practice history is bounded in size,
 * so one query is both the simplest and the cheapest way to compute every
 * stat here without N+1s or duplicate round-trips — and it's trivially
 * extensible for later analytics phases that need the same rows sliced
 * differently.
 */

interface PracticeAttemptRow {
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  skipped: number;
  percentage: number;
  timeTakenSec: number;
  startTime: Date;
  quiz: { subjectExternalId: string | null };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Shared AttemptAnswer fetch for every per-question-level analytics feature
 * (Feature 2's subject breakdown, Feature 5's question-type breakdown, and
 * whatever comes after) — same scope as getPracticeOverview (SUBMITTED,
 * quizType !== OLYMPIAD), joined down to each question's subject/type/marks.
 * Extracted once two features needed the identical query, so "duplicate
 * database queries" means duplicate query *code*, not just duplicate
 * round-trips — each consumer still calls this once, independently, the
 * same "each analytics section is its own fetch" architecture as every
 * feature so far.
 */
async function fetchPracticeAnswerRows(studentId: string) {
  return prisma.attemptAnswer.findMany({
    where: {
      attempt: { studentId, status: AttemptStatus.SUBMITTED, quiz: { quizType: { not: QuizType.OLYMPIAD } } },
    },
    select: {
      isCorrect: true, isSkipped: true, marksAwarded: true, attemptId: true,
      attempt: { select: { startTime: true, timeTakenSec: true } },
      question: { select: { subjectExternalId: true, marks: true, type: true, difficulty: true, chapterExternalId: true, bookExternalId: true } },
    },
  });
}

type PracticeAnswerRow = Awaited<ReturnType<typeof fetchPracticeAnswerRows>>[number];

interface AttemptTotals { questionCount: number; timeTakenSec: number }

/** Per-attempt question count + timeTakenSec — used by every grouping
 *  (subject, question type, ...) to proportionally split a Mixed attempt's
 *  real total time across whichever dimension it touched in that attempt. */
function buildAttemptTotals(rows: PracticeAnswerRow[]): Map<string, AttemptTotals> {
  const attemptTotals = new Map<string, AttemptTotals>();
  for (const r of rows) {
    const cur = attemptTotals.get(r.attemptId);
    if (cur) cur.questionCount += 1;
    else attemptTotals.set(r.attemptId, { questionCount: 1, timeTakenSec: r.attempt.timeTakenSec });
  }
  return attemptTotals;
}

export const AnalyticsService = {
  async getPracticeOverview(studentId: string) {
    const rows: PracticeAttemptRow[] = await prisma.quizAttempt.findMany({
      where: {
        studentId,
        status: AttemptStatus.SUBMITTED,
        quiz: { quizType: { not: QuizType.OLYMPIAD } },
      },
      select: {
        score: true, correctAnswers: true, wrongAnswers: true, skipped: true,
        percentage: true, timeTakenSec: true, startTime: true,
        quiz: { select: { subjectExternalId: true } },
      },
    });

    if (!rows.length) return { hasData: false as const };

    const totalAttempts   = rows.length;
    const totalCorrect    = rows.reduce((s, r) => s + r.correctAnswers, 0);
    const totalWrong      = rows.reduce((s, r) => s + r.wrongAnswers, 0);
    const totalSkipped    = rows.reduce((s, r) => s + r.skipped, 0);
    const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

    const answered = totalCorrect + totalWrong;
    const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

    const totalScoreSum      = rows.reduce((s, r) => s + r.score, 0);
    const totalPercentageSum = rows.reduce((s, r) => s + r.percentage, 0);
    const averageScore       = round(totalScoreSum / totalAttempts);
    const bestScore          = Math.max(...rows.map(r => r.score));
    const lowestScore        = Math.min(...rows.map(r => r.score));
    const averagePercentage  = round(totalPercentageSum / totalAttempts);

    const totalPracticeTimeSec = rows.reduce((s, r) => s + r.timeTakenSec, 0);
    const averageTimePerQuestionSec = totalQuestionsAttempted > 0
      ? round(totalPracticeTimeSec / totalQuestionsAttempted)
      : 0;

    const startTimes = rows.map(r => r.startTime.getTime());
    const firstPracticeDate = new Date(Math.min(...startTimes));
    const lastPracticeDate  = new Date(Math.max(...startTimes));

    const subjectIds = new Set(
      rows.map(r => r.quiz.subjectExternalId).filter((id): id is string => id !== null),
    );
    const totalMixedPracticeAttempts = rows.filter(r => r.quiz.subjectExternalId === null).length;

    // Feature 4 (Speed & Time Analytics): longest/shortest single practice
    // session — attempt-level timeTakenSec/startTime/subject, already
    // present on `rows` above, just not previously picked out. Subject name
    // resolved via the same ContentMeta helper used throughout this file;
    // a Mixed attempt (no single subjectExternalId) is labelled accordingly
    // rather than misattributed to one subject.
    const subjectNames = await ContentMeta.subjects();
    const sessionLabel = (r: PracticeAttemptRow) => r.quiz.subjectExternalId
      ? (subjectNames.get(r.quiz.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME)
      : 'Mixed Subjects Practice';
    const toSession = (r: PracticeAttemptRow) => ({ subjectLabel: sessionLabel(r), date: r.startTime, durationSec: r.timeTakenSec });
    const longestSession  = toSession(rows.reduce((a, b) => (b.timeTakenSec > a.timeTakenSec ? b : a)));
    const shortestSession = toSession(rows.reduce((a, b) => (b.timeTakenSec < a.timeTakenSec ? b : a)));

    // Feature 6 (Accuracy Analytics): per-attempt accuracy, chronologically —
    // a genuinely different number from `accuracyPercent` above (which sums
    // correct/answered across ALL attempts combined). This is the ground
    // truth "attempt #1, #2, #3... in order" list everything else in this
    // feature (trend, consistency, distribution, recent windows) slices or
    // summarizes — computed once here from the same `rows`, no new query.
    const chronologicalRows = [...rows].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const rowAccuracy = (r: PracticeAttemptRow): number => {
      const ans = r.correctAnswers + r.wrongAnswers;
      return ans > 0 ? round((r.correctAnswers / ans) * 100) : 0;
    };
    const history = chronologicalRows.map(r => ({ date: r.startTime, accuracy: rowAccuracy(r) }));
    const accuracyValues = history.map(h => h.accuracy);

    const firstAttemptAccuracy = accuracyValues[0];
    const latestAttemptAccuracy = accuracyValues[accuracyValues.length - 1];
    const bestAccuracyAchieved = Math.max(...accuracyValues);
    const lowestAccuracyAchieved = Math.min(...accuracyValues);
    const averageAccuracyAcrossAttempts = round(accuracyValues.reduce((s, v) => s + v, 0) / accuracyValues.length);

    // Population standard deviation of per-attempt accuracy — the spread
    // "Accuracy Consistency" is rated on. See the 5-band thresholds in
    // client/src/lib/consistencyBand.ts (a documented design choice; the
    // request names the 5 labels but not numeric cutoffs, unlike the
    // accuracy/speed bands which had explicit percentages).
    const accuracyMean = accuracyValues.reduce((s, v) => s + v, 0) / accuracyValues.length;
    const variance = accuracyValues.reduce((s, v) => s + (v - accuracyMean) ** 2, 0) / accuracyValues.length;
    const accuracyStdDeviation = round(Math.sqrt(variance));

    // Fixed 5 bands, always present (zero-filled) so the UI can render all
    // 5 rows consistently regardless of what the student has actually hit.
    const DISTRIBUTION_BANDS = [
      { band: '90-100%', min: 90 },
      { band: '80-89%',  min: 80 },
      { band: '70-79%',  min: 70 },
      { band: '60-69%',  min: 60 },
      { band: 'Below 60%', min: -Infinity },
    ];
    const distribution = DISTRIBUTION_BANDS.map(({ band, min }, i) => {
      const max = i > 0 ? DISTRIBUTION_BANDS[i - 1].min : Infinity;
      const count = accuracyValues.filter(v => v >= min && v < max).length;
      return { band, count, percentage: round((count / accuracyValues.length) * 100) };
    });

    const windowStats = (n: number) => {
      const recent = history.slice(-n);
      const values = recent.map(h => h.accuracy);
      return {
        count: recent.length,
        averageAccuracy: round(values.reduce((s, v) => s + v, 0) / values.length),
        bestAccuracy: Math.max(...values),
        lowestAccuracy: Math.min(...values),
      };
    };
    const recentAccuracy = {
      last5:  windowStats(Math.min(5, history.length)),
      last10: history.length >= 10 ? windowStats(10) : null,
    };

    const accuracyTrend = {
      firstAttemptAccuracy,
      latestAttemptAccuracy,
      bestAccuracyAchieved,
      lowestAccuracyAchieved,
      averageAccuracyAcrossAttempts,
      accuracyStdDeviation,
      distribution,
      recentAccuracy,
      history,
    };

    return {
      hasData: true as const,
      totalAttempts,
      totalQuestionsAttempted,
      totalCorrect,
      totalWrong,
      totalSkipped,
      accuracyPercent,
      averageScore,
      bestScore,
      lowestScore,
      averagePercentage,
      totalPracticeTimeSec,
      averageTimePerQuestionSec,
      firstPracticeDate,
      lastPracticeDate,
      totalSubjectsPracticed: subjectIds.size,
      totalMixedPracticeAttempts,
      longestSession,
      shortestSession,
      accuracyTrend,
    };
  },

  /**
   * Feature 2: Subject-wise Performance.
   *
   * Aggregated at the AttemptAnswer (per-question) level, joined to
   * Question.subjectExternalId — NOT at the QuizAttempt/Quiz level like
   * getPracticeOverview above. A Mixed Subjects Practice attempt spans
   * several subjects in one QuizAttempt row, and Question.subjectExternalId
   * (set at question-creation time, independent of which quiz used it) is
   * the only ground truth for which subject each individual question
   * belongs to. This works uniformly for single-subject and Mixed
   * attempts alike: a single-subject attempt's questions all happen to
   * share one subject; a Mixed attempt's naturally split across several —
   * both fall out of the same grouping with no special-casing.
   *
   * Same one-query, plain-JS-reduce style as getPracticeOverview, and the
   * same scope (SUBMITTED, quizType !== OLYMPIAD). Two grouping passes over
   * the single result set:
   *   1. by attemptId — total question count + timeTakenSec per attempt,
   *      used to proportionally split a Mixed attempt's real (always
   *      populated) total time across the subjects it touched — there's no
   *      reliable per-question timing (AttemptAnswer.timeSpentSec is
   *      optional and rarely sent by the client).
   *   2. by (subjectExternalId, attemptId) — that subject's correct/wrong/
   *      skipped counts and marks *within that one attempt*, so a subject's
   *      average score/percentage/best-score reflect only its own
   *      questions, never a different subject's contribution from the same
   *      mixed attempt.
   */
  async getSubjectBreakdown(studentId: string) {
    const rows = await fetchPracticeAnswerRows(studentId);
    const attemptTotals = buildAttemptTotals(rows);

    // Group by (subject, attempt): this subject's slice of that attempt.
    interface SubjectAttemptSlice {
      subjectExternalId: string;
      attemptId: string;
      startTime: Date;
      correct: number; wrong: number; skipped: number;
      scoreInAttempt: number; marksInAttempt: number;
    }
    const slices = new Map<string, SubjectAttemptSlice>();
    for (const r of rows) {
      const subjectExternalId = r.question.subjectExternalId;
      if (subjectExternalId === null) continue; // defensive — shouldn't occur for Practice/Mixed
      const key = `${subjectExternalId}::${r.attemptId}`;
      let slice = slices.get(key);
      if (!slice) {
        slice = {
          subjectExternalId, attemptId: r.attemptId, startTime: r.attempt.startTime,
          correct: 0, wrong: 0, skipped: 0, scoreInAttempt: 0, marksInAttempt: 0,
        };
        slices.set(key, slice);
      }
      if (r.isSkipped) slice.skipped += 1;
      else if (r.isCorrect === true) slice.correct += 1;
      else if (r.isCorrect === false) slice.wrong += 1;
      slice.scoreInAttempt  += r.marksAwarded;
      slice.marksInAttempt  += r.question.marks;
    }

    // Group the per-(subject,attempt) slices by subject alone.
    const bySubject = new Map<string, SubjectAttemptSlice[]>();
    for (const slice of slices.values()) {
      const list = bySubject.get(slice.subjectExternalId);
      if (list) list.push(slice);
      else bySubject.set(slice.subjectExternalId, [slice]);
    }

    if (!bySubject.size) return [];

    const subjectNames = await ContentMeta.subjects();

    const result = [...bySubject.entries()].map(([subjectExternalId, subjectSlices]) => {
      const totalAttempts = subjectSlices.length;
      const totalCorrect  = subjectSlices.reduce((s, x) => s + x.correct, 0);
      const totalWrong    = subjectSlices.reduce((s, x) => s + x.wrong, 0);
      const totalSkipped  = subjectSlices.reduce((s, x) => s + x.skipped, 0);
      const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

      const answered = totalCorrect + totalWrong;
      const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

      const scores = subjectSlices.map(x => x.scoreInAttempt);
      const averageScore = round(scores.reduce((s, x) => s + x, 0) / totalAttempts);
      const bestScore     = Math.max(...scores);

      const percentages = subjectSlices.map(x => x.marksInAttempt > 0 ? (x.scoreInAttempt / x.marksInAttempt) * 100 : 0);
      const averagePercentage = round(percentages.reduce((s, x) => s + x, 0) / totalAttempts);

      const allocatedTimeSec = subjectSlices.reduce((s, x) => {
        const attempt = attemptTotals.get(x.attemptId)!;
        const questionsInThisSubjectForAttempt = x.correct + x.wrong + x.skipped;
        const share = attempt.questionCount > 0 ? questionsInThisSubjectForAttempt / attempt.questionCount : 0;
        return s + attempt.timeTakenSec * share;
      }, 0);
      const averageTimePerQuestionSec = totalQuestionsAttempted > 0
        ? round(allocatedTimeSec / totalQuestionsAttempted)
        : 0;

      const lastPracticeDate = new Date(Math.max(...subjectSlices.map(x => x.startTime.getTime())));

      // Feature 3 (Strength & Weakness Analysis) needs each subject's
      // accuracy on its chronologically first vs. latest attempt, to spot
      // improvement over time — computed here, from the same slices, rather
      // than a second query. Per-slice accuracy (not the whole attempt's,
      // for a Mixed attempt) so it reflects only this subject's questions.
      const chronological = [...subjectSlices].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const sliceAccuracy = (s: SubjectAttemptSlice) => {
        const ans = s.correct + s.wrong;
        return ans > 0 ? round((s.correct / ans) * 100) : 0;
      };
      const firstAttemptAccuracy  = sliceAccuracy(chronological[0]);
      const latestAttemptAccuracy = sliceAccuracy(chronological[chronological.length - 1]);

      // Feature 4 (Speed & Time Analytics): same idea, for time instead of
      // accuracy — this subject's time-per-question on its first vs. latest
      // attempt, reusing the same chronological array and the same
      // allocation-share formula as allocatedTimeSec above (evaluated on a
      // single slice instead of summed across all of them).
      const sliceTimePerQuestion = (s: SubjectAttemptSlice) => {
        const attempt = attemptTotals.get(s.attemptId)!;
        const questionsInSlice = s.correct + s.wrong + s.skipped;
        if (questionsInSlice === 0) return 0;
        const share = attempt.questionCount > 0 ? questionsInSlice / attempt.questionCount : 0;
        return round((attempt.timeTakenSec * share) / questionsInSlice);
      };
      const firstAttemptTimePerQuestionSec  = sliceTimePerQuestion(chronological[0]);
      const latestAttemptTimePerQuestionSec = sliceTimePerQuestion(chronological[chronological.length - 1]);

      return {
        subjectId:   subjectExternalId,
        subjectName: subjectNames.get(subjectExternalId) ?? UNKNOWN_SUBJECT_NAME,
        totalAttempts,
        totalQuestionsAttempted,
        totalCorrect,
        totalWrong,
        totalSkipped,
        accuracyPercent,
        averageScore,
        bestScore,
        averagePercentage,
        averageTimePerQuestionSec,
        lastPracticeDate,
        firstAttemptAccuracy,
        latestAttemptAccuracy,
        firstAttemptTimePerQuestionSec,
        latestAttemptTimePerQuestionSec,
      };
    });

    return result;
  },

  /**
   * Feature 2b: Subject × Question-Type Performance.
   *
   * Question-type accuracy broken down *within* each subject (e.g. "Maths →
   * MCQ: 88%, True/False: 76%"), so it can be shown inside each Subject-wise
   * Performance card instead of as its own cross-subject section (Feature 5
   * below stays a genuinely different, subject-agnostic aggregate — used
   * elsewhere, e.g. AI Learning Insights — not superseded by this).
   *
   * Same per-(dimension, attempt) slicing as getSubjectBreakdown/
   * getQuestionTypeBreakdown, just keyed on the (subject, type) pair
   * together so a Mixed attempt's questions land in the right subject *and*
   * the right type, never blended across subjects. A (subject, type)
   * combination only appears in the result if the student has actually
   * answered at least one question of that type in that subject — no
   * zero-filled/invented rows.
   */
  async getSubjectQuestionTypeBreakdown(studentId: string) {
    const rows = await fetchPracticeAnswerRows(studentId);

    interface SubjectTypeAttemptSlice {
      subjectExternalId: string;
      type: QuestionType;
      attemptId: string;
      correct: number; wrong: number; skipped: number;
    }
    const slices = new Map<string, SubjectTypeAttemptSlice>();
    for (const r of rows) {
      const subjectExternalId = r.question.subjectExternalId;
      if (subjectExternalId === null) continue; // defensive — shouldn't occur for Practice/Mixed
      const type = r.question.type;
      const key = `${subjectExternalId}::${type}::${r.attemptId}`;
      let slice = slices.get(key);
      if (!slice) {
        slice = { subjectExternalId, type, attemptId: r.attemptId, correct: 0, wrong: 0, skipped: 0 };
        slices.set(key, slice);
      }
      if (r.isSkipped) slice.skipped += 1;
      else if (r.isCorrect === true) slice.correct += 1;
      else if (r.isCorrect === false) slice.wrong += 1;
    }

    // Group the per-(subject,type,attempt) slices by (subject,type).
    const bySubjectType = new Map<string, SubjectTypeAttemptSlice[]>();
    for (const slice of slices.values()) {
      const key = `${slice.subjectExternalId}::${slice.type}`;
      const list = bySubjectType.get(key);
      if (list) list.push(slice);
      else bySubjectType.set(key, [slice]);
    }

    if (!bySubjectType.size) return [];

    const subjectNames = await ContentMeta.subjects();

    return [...bySubjectType.values()].map((typeSlices) => {
      const { subjectExternalId, type } = typeSlices[0];
      const totalCorrect = typeSlices.reduce((s, x) => s + x.correct, 0);
      const totalWrong   = typeSlices.reduce((s, x) => s + x.wrong, 0);
      const totalSkipped = typeSlices.reduce((s, x) => s + x.skipped, 0);
      const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

      const answered = totalCorrect + totalWrong;
      const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

      return {
        subjectId: subjectExternalId,
        subjectName: subjectNames.get(subjectExternalId) ?? UNKNOWN_SUBJECT_NAME,
        questionType: type,
        totalQuestionsAttempted,
        totalCorrect,
        totalWrong,
        totalSkipped,
        accuracyPercent,
      };
    });
  },

  /**
   * Feature 5: Question Type Analytics.
   *
   * Same idea as getSubjectBreakdown, grouped by Question.type instead of
   * Question.subjectExternalId — a single Practice/Mixed attempt can mix
   * question types just as freely as it can mix subjects (question
   * selection filters on `type: { in: GRADABLE_TYPES }`, not one type per
   * attempt), so this needs the identical per-(dimension, attempt) slicing,
   * not a simpler per-attempt aggregate. Reuses fetchPracticeAnswerRows/
   * buildAttemptTotals above — no new query shape, just a different
   * grouping key over the same rows.
   */
  async getQuestionTypeBreakdown(studentId: string) {
    const rows = await fetchPracticeAnswerRows(studentId);
    const attemptTotals = buildAttemptTotals(rows);

    interface TypeAttemptSlice {
      type: QuestionType;
      attemptId: string;
      startTime: Date;
      correct: number; wrong: number; skipped: number;
      scoreInAttempt: number; marksInAttempt: number;
    }
    const slices = new Map<string, TypeAttemptSlice>();
    for (const r of rows) {
      const type = r.question.type;
      const key = `${type}::${r.attemptId}`;
      let slice = slices.get(key);
      if (!slice) {
        slice = { type, attemptId: r.attemptId, startTime: r.attempt.startTime, correct: 0, wrong: 0, skipped: 0, scoreInAttempt: 0, marksInAttempt: 0 };
        slices.set(key, slice);
      }
      if (r.isSkipped) slice.skipped += 1;
      else if (r.isCorrect === true) slice.correct += 1;
      else if (r.isCorrect === false) slice.wrong += 1;
      slice.scoreInAttempt += r.marksAwarded;
      slice.marksInAttempt += r.question.marks;
    }

    const byType = new Map<QuestionType, TypeAttemptSlice[]>();
    for (const slice of slices.values()) {
      const list = byType.get(slice.type);
      if (list) list.push(slice);
      else byType.set(slice.type, [slice]);
    }

    if (!byType.size) return [];

    return [...byType.entries()].map(([type, typeSlices]) => {
      const totalAttempts = typeSlices.length;
      const totalCorrect  = typeSlices.reduce((s, x) => s + x.correct, 0);
      const totalWrong    = typeSlices.reduce((s, x) => s + x.wrong, 0);
      const totalSkipped  = typeSlices.reduce((s, x) => s + x.skipped, 0);
      const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

      const answered = totalCorrect + totalWrong;
      const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

      const scores = typeSlices.map(x => x.scoreInAttempt);
      const averageScore = round(scores.reduce((s, x) => s + x, 0) / totalAttempts);

      const sliceAccuracy = (s: TypeAttemptSlice) => {
        const ans = s.correct + s.wrong;
        return ans > 0 ? round((s.correct / ans) * 100) : 0;
      };
      const bestAccuracy = Math.max(...typeSlices.map(sliceAccuracy));

      const allocatedTimeSec = typeSlices.reduce((s, x) => {
        const attempt = attemptTotals.get(x.attemptId)!;
        const questionsInThisTypeForAttempt = x.correct + x.wrong + x.skipped;
        const share = attempt.questionCount > 0 ? questionsInThisTypeForAttempt / attempt.questionCount : 0;
        return s + attempt.timeTakenSec * share;
      }, 0);
      const averageTimePerQuestionSec = totalQuestionsAttempted > 0
        ? round(allocatedTimeSec / totalQuestionsAttempted)
        : 0;

      const lastAttemptDate = new Date(Math.max(...typeSlices.map(x => x.startTime.getTime())));

      // Chronological first/last accuracy — same pattern as
      // getSubjectBreakdown's improvement tracking, needed for the "accuracy
      // has improved over time" dynamic insight.
      const chronological = [...typeSlices].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const firstAttemptAccuracy  = sliceAccuracy(chronological[0]);
      const latestAttemptAccuracy = sliceAccuracy(chronological[chronological.length - 1]);

      return {
        questionType: type,
        totalAttempts,
        totalQuestionsAttempted,
        totalCorrect,
        totalWrong,
        totalSkipped,
        accuracyPercent,
        averageScore,
        bestAccuracy,
        averageTimePerQuestionSec,
        lastAttemptDate,
        firstAttemptAccuracy,
        latestAttemptAccuracy,
      };
    });
  },

  /**
   * Difficulty-wise Analytics (Answer Distribution + Difficulty Distribution
   * charts) — same idea and same per-(dimension, attempt) slicing as
   * getQuestionTypeBreakdown above, grouped by Question.difficulty (a
   * required, always-populated field — no null-skip needed, unlike chapter/
   * subject) instead of Question.type. Reuses fetchPracticeAnswerRows, which
   * already selects `difficulty` — no new query shape. Deliberately omits
   * time/score fields nothing currently asks for; add them the same way if a
   * future feature needs them, rather than speculatively including them now.
   */
  async getDifficultyBreakdown(studentId: string) {
    const rows = await fetchPracticeAnswerRows(studentId);

    interface DifficultyAttemptSlice {
      difficulty: string;
      attemptId: string;
      correct: number; wrong: number; skipped: number;
    }
    const slices = new Map<string, DifficultyAttemptSlice>();
    for (const r of rows) {
      const difficulty = r.question.difficulty;
      const key = `${difficulty}::${r.attemptId}`;
      let slice = slices.get(key);
      if (!slice) {
        slice = { difficulty, attemptId: r.attemptId, correct: 0, wrong: 0, skipped: 0 };
        slices.set(key, slice);
      }
      if (r.isSkipped) slice.skipped += 1;
      else if (r.isCorrect === true) slice.correct += 1;
      else if (r.isCorrect === false) slice.wrong += 1;
    }

    const byDifficulty = new Map<string, DifficultyAttemptSlice[]>();
    for (const slice of slices.values()) {
      const list = byDifficulty.get(slice.difficulty);
      if (list) list.push(slice);
      else byDifficulty.set(slice.difficulty, [slice]);
    }

    if (!byDifficulty.size) return [];

    // Fixed EASY -> MEDIUM -> HARD display order (a structural enum
    // ordering, not fabricated data) — only difficulties the student has
    // actually attempted appear at all.
    const ORDER = ['EASY', 'MEDIUM', 'HARD'];

    return ORDER
      .filter(d => byDifficulty.has(d))
      .map((difficulty) => {
        const difficultySlices = byDifficulty.get(difficulty)!;
        const totalCorrect = difficultySlices.reduce((s, x) => s + x.correct, 0);
        const totalWrong   = difficultySlices.reduce((s, x) => s + x.wrong, 0);
        const totalSkipped = difficultySlices.reduce((s, x) => s + x.skipped, 0);
        const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

        const answered = totalCorrect + totalWrong;
        const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

        return {
          difficulty,
          totalQuestionsAttempted,
          totalCorrect,
          totalWrong,
          totalSkipped,
          accuracyPercent,
        };
      });
  },

  /**
   * Feature 7: Topic-wise Analytics.
   *
   * The schema and Content API have no "Topic" level (confirmed against
   * prisma/schema.prisma and content.service.ts's own hierarchy comment:
   * boards/classes/subjects/series/books/chapters) — per the request's own
   * fallback instruction, Chapter is used as the Topic unit here.
   *
   * Same per-(dimension, attempt) slicing as getSubjectBreakdown/
   * getQuestionTypeBreakdown, grouped by Question.chapterExternalId instead —
   * a Mixed attempt spans chapters just as freely as subjects/types. Rows
   * with no chapter (chapterExternalId === null — some older seeded practice
   * data predates chapter tagging) are skipped rather than bucketed into an
   * invented "Unknown" topic, mirroring the existing null-subject skip above.
   */
  async getTopicBreakdown(studentId: string) {
    const rows = await fetchPracticeAnswerRows(studentId);
    const attemptTotals = buildAttemptTotals(rows);

    interface TopicAttemptSlice {
      chapterExternalId: string;
      bookExternalId: string | null;
      subjectExternalId: string | null;
      attemptId: string;
      startTime: Date;
      correct: number; wrong: number; skipped: number;
    }
    const slices = new Map<string, TopicAttemptSlice>();
    for (const r of rows) {
      const chapterExternalId = r.question.chapterExternalId;
      if (chapterExternalId === null) continue; // no chapter attribution — do not invent a bucket
      const key = `${chapterExternalId}::${r.attemptId}`;
      let slice = slices.get(key);
      if (!slice) {
        slice = {
          chapterExternalId, bookExternalId: r.question.bookExternalId,
          subjectExternalId: r.question.subjectExternalId,
          attemptId: r.attemptId, startTime: r.attempt.startTime,
          correct: 0, wrong: 0, skipped: 0,
        };
        slices.set(key, slice);
      }
      if (r.isSkipped) slice.skipped += 1;
      else if (r.isCorrect === true) slice.correct += 1;
      else if (r.isCorrect === false) slice.wrong += 1;
    }

    const byTopic = new Map<string, TopicAttemptSlice[]>();
    for (const slice of slices.values()) {
      const list = byTopic.get(slice.chapterExternalId);
      if (list) list.push(slice);
      else byTopic.set(slice.chapterExternalId, [slice]);
    }

    if (!byTopic.size) return [];

    const subjectNames = await ContentMeta.subjects();
    const bookIds = [...new Set([...byTopic.values()].flatMap(
      slices => slices.map(s => s.bookExternalId).filter((id): id is string => id !== null),
    ))];
    const chapterNames = await ContentMeta.chapterNames(bookIds);

    const sliceAccuracy = (s: TopicAttemptSlice) => {
      const ans = s.correct + s.wrong;
      return ans > 0 ? round((s.correct / ans) * 100) : 0;
    };

    return [...byTopic.entries()].map(([chapterExternalId, topicSlices]) => {
      const totalAttempts = topicSlices.length;
      const totalCorrect  = topicSlices.reduce((s, x) => s + x.correct, 0);
      const totalWrong    = topicSlices.reduce((s, x) => s + x.wrong, 0);
      const totalSkipped  = topicSlices.reduce((s, x) => s + x.skipped, 0);
      const totalQuestionsAttempted = totalCorrect + totalWrong + totalSkipped;

      const answered = totalCorrect + totalWrong;
      const accuracyPercent = answered > 0 ? round((totalCorrect / answered) * 100) : 0;

      const allocatedTimeSec = topicSlices.reduce((s, x) => {
        const attempt = attemptTotals.get(x.attemptId)!;
        const questionsInThisTopicForAttempt = x.correct + x.wrong + x.skipped;
        const share = attempt.questionCount > 0 ? questionsInThisTopicForAttempt / attempt.questionCount : 0;
        return s + attempt.timeTakenSec * share;
      }, 0);
      const averageTimePerQuestionSec = totalQuestionsAttempted > 0
        ? round(allocatedTimeSec / totalQuestionsAttempted)
        : 0;

      const lastPracticedDate = new Date(Math.max(...topicSlices.map(x => x.startTime.getTime())));

      // Chronological first/last accuracy — same pattern as
      // getSubjectBreakdown/getQuestionTypeBreakdown, feeds the "Topic
      // Improvement" ranking on the client.
      const chronological = [...topicSlices].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const firstAttemptAccuracy  = sliceAccuracy(chronological[0]);
      const latestAttemptAccuracy = sliceAccuracy(chronological[chronological.length - 1]);

      // A chapter belongs to exactly one subject, so any slice's
      // subjectExternalId is representative of the whole topic.
      const subjectExternalId = topicSlices[0].subjectExternalId;

      return {
        topicId: chapterExternalId,
        topicName: chapterNames.get(chapterExternalId) ?? UNKNOWN_TOPIC_NAME,
        subjectId: subjectExternalId,
        subjectName: subjectExternalId ? (subjectNames.get(subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : UNKNOWN_SUBJECT_NAME,
        totalAttempts,
        totalQuestionsAttempted,
        totalCorrect,
        totalWrong,
        totalSkipped,
        accuracyPercent,
        averageTimePerQuestionSec,
        lastPracticedDate,
        firstAttemptAccuracy,
        latestAttemptAccuracy,
      };
    });
  },
};
