import type { SubjectStat } from '../hooks/useStudentAnalytics';

/**
 * Feature 3: Strength & Weakness Analysis — pure derivation over the
 * SubjectStat[] array Feature 2 already fetches. No fetching of its own, no
 * recalculation of anything Feature 2 already computed: every pick here is
 * a comparison (argmax/argmin) or a simple subtraction over fields already
 * present on SubjectStat.
 */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic tie-break: prefer the subject with more attempts (more
 *  evidence behind the number), then alphabetical. */
function betterEvidence(a: SubjectStat, b: SubjectStat): SubjectStat {
  if (a.totalAttempts !== b.totalAttempts) return a.totalAttempts > b.totalAttempts ? a : b;
  return a.subjectName.localeCompare(b.subjectName) <= 0 ? a : b;
}

function pickBy<T>(items: SubjectStat[], score: (s: SubjectStat) => number, direction: 'max' | 'min'): SubjectStat {
  return items.reduce((best, s) => {
    const bs = score(best), ss = score(s);
    if (ss === bs) return betterEvidence(best, s);
    if (direction === 'max') return ss > bs ? s : best;
    return ss < bs ? s : best;
  });
}

export interface ImprovementPick {
  subject: SubjectStat;
  improvementPercent: number; // latestAttemptAccuracy - firstAttemptAccuracy, > 0
}

export interface StrengthWeaknessInsights {
  strongest: SubjectStat;
  weakest: SubjectStat;
  mostPracticed: SubjectStat;
  leastPracticed: SubjectStat;
  /** null when no subject has ≥2 attempts, or the best available delta isn't
   *  a real improvement (≤ 0) — see the two distinct messages this drives. */
  biggestImprovement: ImprovementPick | null;
  improvementUnavailableReason: 'insufficient-history' | 'no-improvement' | null;
  /** null when no subject combines low accuracy with above-average attempts. */
  needsAttention: SubjectStat | null;
  summaryLines: string[];
}

const ATTENTION_ACCURACY_THRESHOLD = 70;

export function deriveInsights(subjects: SubjectStat[]): StrengthWeaknessInsights | null {
  if (!subjects.length) return null;

  const strongest      = pickBy(subjects, s => s.accuracyPercent, 'max');
  const weakest        = pickBy(subjects, s => s.accuracyPercent, 'min');
  const mostPracticed  = pickBy(subjects, s => s.totalAttempts, 'max');
  const leastPracticed = pickBy(subjects, s => s.totalAttempts, 'min');

  // Biggest Improvement — only subjects with a real chronological history.
  const withHistory = subjects.filter(s => s.totalAttempts >= 2);
  let biggestImprovement: ImprovementPick | null = null;
  let improvementUnavailableReason: StrengthWeaknessInsights['improvementUnavailableReason'] = null;

  if (!withHistory.length) {
    improvementUnavailableReason = 'insufficient-history';
  } else {
    const best = withHistory.reduce((best, s) => {
      const delta = s.latestAttemptAccuracy - s.firstAttemptAccuracy;
      const bestDelta = best.latestAttemptAccuracy - best.firstAttemptAccuracy;
      return delta > bestDelta ? s : best;
    });
    const delta = round(best.latestAttemptAccuracy - best.firstAttemptAccuracy);
    // A decline or flat trend isn't an "improvement" — showing it as one
    // would be misleading, so this falls back to a neutral message instead
    // of crediting a subject that didn't actually get better.
    if (delta > 0) biggestImprovement = { subject: best, improvementPercent: delta };
    else improvementUnavailableReason = 'no-improvement';
  }

  // Needs Immediate Attention — low accuracy AND practiced at or above the
  // student's own average attempt count (a self-relative bar rather than a
  // hardcoded number, so it scales with overall practice volume) AND at
  // least 2 attempts (genuinely "repeated" practice, not a single unlucky try).
  const avgAttempts = subjects.reduce((s, x) => s + x.totalAttempts, 0) / subjects.length;
  const attentionCandidates = subjects.filter(
    s => s.totalAttempts >= 2 && s.accuracyPercent < ATTENTION_ACCURACY_THRESHOLD && s.totalAttempts >= avgAttempts,
  );
  const needsAttention = attentionCandidates.length
    ? attentionCandidates.reduce((worst, s) => (s.accuracyPercent < worst.accuracyPercent ? s : worst))
    : null;

  // ── Summary panel — dynamic bullets, skipping redundant/meaningless lines. ──
  const summaryLines: string[] = [];
  summaryLines.push(`Your strongest subject is ${strongest.subjectName}.`);
  if (weakest.subjectId !== strongest.subjectId) {
    summaryLines.push(`You need more practice in ${weakest.subjectName}.`);
  }
  if (biggestImprovement) {
    summaryLines.push(`Your accuracy has improved significantly in ${biggestImprovement.subject.subjectName} (+${biggestImprovement.improvementPercent}%).`);
  }
  if (needsAttention) {
    summaryLines.push(`${needsAttention.subjectName} needs focused review despite repeated practice.`);
  }
  if (leastPracticed.subjectId !== mostPracticed.subjectId) {
    summaryLines.push(`Consider practicing ${leastPracticed.subjectName} more frequently.`);
  }

  return {
    strongest, weakest, mostPracticed, leastPracticed,
    biggestImprovement, improvementUnavailableReason, needsAttention,
    summaryLines,
  };
}
