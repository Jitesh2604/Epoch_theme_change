import { useEffect, useMemo, useState } from 'react';
import { Modal, Card, Badge, Skeleton, Avatar, Table } from '../../shared/ui';
import { assessmentAnalyticsApi, type AssessmentStudentRow } from '../../../hooks/useAssessmentAnalytics';
import { fmtSeconds } from '../../../lib/formatters';

/**
 * Admin Analytics — Feature 5: Student Performance within one assessment.
 *
 * Lazily fetches on open (one assessment at a time), reusing
 * LeaderboardService.forAssessment server-side (see
 * assessmentAnalytics.controller.ts) — zero new ranking logic. Buckets the
 * returned ranked list into Top Performers / Needs Attention / Average
 * client-side, same documented-threshold discipline as every other
 * classifier in this app.
 */

const TOP_PERFORMER_COUNT = 5;

interface Props {
  assessmentId: string | null;
  assessmentTitle: string;
  onClose: () => void;
}

export function AssessmentStudentsModal({ assessmentId, assessmentTitle, onClose }: Props) {
  const [items, setItems] = useState<AssessmentStudentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assessmentId) { setItems(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    assessmentAnalyticsApi.getAssessmentStudents(assessmentId)
      .then(data => { if (!cancelled) setItems(data.items); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load student performance'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assessmentId]);

  const { topPerformers, needsAttention, average } = useMemo(() => {
    const rows = items ?? [];
    // "Top Performer" requires actually passing — a failing student never
    // qualifies just because there aren't enough other students to fill the
    // top-N slots (a real bug caught while verifying with only 2 real
    // submissions, both of which failed).
    const passed = rows.filter(r => r.passed);
    const top = [...passed].sort((a, b) => b.percent - a.percent).slice(0, TOP_PERFORMER_COUNT);
    const topIds = new Set(top.map(r => r.studentId));
    const attention = rows.filter(r => !r.passed);
    const rest = rows.filter(r => r.passed && !topIds.has(r.studentId));
    return { topPerformers: top, needsAttention: attention, average: rest };
  }, [items]);

  return (
    <Modal open={!!assessmentId} onClose={onClose} title={assessmentTitle ? `Student Performance — ${assessmentTitle}` : 'Student Performance'} size="lg">
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      )}
      {!loading && error && <p className="text-danger text-[13px]">{error}</p>}
      {!loading && !error && items && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Top Performers" value={topPerformers.length} tone="success" />
            <Stat label="Needs Attention" value={needsAttention.length} tone="danger" />
            <Stat label="Average" value={average.length} tone="neutral" />
          </div>

          <StudentGroup title="Top Performers" rows={topPerformers} />
          <StudentGroup title="Needs Attention" rows={needsAttention} />
          <StudentGroup title="Average" rows={average} collapsedByDefault />
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'neutral' }) {
  const toneClass = tone === 'success' ? 'text-emerald-500' : tone === 'danger' ? 'text-rose-500' : 'text-fg2';
  return (
    <div className="rounded-xl border border-line bg-surface1 px-3 py-2.5 text-center">
      <div className={`text-[18px] font-display font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-fg3">{label}</div>
    </div>
  );
}

function StudentGroup({ title, rows, collapsedByDefault }: { title: string; rows: AssessmentStudentRow[]; collapsedByDefault?: boolean }) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (!rows.length) return null;
  return (
    <Card className="p-3">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen(o => !o)}>
        <span className="text-[12px] font-semibold text-fg1">{title} ({rows.length})</span>
        <span className="text-[11px] text-fg3">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-2.5">
          <Table
            columns={[
              { key: 'rank', label: 'Rank', render: (r: AssessmentStudentRow) => <span className="font-mono">#{r.rank}</span> },
              {
                key: 'studentName', label: 'Student',
                render: (r: AssessmentStudentRow) => (
                  <div className="flex items-center gap-2">
                    <Avatar name={r.studentName} hue={r.avatarHue} size={28} />
                    <span>{r.studentName}</span>
                  </div>
                ),
              },
              { key: 'score', label: 'Score', render: (r: AssessmentStudentRow) => `${r.score}/${r.totalMarks}` },
              { key: 'percent', label: 'Percentage', render: (r: AssessmentStudentRow) => `${r.percent}%` },
              { key: 'timeTakenSec', label: 'Completion Time', render: (r: AssessmentStudentRow) => fmtSeconds(r.timeTakenSec) },
              { key: 'passed', label: 'Result', render: (r: AssessmentStudentRow) => <Badge tone={r.passed ? 'success' : 'danger'}>{r.passed ? 'Passed' : 'Failed'}</Badge> },
            ]}
            rows={rows}
          />
        </div>
      )}
    </Card>
  );
}
