import { prisma } from '../lib/prisma';
import { UserStatus, type Difficulty, type QuestionType } from '../lib/enums';
import { ContentMeta, UNKNOWN_SUBJECT_NAME, UNKNOWN_TOPIC_NAME } from './content.service';
import {
  fetchAnswers, buildSubmissionTotals, isAnswerBlank, round,
  type AssessmentAnalyticsFilters, type AssessmentAnswerRow,
} from './assessmentAnalyticsShared.service';

/**
 * Admin Analytics — Feature 5: Assessment Question Analysis.
 *
 * Mirrors questionAnalytics.service.ts (Feature 4) exactly, over Assessment's
 * Answer/AssessmentQuestionBank rows instead of Practice's AttemptAnswer/
 * Question rows — same per-question grouping technique, same proportional
 * time-allocation math (buildSubmissionTotals is the direct analogue of
 * buildAttemptTotals). The output is field-for-field the same shape as
 * QuestionOverviewRow (client/src/hooks/useQuestionAnalytics.ts) so the
 * client can pass this array, unmodified, straight into the existing
 * classifyQuestionQuality()/buildQuestionInsights() — genuine reuse of the
 * Question Analytics engine, not a re-implementation.
 *
 * "Skipped" uses isAnswerBlank() (see assessmentAnalyticsShared.service.ts)
 * since Answer has no isSkipped column. Answers still awaiting manual
 * grading (DESCRIPTIVE/MATCH_THE_COLUMN, attempted but isCorrect still
 * null) are tracked separately as pendingGrading and excluded from the
 * success/wrong-rate denominators until graded.
 */

export type AssessmentQuestionAnalyticsFilters = AssessmentAnalyticsFilters;

export interface AssessmentQuestionOverviewRow {
  questionId: string;
  promptPreview: string;
  subjectId: string | null;
  subjectName: string;
  chapterId: string | null;
  chapterName: string | null;
  difficulty: string;
  questionType: string;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  pendingGrading: number;
  successRatePercent: number;
  wrongRatePercent: number;
  skipRatePercent: number;
  totalTimeSpentSec: number;
  averageTimeSpentSec: number;
  lastAttemptedDate: Date;
}

interface QuestionAcc {
  questionId: string;
  subjectExternalId: string | null;
  chapterExternalId: string | null;
  bookExternalId: string | null;
  difficulty: string;
  questionType: string;
  prompt: string;
  correct: number; wrong: number; skipped: number; pending: number;
  timeSpentSec: number;
  lastAttemptedDate: Date;
}

async function getQuestionOverview(filters: AssessmentQuestionAnalyticsFilters): Promise<AssessmentQuestionOverviewRow[]> {
  const rows: AssessmentAnswerRow[] = await fetchAnswers(filters);
  if (!rows.length) return [];

  const submissionTotals = buildSubmissionTotals(rows);

  const byQuestion = new Map<string, QuestionAcc>();
  for (const r of rows) {
    let acc = byQuestion.get(r.questionId);
    if (!acc) {
      acc = {
        questionId: r.questionId,
        subjectExternalId: r.question.subjectExternalId,
        chapterExternalId: r.question.chapterExternalId,
        bookExternalId: r.question.bookExternalId,
        difficulty: r.question.difficulty,
        questionType: r.question.type,
        prompt: r.question.prompt,
        correct: 0, wrong: 0, skipped: 0, pending: 0, timeSpentSec: 0,
        lastAttemptedDate: r.submission.startedAt,
      };
      byQuestion.set(r.questionId, acc);
    }

    const blank = isAnswerBlank(r);
    if (blank) acc.skipped += 1;
    else if (r.isCorrect === true) acc.correct += 1;
    else if (r.isCorrect === false) acc.wrong += 1;
    else acc.pending += 1; // isCorrect === null and answered -> awaiting manual grade

    const totals = submissionTotals.get(r.submissionId)!;
    acc.timeSpentSec += totals.questionCount > 0 ? totals.timeTakenSec / totals.questionCount : 0;

    if (r.submission.startedAt > acc.lastAttemptedDate) acc.lastAttemptedDate = r.submission.startedAt;
  }

  const [subjectNames, chapterNames] = await Promise.all([
    ContentMeta.subjects(),
    ContentMeta.chapterNames([...new Set([...byQuestion.values()].map(a => a.bookExternalId).filter((id): id is string => id !== null))]),
  ]);

  return [...byQuestion.values()].map(acc => {
    // "Attempted" for rate purposes excludes pending-grading answers — they
    // haven't resolved to correct/wrong yet, so counting them in either
    // denominator would misrepresent the question's real success rate.
    const totalAttempts = acc.correct + acc.wrong + acc.skipped;
    const answered = acc.correct + acc.wrong;
    const successRatePercent = answered > 0 ? round((acc.correct / answered) * 100) : 0;
    const wrongRatePercent = answered > 0 ? round((acc.wrong / answered) * 100) : 0;
    const skipRatePercent = totalAttempts > 0 ? round((acc.skipped / totalAttempts) * 100) : 0;
    const averageTimeSpentSec = totalAttempts > 0 ? round(acc.timeSpentSec / totalAttempts) : 0;

    return {
      questionId: acc.questionId,
      promptPreview: acc.prompt.slice(0, 100),
      subjectId: acc.subjectExternalId,
      subjectName: acc.subjectExternalId ? (subjectNames.get(acc.subjectExternalId) ?? UNKNOWN_SUBJECT_NAME) : UNKNOWN_SUBJECT_NAME,
      chapterId: acc.chapterExternalId,
      chapterName: acc.chapterExternalId ? (chapterNames.get(acc.chapterExternalId) ?? UNKNOWN_TOPIC_NAME) : null,
      difficulty: acc.difficulty,
      questionType: acc.questionType,
      totalAttempts,
      totalCorrect: acc.correct,
      totalWrong: acc.wrong,
      totalSkipped: acc.skipped,
      pendingGrading: acc.pending,
      successRatePercent, wrongRatePercent, skipRatePercent,
      totalTimeSpentSec: round(acc.timeSpentSec),
      averageTimeSpentSec,
      lastAttemptedDate: acc.lastAttemptedDate,
    };
  });
}

export interface AssessmentQuestionBankCountFilters {
  classExternalId?: string;
  subjectExternalId?: string;
  chapterExternalId?: string;
  difficulty?: Difficulty;
  questionType?: QuestionType;
}

/**
 * Feature 7: total size of the Assessment question bank — the Assessment
 * analogue of questionAnalytics.service.ts's getBankCount(), same rationale
 * (getQuestionOverview() above is answer-driven, so a never-attempted
 * question never appears in it). Note AssessmentAnalyticsFilters (used by
 * getQuestionOverview) has no chapter/difficulty/type fields today, so this
 * takes its own small filter shape instead of reusing that type.
 */
async function getBankCount(filters: AssessmentQuestionBankCountFilters): Promise<number> {
  return prisma.assessmentQuestionBank.count({
    where: {
      status: UserStatus.ACTIVE,
      ...(filters.classExternalId && { classExternalId: filters.classExternalId }),
      ...(filters.subjectExternalId && { subjectExternalId: filters.subjectExternalId }),
      ...(filters.chapterExternalId && { chapterExternalId: filters.chapterExternalId }),
      ...(filters.difficulty && { difficulty: filters.difficulty }),
      ...(filters.questionType && { type: filters.questionType }),
    },
  });
}

export const AssessmentQuestionAnalyticsService = {
  getQuestionOverview,
  getBankCount,
};
