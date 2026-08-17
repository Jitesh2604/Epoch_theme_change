import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { SubmissionStatus } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';
import { SchoolPanelService } from './schoolPanel.service';
import type { Actor } from './assessment.service';

/**
 * School-level Analytics — the same shape of computations as the student
 * Analytics feature (server/src/services/analytics.service.ts: subject-
 * wise, difficulty-wise, topic-wise breakdowns, an accuracy trend), but
 * deliberately sourced from ASSESSMENT data (Submission/Answer/
 * AssessmentQuestionBank) rather than Practice Olympiad data (QuizAttempt/
 * AttemptAnswer/Question) — a School Admin cares how their students did on
 * official Assessments, not Practice, and those are two structurally
 * separate tables in this schema. The per-(dimension, answer) slicing
 * PATTERN is intentionally identical for consistency/maintainability; this
 * is an adaptation, not a copy of the Practice-only service (which this
 * file never imports from or duplicates the logic of at the SQL/Prisma
 * level — only the shape of the output mirrors it, per the request).
 */

const COUNTABLE = { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] };

function resultsVisibleFilter(): Prisma.AssessmentWhereInput {
  return { OR: [{ resultsPublished: true }, { resultPublishAt: { lte: new Date() } }] };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Answer.selectedOption/selectedBoolean/textAnswer/selectedOptions has no
 *  explicit "isSkipped" flag (unlike Practice's AttemptAnswer) — derived
 *  here the same way SubmissionService's own grading does: no response in
 *  any of the four answer fields means unanswered. Exported so
 *  schoolPanel.service.ts's per-submission correct/wrong/skipped counts
 *  (Student Details → Assessment Results tab) use this exact same rule
 *  rather than a second, possibly-drifting copy of it. */
export function wasAnswered(a: { selectedOption: number | null; selectedBoolean: boolean | null; textAnswer: string | null; selectedOptions: string }): boolean {
  if (a.selectedOption !== null) return true;
  if (a.selectedBoolean !== null) return true;
  if (a.textAnswer && a.textAnswer.trim()) return true;
  try {
    const arr = JSON.parse(a.selectedOptions || '[]');
    if (Array.isArray(arr) && arr.length > 0) return true;
  } catch { /* malformed/empty — treat as unanswered */ }
  return false;
}

async function fetchSchoolAnswerRows(schoolId: string, branchId?: string) {
  const studentFilter: Prisma.UserWhereInput = {
    studentProfile: { schoolId, ...(branchId && { branchId }) },
  };
  return prisma.answer.findMany({
    where: {
      submission: {
        status: COUNTABLE,
        assessment: resultsVisibleFilter(),
        student: studentFilter,
      },
    },
    select: {
      isCorrect: true, marksAwarded: true,
      selectedOption: true, selectedBoolean: true, textAnswer: true, selectedOptions: true,
      submissionId: true,
      submission: { select: { studentId: true, submittedAt: true, assessment: { select: { title: true } } } },
      question: { select: { subjectExternalId: true, chapterExternalId: true, bookExternalId: true, difficulty: true, marks: true } },
    },
  });
}

type SchoolAnswerRow = Awaited<ReturnType<typeof fetchSchoolAnswerRows>>[number];

interface Classified { correct: number; wrong: number; skipped: number; total: number }
function classify(rows: SchoolAnswerRow[]): Classified {
  let correct = 0, wrong = 0, skipped = 0;
  for (const r of rows) {
    if (!wasAnswered(r)) { skipped++; continue; }
    if (r.isCorrect === true) correct++;
    // Ungraded-but-answered (DESCRIPTIVE/MATCH_THE_COLUMN pending manual
    // grading, isCorrect === null) is folded in with "skipped" here — it's
    // neither a proven correct nor wrong answer yet, and doing so keeps
    // every chart's segments summing to the true total without inventing
    // a rarely-relevant 4th bucket.
    else wrong++;
  }
  return { correct, wrong, skipped, total: rows.length };
}
function accuracyOf(c: Classified): number {
  const answered = c.correct + c.wrong;
  return answered > 0 ? round((c.correct / answered) * 100) : 0;
}

export const SchoolAnalyticsService = {
  async overview(actor: Actor, branchId?: string) {
    const schoolId = await SchoolPanelService.resolveAdminSchool(actor);
    const rows = await fetchSchoolAnswerRows(schoolId, branchId);
    if (!rows.length) return { hasData: false as const };

    const bySubmission = new Map<string, { score: number; total: number }>();
    for (const r of rows) {
      const cur = bySubmission.get(r.submissionId) ?? { score: 0, total: 0 };
      cur.score += r.marksAwarded; cur.total += r.question.marks;
      bySubmission.set(r.submissionId, cur);
    }
    const submissions = [...bySubmission.values()];
    const totalScore = submissions.reduce((s, x) => s + x.score, 0);
    const totalPossible = submissions.reduce((s, x) => s + x.total, 0);
    const studentsAttempted = new Set(rows.map(r => r.submission.studentId)).size;
    const totalStudents = await prisma.studentProfile.count({ where: { schoolId, ...(branchId && { branchId }) } });

    const c = classify(rows);
    return {
      hasData: true as const,
      assessmentsAttempted: submissions.length,
      studentsAttempted,
      participationPercent: totalStudents > 0 ? round((studentsAttempted / totalStudents) * 100) : 0,
      averageScore: submissions.length ? round(totalScore / submissions.length) : 0,
      averagePercentage: totalPossible > 0 ? round((totalScore / totalPossible) * 100) : 0,
      totalCorrect: c.correct, totalWrong: c.wrong, totalSkipped: c.skipped,
      accuracyPercent: accuracyOf(c),
    };
  },

  async subjectBreakdown(actor: Actor, branchId?: string) {
    const schoolId = await SchoolPanelService.resolveAdminSchool(actor);
    const rows = await fetchSchoolAnswerRows(schoolId, branchId);
    if (!rows.length) return [];

    const bySubject = new Map<string, SchoolAnswerRow[]>();
    for (const r of rows) {
      const id = r.question.subjectExternalId ?? '__mixed__';
      const list = bySubject.get(id);
      if (list) list.push(r); else bySubject.set(id, [r]);
    }

    const subjectNames = await ContentMeta.subjects();
    return [...bySubject.entries()].map(([subjectId, subjectRows]) => {
      const c = classify(subjectRows);
      const scoreSum = subjectRows.reduce((s, r) => s + r.marksAwarded, 0);
      const marksSum = subjectRows.reduce((s, r) => s + r.question.marks, 0);
      return {
        subjectId,
        subjectName: subjectId === '__mixed__' ? 'Mixed / Unspecified' : (subjectNames.get(subjectId) ?? UNKNOWN_SUBJECT_NAME),
        totalQuestionsAttempted: c.total, totalCorrect: c.correct, totalWrong: c.wrong, totalSkipped: c.skipped,
        accuracyPercent: accuracyOf(c),
        averagePercentage: marksSum > 0 ? round((scoreSum / marksSum) * 100) : 0,
      };
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  },

  async difficultyBreakdown(actor: Actor, branchId?: string) {
    const schoolId = await SchoolPanelService.resolveAdminSchool(actor);
    const rows = await fetchSchoolAnswerRows(schoolId, branchId);
    if (!rows.length) return [];

    const byDifficulty = new Map<string, SchoolAnswerRow[]>();
    for (const r of rows) {
      const list = byDifficulty.get(r.question.difficulty);
      if (list) list.push(r); else byDifficulty.set(r.question.difficulty, [r]);
    }
    const ORDER = ['EASY', 'MEDIUM', 'HARD'];
    return ORDER.filter(d => byDifficulty.has(d)).map(difficulty => {
      const c = classify(byDifficulty.get(difficulty)!);
      return {
        difficulty, totalQuestionsAttempted: c.total, totalCorrect: c.correct, totalWrong: c.wrong, totalSkipped: c.skipped,
        accuracyPercent: accuracyOf(c),
      };
    });
  },

  async topicBreakdown(actor: Actor, branchId?: string) {
    const schoolId = await SchoolPanelService.resolveAdminSchool(actor);
    const rows = await fetchSchoolAnswerRows(schoolId, branchId);
    if (!rows.length) return [];

    const byTopic = new Map<string, SchoolAnswerRow[]>();
    const bookIdByTopic = new Map<string, string | null>();
    for (const r of rows) {
      if (!r.question.chapterExternalId) continue; // no chapter attribution — do not invent a bucket
      const id = r.question.chapterExternalId;
      const list = byTopic.get(id);
      if (list) list.push(r); else { byTopic.set(id, [r]); bookIdByTopic.set(id, r.question.bookExternalId); }
    }
    if (!byTopic.size) return [];

    const bookIds = [...new Set([...bookIdByTopic.values()].filter((id): id is string => !!id))];
    const chapterNames = await ContentMeta.chapterNames(bookIds);

    return [...byTopic.entries()].map(([topicId, topicRows]) => {
      const c = classify(topicRows);
      return {
        topicId, topicName: chapterNames.get(topicId) ?? UNKNOWN_TOPIC_NAME,
        totalQuestionsAttempted: c.total, totalCorrect: c.correct, totalWrong: c.wrong, totalSkipped: c.skipped,
        accuracyPercent: accuracyOf(c),
      };
    });
  },

  /** School-wide average percentage per assessment session, chronological
   *  by that session's earliest submission — "how is the school trending
   *  over time", the school-level analog of Practice's per-attempt
   *  accuracy trend. */
  async improvementTrend(actor: Actor, branchId?: string) {
    const schoolId = await SchoolPanelService.resolveAdminSchool(actor);
    const rows = await fetchSchoolAnswerRows(schoolId, branchId);
    if (!rows.length) return [];

    const bySession = new Map<string, { score: number; total: number; earliest: Date }>();
    const bySubmission = new Map<string, { score: number; total: number; title: string; submittedAt: Date }>();
    for (const r of rows) {
      const submittedAt = r.submission.submittedAt ?? new Date(0);
      const cur = bySubmission.get(r.submissionId) ?? { score: 0, total: 0, title: r.submission.assessment.title, submittedAt };
      cur.score += r.marksAwarded; cur.total += r.question.marks;
      bySubmission.set(r.submissionId, cur);
    }
    for (const sub of bySubmission.values()) {
      const cur = bySession.get(sub.title) ?? { score: 0, total: 0, earliest: sub.submittedAt };
      cur.score += sub.score; cur.total += sub.total;
      if (sub.submittedAt < cur.earliest) cur.earliest = sub.submittedAt;
      bySession.set(sub.title, cur);
    }

    return [...bySession.entries()]
      .map(([title, v]) => ({
        session: title,
        date: v.earliest,
        averagePercentage: v.total > 0 ? round((v.score / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  },

  /** Strong/weak topics — same min-2-answered-questions threshold as the
   *  student-facing deriveTopicInsights (client/src/lib/topicInsights.ts),
   *  applied here server-side since this aggregates many students' answers
   *  at once rather than one student's TopicStat[] client-side. */
  async topicInsights(actor: Actor, branchId?: string) {
    const topics = await this.topicBreakdown(actor, branchId);
    const eligible = topics.filter(t => t.totalQuestionsAttempted >= 2);
    const strongest = [...eligible].sort((a, b) => b.accuracyPercent - a.accuracyPercent).slice(0, 5);
    const weakest = [...eligible].sort((a, b) => a.accuracyPercent - b.accuracyPercent).slice(0, 5);
    return { strongest, weakest };
  },
};
