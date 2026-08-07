import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Target, Flame, Clock, ClipboardCheck, History, Award } from 'lucide-react';
import { Modal, Card, Badge, ProgressBar, Skeleton, EmptyState } from '../../shared/ui';
import { studentPerformanceApi, type StudentDetail, type AssessmentHistoryEntry } from '../../../hooks/useStudentPerformance';
import { computeConfidence } from '../../../lib/confidenceScore';
import { deriveInsights } from '../../../lib/strengthWeaknessInsights';
import { buildLearningInsights } from '../../../lib/learningInsightsEngine';
import { computeStreak, practiceDatesFromOverview } from '../../../lib/studyPlanEngine';
import { computePracticeFrequency, buildStreakMilestones } from '../../../lib/consistencyEngine';
import { getPerformanceBand } from '../../../lib/performanceBand';
import { evaluateAtRisk } from '../../../lib/atRiskDetection';
import { deriveAssessmentTrend, type AssessmentTrendPoint } from '../../../lib/assessmentTrendInsights';
import { classifyStudentPerformance } from '../../../lib/studentPerformanceGrade';
import { fmtDuration, fmtSeconds, fmtDate } from '../../../lib/formatters';

/**
 * Admin Analytics — Feature 2/6: Student Summary Panel.
 *
 * Every section here calls the exact same derivation functions the
 * student's own AnalyticsPage.tsx uses (buildLearningInsights, deriveInsights,
 * computeConfidence, computeStreak, computePracticeFrequency,
 * getPerformanceBand) plus Feature 5's Assessment reducer (already applied
 * server-side into detail.assessmentStats/assessmentHistory) — this
 * component adds no new formulas, only layout and light merging.
 */

interface Props {
  studentId: string | null;
  studentName: string;
  onClose: () => void;
}

export function StudentPerformanceSummaryPanel({ studentId, studentName, onClose }: Props) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentPerformanceApi.getStudentDetail(studentId)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load student detail'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const open = !!studentId;

  return (
    <Modal open={open} onClose={onClose} title={studentName || 'Student Summary'} size="lg">
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!loading && error && <p className="text-danger text-[13px]">{error}</p>}

      {!loading && !error && detail && detail.overview.hasData === false && (
        <EmptyState icon={Target} title="No practice data yet" desc="This student hasn't submitted any Practice Olympiad attempts." />
      )}

      {!loading && !error && detail && detail.overview.hasData === true && (
        <SummaryBody detail={detail} />
      )}
    </Modal>
  );
}

function SummaryBody({ detail }: { detail: StudentDetail }) {
  const overview = detail.overview.hasData === true ? detail.overview : null;
  if (!overview) return null;
  const { subjects, questionTypes, topics, revisionDashboard, assessmentStats, assessmentHistory } = detail;

  const confidence = computeConfidence(overview, subjects, questionTypes);
  const strengthWeakness = deriveInsights(subjects);
  const practiceDates = practiceDatesFromOverview(overview);
  const streak = computeStreak(practiceDates, new Set(), new Date());
  const frequency = computePracticeFrequency(overview, practiceDates);
  const insights = buildLearningInsights(overview, subjects, questionTypes, topics);

  const assessmentAveragePercent = assessmentStats.completedAttempts > 0 ? assessmentStats.averagePercentage : null;
  const assessmentPercentHistory: AssessmentTrendPoint[] = assessmentHistory
    .filter((a): a is AssessmentHistoryEntry & { percent: number } => a.percent !== null)
    .map(a => ({ date: a.submittedAt ?? a.startedAt, percent: a.percent }));
  const assessmentTrend = deriveAssessmentTrend(assessmentPercentHistory);

  // Detail view has the full submission history, so — unlike the bulk
  // table — it can afford the declining-trend signal too.
  const atRisk = evaluateAtRisk({
    overview, confidence, revisionOverdueCount: revisionDashboard.counts.overdue,
    assessmentAveragePercent, assessmentTrendDeclining: assessmentTrend.direction === 'declined',
  });
  const grade = classifyStudentPerformance({
    atRisk: atRisk.atRisk, atRiskReasons: atRisk.reasons,
    accuracyPercent: overview.accuracyPercent, assessmentAveragePercent,
  });

  // Progress Timeline — merges Practice attempt dates (accuracyTrend.history,
  // already fetched for Feature 1) with Assessment submission dates
  // (assessmentHistory, already fetched above), most recent first. Not a
  // new fetch — just a chronological interleave of two already-fetched lists.
  const timelineEvents = [
    ...overview.accuracyTrend.history.map(h => ({ date: h.date, label: `Practice session — ${h.accuracy}% accuracy`, kind: 'practice' as const })),
    ...assessmentHistory.filter(a => a.submittedAt).map(a => ({
      date: a.submittedAt!, label: `${a.title} — ${a.percent !== null ? `${a.percent}%` : a.status}`, kind: 'assessment' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

  const milestones = buildStreakMilestones({ currentStreak: streak.currentStreak, bestStreak: streak.bestStreak, practicedToday: false });

  return (
    <div className="space-y-5">
      {grade.grade && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg3">Overall Performance Grade</span>
          <Badge tone={grade.grade === 'Excellent' || grade.grade === 'Good' ? 'success' : grade.grade === 'Average' ? 'warning' : 'danger'}>{grade.grade}</Badge>
        </div>
      )}

      {atRisk.atRisk && (
        <Card className="p-4 border-2 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <span className="font-semibold text-[13px] text-fg1">Needs Attention</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
            {atRisk.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Card>
      )}

      {/* ── Overall Performance ─────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5">Overall Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total Attempts" value={overview.totalAttempts} />
          <Stat label="Total Questions" value={overview.totalQuestionsAttempted} />
          <Stat label="Correct" value={overview.totalCorrect} />
          <Stat label="Wrong" value={overview.totalWrong} />
          <Stat label="Skipped" value={overview.totalSkipped} />
          <Stat label="Accuracy" value={`${overview.accuracyPercent}%`} />
          <Stat label="Average Score" value={overview.averageScore} />
          <Stat label="Best Score" value={overview.bestScore} />
          <Stat label="Total Practice Time" value={fmtDuration(overview.totalPracticeTimeSec)} />
        </div>
      </section>

      {/* ── Subject Performance ─────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5">Subject Performance</h3>
        <div className="space-y-2">
          {subjects.map(s => {
            const band = getPerformanceBand(s.accuracyPercent);
            return (
              <Card key={s.subjectId} className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-[13px] text-fg1">{s.subjectName}</span>
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${band.pillClass}`}>{band.emoji} {band.label}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg3">
                  <span>Attempts: <strong className="text-fg1">{s.totalAttempts}</strong></span>
                  <span>Accuracy: <strong className="text-fg1">{s.accuracyPercent}%</strong></span>
                  <span>Avg Score: <strong className="text-fg1">{s.averageScore}</strong></span>
                  <span>Avg Time: <strong className="text-fg1">{fmtSeconds(s.averageTimePerQuestionSec)}</strong></span>
                </div>
              </Card>
            );
          })}
          {!subjects.length && <p className="text-[12px] text-fg3">No subject data yet.</p>}
        </div>
      </section>

      {/* ── Strength & Weakness ─────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5">Strength &amp; Weakness</h3>
        {strengthWeakness ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Strongest Subject" value={strengthWeakness.strongest.subjectName} />
            <Stat label="Weakest Subject" value={strengthWeakness.weakest.subjectName} />
            <Stat
              label="Biggest Improvement"
              value={strengthWeakness.biggestImprovement
                ? `${strengthWeakness.biggestImprovement.subject.subjectName} (+${strengthWeakness.biggestImprovement.improvementPercent}%)`
                : '—'}
            />
            <Stat label="Needs Immediate Attention" value={strengthWeakness.needsAttention?.subjectName ?? 'None'} />
          </div>
        ) : <p className="text-[12px] text-fg3">Not enough subject data yet.</p>}
      </section>

      {/* ── Practice Activity ───────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5 flex items-center gap-1.5"><Flame size={12} />Practice Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Practice Streak" value={`${streak.currentStreak}d`} />
          <Stat label="Revision Streak" value={`${revisionDashboard.streak.currentStreak}d`} />
          <Stat label="Last Practice" value={fmtDate(overview.lastPracticeDate)} />
          <Stat label="Mixed Practice Count" value={overview.totalMixedPracticeAttempts} />
          <Stat label="Sessions/Week" value={frequency.avgSessionsPerWeek} />
          <Stat label="Questions/Day" value={frequency.avgQuestionsPerDay} />
        </div>
      </section>

      {/* ── Assessment Analytics ────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5 flex items-center gap-1.5"><ClipboardCheck size={12} />Assessment Analytics</h3>
        {assessmentStats.totalAttempts > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Stat label="Total Assessments" value={assessmentStats.totalAttempts} />
              <Stat label="Average Score" value={assessmentStats.averageScore} />
              <Stat label="Average Percentage" value={`${assessmentStats.averagePercentage}%`} />
              <Stat
                label="Completion Rate"
                value={`${assessmentStats.totalAttempts ? Math.round((assessmentStats.completedAttempts / assessmentStats.totalAttempts) * 100) : 0}%`}
              />
              <Stat label="Pass Rate" value={`${assessmentStats.passRate}%`} />
              {assessmentTrend.direction !== 'consistent' && (
                <Stat
                  label="Score Trend"
                  value={assessmentTrend.direction === 'improved' ? `+${assessmentTrend.deltaPercent}%` : `${assessmentTrend.deltaPercent}%`}
                />
              )}
            </div>
            <div className="space-y-1.5">
              {assessmentHistory.map(a => (
                <div key={`${a.assessmentId}-${a.startedAt}`} className="flex items-center justify-between rounded-lg border border-line bg-surface1 px-3 py-2 text-[12px]">
                  <span className="text-fg1 truncate">{a.title}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-fg3">{fmtDate(a.startedAt)}</span>
                    {a.percent !== null ? (
                      <Badge tone={a.passed ? 'success' : 'danger'}>{a.percent}%</Badge>
                    ) : <Badge tone="neutral">{a.status}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : <p className="text-[12px] text-fg3">No Assessment attempts yet.</p>}
      </section>

      {/* ── AI Summary ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5 flex items-center gap-1.5"><CheckCircle2 size={12} />AI Summary</h3>
        {insights ? (
          <div className="space-y-3">
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-fg1">Confidence Meter</span>
                <Badge tone={insights.confidence.score >= 61 ? 'success' : insights.confidence.score >= 41 ? 'warning' : 'danger'}>
                  {insights.confidence.bandEmoji} {insights.confidence.band} · {insights.confidence.score}
                </Badge>
              </div>
              <ProgressBar value={insights.confidence.score} tone={insights.confidence.score >= 61 ? 'emerald' : insights.confidence.score >= 41 ? 'amber' : 'rose'} />
            </Card>

            <Card className="p-3">
              <span className="text-[12px] font-semibold text-fg1 block mb-1.5">Overall Summary</span>
              <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
                {insights.summaryLines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </Card>

            <Card className="p-3">
              <span className="text-[12px] font-semibold text-fg1 flex items-center gap-1.5 mb-1.5"><Target size={12} />Top Recommendations</span>
              <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
                {insights.recommendations.map(r => <li key={r.id}>{r.title} — <span className="text-fg3">{r.reason}</span></li>)}
                {!insights.recommendations.length && <li className="text-fg3 list-none">No specific recommendations right now — keep it up.</li>}
              </ul>
            </Card>

            <Card className="p-3">
              <span className="text-[12px] font-semibold text-fg1 flex items-center gap-1.5 mb-1.5"><Clock size={12} />Weekly Goals</span>
              <ul className="list-disc list-inside space-y-1 text-[12.5px] text-fg2">
                {insights.weeklyGoals.map(g => <li key={g.id}>{g.title} — <span className="text-fg3">{g.description}</span></li>)}
              </ul>
            </Card>
          </div>
        ) : (
          <p className="text-[12px] text-fg3">Needs at least 3 practice attempts to generate AI insights.</p>
        )}
      </section>

      {/* ── Progress Timeline ───────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3 mb-2.5 flex items-center gap-1.5"><History size={12} />Progress Timeline</h3>

        {milestones.some(m => m.achieved) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {milestones.filter(m => m.achieved).map(m => (
              <span key={m.days} className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25">
                <Award size={10} />{m.days}-day streak
              </span>
            ))}
          </div>
        )}

        {timelineEvents.length ? (
          <div className="space-y-1.5">
            {timelineEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px]">
                <span className="text-fg3 shrink-0 w-[84px]">{fmtDate(e.date)}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.kind === 'practice' ? 'bg-sky-400' : 'bg-violet-400'}`} />
                <span className="text-fg2 truncate">{e.label}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-fg3">No practice or assessment history yet.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface1 px-3 py-2.5">
      <div className="text-[15px] font-display font-semibold text-fg1">{value}</div>
      <div className="text-[11px] text-fg3">{label}</div>
    </div>
  );
}
