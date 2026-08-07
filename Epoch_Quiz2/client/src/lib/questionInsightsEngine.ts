import type { QuestionOverviewRow } from '../hooks/useQuestionAnalytics';
import {
  classifyQuestionQuality, MIN_ATTEMPTS_FOR_CLASSIFICATION,
  TIME_OUTLIER_MULTIPLIER, MIN_PEERS_FOR_TIME_COMPARISON, HIGH_SKIP_RATE_THRESHOLD,
} from './questionQualityClassifier';

/**
 * Admin Analytics — Feature 4: Question-level AI Insights.
 *
 * Rule-based only, mirroring subjectInsightsEngine.ts's architecture: an
 * ordered list of rules, each inspecting the same already-fetched
 * QuestionOverviewRow[] (no new fetch, no recomputation of success/skip
 * rate/time — all straight off the server payload) and either abstaining or
 * returning an evidence-backed sentence. A rule only fires when the
 * underlying numbers actually support it and there's enough sample size.
 *
 * Questions are referenced by their real prompt preview, not an invented
 * "Q102"-style id — this app's question ids are cuids, not meant for human
 * display, and inventing a numbering scheme not present in the data would
 * misrepresent the evidence.
 */

export interface QuestionInsight {
  id: string;
  text: string;
}

// Documented thresholds — only call out a signal large/consistent enough to
// be genuine, not noise from a handful of attempts. TIME_OUTLIER_MULTIPLIER
// and MIN_PEERS_FOR_TIME_COMPARISON now live in questionQualityClassifier.ts
// (Feature 7's single config module) since deriveReviewReasons() there
// reuses the exact same time-outlier technique per-question.
export const LOW_SUCCESS_RATE_NOTABLE = 20; // percent — for the single-worst-question callout
export const DIFFICULT_QUESTIONS_PER_CHAPTER_THRESHOLD = 3;
export const MIN_QUESTIONS_PER_DIFFICULTY_BAND = 3; // for the Easy-vs-Medium comparison
// Minimum members before a type/subject rollup is trustworthy enough to
// call out as "the best"/"the weakest" — same reasoning as
// MIN_QUESTIONS_PER_DIFFICULTY_BAND, reused for the two new rollup rules.
export const MIN_QUESTIONS_PER_ROLLUP_GROUP = 3;

function quoteQuestion(q: QuestionOverviewRow): string {
  const trimmed = q.promptPreview.length >= 100 ? `${q.promptPreview}…` : q.promptPreview;
  return `"${trimmed}"`;
}

interface Rule {
  id: string;
  evaluate: (questions: QuestionOverviewRow[]) => QuestionInsight | null;
}

const RULES: Rule[] = [
  {
    id: 'lowest-success-rate',
    evaluate: (questions) => {
      const eligible = questions.filter(q => q.totalAttempts >= MIN_ATTEMPTS_FOR_CLASSIFICATION && q.successRatePercent <= LOW_SUCCESS_RATE_NOTABLE);
      if (!eligible.length) return null;
      const worst = eligible.reduce((a, b) => (b.successRatePercent < a.successRatePercent ? b : a));
      return { id: 'lowest-success-rate', text: `Question ${quoteQuestion(worst)} has only a ${worst.successRatePercent}% success rate.` };
    },
  },
  {
    id: 'time-outlier',
    evaluate: (questions) => {
      const byGroup = new Map<string, QuestionOverviewRow[]>();
      for (const q of questions) {
        if (q.totalAttempts < MIN_ATTEMPTS_FOR_CLASSIFICATION) continue;
        const key = `${q.difficulty}::${q.questionType}`;
        const list = byGroup.get(key);
        if (list) list.push(q); else byGroup.set(key, [q]);
      }
      let best: { question: QuestionOverviewRow; ratio: number } | null = null;
      for (const group of byGroup.values()) {
        if (group.length < MIN_PEERS_FOR_TIME_COMPARISON) continue;
        const avgTime = group.reduce((s, q) => s + q.averageTimeSpentSec, 0) / group.length;
        if (avgTime <= 0) continue;
        for (const q of group) {
          const ratio = q.averageTimeSpentSec / avgTime;
          if (ratio >= TIME_OUTLIER_MULTIPLIER && (!best || ratio > best.ratio)) best = { question: q, ratio };
        }
      }
      if (!best) return null;
      const multiplier = Math.round(best.ratio * 10) / 10;
      return { id: 'time-outlier', text: `Students spend ${multiplier}x the expected time on question ${quoteQuestion(best.question)}.` };
    },
  },
  {
    id: 'difficult-chapter-concentration',
    evaluate: (questions) => {
      const byChapter = new Map<string, { subjectName: string; chapterName: string; count: number }>();
      for (const q of questions) {
        if (!q.chapterName) continue;
        const { status } = classifyQuestionQuality(q);
        if (status !== 'Very Difficult') continue;
        const key = `${q.subjectId ?? ''}::${q.chapterId ?? ''}`;
        const entry = byChapter.get(key) ?? { subjectName: q.subjectName, chapterName: q.chapterName, count: 0 };
        entry.count += 1;
        byChapter.set(key, entry);
      }
      const candidates = [...byChapter.values()].filter(c => c.count >= DIFFICULT_QUESTIONS_PER_CHAPTER_THRESHOLD);
      if (!candidates.length) return null;
      const worst = candidates.reduce((a, b) => (b.count > a.count ? b : a));
      return { id: 'difficult-chapter-concentration', text: `${worst.subjectName} ${worst.chapterName} contains ${worst.count} difficult questions.` };
    },
  },
  {
    id: 'difficulty-band-inversion',
    evaluate: (questions) => {
      const bySubject = new Map<string, QuestionOverviewRow[]>();
      for (const q of questions) {
        if (!q.subjectId) continue;
        const list = bySubject.get(q.subjectId);
        if (list) list.push(q); else bySubject.set(q.subjectId, [q]);
      }
      for (const subjectQuestions of bySubject.values()) {
        const easy = subjectQuestions.filter(q => q.difficulty === 'EASY' && q.totalAttempts >= MIN_ATTEMPTS_FOR_CLASSIFICATION);
        const medium = subjectQuestions.filter(q => q.difficulty === 'MEDIUM' && q.totalAttempts >= MIN_ATTEMPTS_FOR_CLASSIFICATION);
        if (easy.length < MIN_QUESTIONS_PER_DIFFICULTY_BAND || medium.length < MIN_QUESTIONS_PER_DIFFICULTY_BAND) continue;
        const easyAvg = easy.reduce((s, q) => s + q.successRatePercent, 0) / easy.length;
        const mediumAvg = medium.reduce((s, q) => s + q.successRatePercent, 0) / medium.length;
        if (easyAvg < mediumAvg) {
          return { id: 'difficulty-band-inversion', text: `${subjectQuestions[0].subjectName} Easy questions have a lower success rate (${Math.round(easyAvg)}%) than Medium questions (${Math.round(mediumAvg)}%).` };
        }
      }
      return null;
    },
  },
  {
    id: 'low-success-count',
    evaluate: (questions) => {
      const count = questions.filter(q => q.totalAttempts >= MIN_ATTEMPTS_FOR_CLASSIFICATION && q.successRatePercent < LOW_SUCCESS_RATE_NOTABLE + 10).length;
      if (!count) return null;
      const threshold = LOW_SUCCESS_RATE_NOTABLE + 10;
      return { id: 'low-success-count', text: `${count} question${count === 1 ? ' has' : 's have'} success below ${threshold}%.` };
    },
  },
  {
    id: 'best-type-accuracy',
    evaluate: (questions) => {
      const byType = new Map<string, { correct: number; answered: number; count: number }>();
      for (const q of questions) {
        const entry = byType.get(q.questionType) ?? { correct: 0, answered: 0, count: 0 };
        entry.correct += q.totalCorrect;
        entry.answered += q.totalCorrect + q.totalWrong;
        entry.count += 1;
        byType.set(q.questionType, entry);
      }
      const eligible = [...byType.entries()].filter(([, e]) => e.count >= MIN_QUESTIONS_PER_ROLLUP_GROUP && e.answered > 0);
      if (eligible.length < 2) return null;
      const [bestType, bestEntry] = eligible.reduce((best, cur) =>
        (cur[1].correct / cur[1].answered) > (best[1].correct / best[1].answered) ? cur : best);
      const accuracy = Math.round((bestEntry.correct / bestEntry.answered) * 100);
      return { id: 'best-type-accuracy', text: `${bestType.replace(/_/g, ' ')} questions have the highest accuracy at ${accuracy}%.` };
    },
  },
  {
    id: 'weakest-subject-skip-rate',
    evaluate: (questions) => {
      const bySubject = new Map<string, { subjectName: string; skipped: number; attempts: number; count: number }>();
      for (const q of questions) {
        if (!q.subjectId) continue;
        const entry = bySubject.get(q.subjectId) ?? { subjectName: q.subjectName, skipped: 0, attempts: 0, count: 0 };
        entry.skipped += q.totalSkipped;
        entry.attempts += q.totalAttempts;
        entry.count += 1;
        bySubject.set(q.subjectId, entry);
      }
      const eligible = [...bySubject.values()].filter(e => e.count >= MIN_QUESTIONS_PER_ROLLUP_GROUP && e.attempts > 0);
      if (eligible.length < 2) return null;
      const worst = eligible.reduce((a, b) => (b.skipped / b.attempts) > (a.skipped / a.attempts) ? b : a);
      const skipRate = Math.round((worst.skipped / worst.attempts) * 100);
      if (skipRate < HIGH_SKIP_RATE_THRESHOLD) return null;
      return { id: 'weakest-subject-skip-rate', text: `${worst.subjectName} questions have the highest skip rate at ${skipRate}%.` };
    },
  },
];

export function buildQuestionInsights(questions: QuestionOverviewRow[]): QuestionInsight[] {
  return RULES.map(rule => rule.evaluate(questions)).filter((x): x is QuestionInsight => x !== null);
}
