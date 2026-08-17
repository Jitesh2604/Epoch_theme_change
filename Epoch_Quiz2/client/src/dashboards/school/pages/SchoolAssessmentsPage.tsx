import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Users, Target, Eye, Trophy } from 'lucide-react';
import { useSchoolResults, useSchoolFilterOptions, type SchoolResultRow } from '../../../hooks/useSchoolPanel';
import { fmtDate } from '../../../lib/formatters';
import {
  SchoolCard, SchoolPageHeading, SchoolSelect, SchoolSkeleton, SchoolEmptyState, SchoolPill, SchoolTable,
  SchoolModal, SchoolAvatar, SchoolActionMenu,
} from '../schoolUI';

interface AssessmentGroup {
  assessmentId: string;
  title: string;
  subjectName: string;
  className: string | null;
  participants: number;
  averageScore: number;
  averagePercent: number;
  lastSubmittedAt: string;
  submissions: SchoolResultRow[];
}

/**
 * Assessment-centric view, built by grouping the real per-submission
 * `/school-panel/results` rows by assessmentId — there is no dedicated
 * "list of assessments" endpoint scoped to a School Admin (Assessments are
 * platform-wide, not school-owned), so this is the only real data available
 * to build one. Every row here is something that was genuinely attempted;
 * there's no way to see not-yet-attempted ("Upcoming") assessments through
 * this API, so this page only ever shows Completed/attempted assessments —
 * labelled accordingly rather than inventing an Upcoming/Active bucket with
 * no real backing data.
 */
function groupByAssessment(rows: SchoolResultRow[]): AssessmentGroup[] {
  const map = new Map<string, AssessmentGroup>();
  for (const r of rows) {
    let g = map.get(r.assessmentId);
    if (!g) {
      g = { assessmentId: r.assessmentId, title: r.assessmentTitle, subjectName: r.subjectName, className: r.className, participants: 0, averageScore: 0, averagePercent: 0, lastSubmittedAt: r.submittedAt, submissions: [] };
      map.set(r.assessmentId, g);
    }
    g.submissions.push(r);
    if (r.submittedAt > g.lastSubmittedAt) g.lastSubmittedAt = r.submittedAt;
  }
  for (const g of map.values()) {
    const distinctStudents = new Set(g.submissions.map(s => s.studentId));
    g.participants = distinctStudents.size;
    g.averageScore = Math.round((g.submissions.reduce((s, x) => s + x.score, 0) / g.submissions.length) * 10) / 10;
    g.averagePercent = Math.round((g.submissions.reduce((s, x) => s + x.percent, 0) / g.submissions.length) * 10) / 10;
  }
  return [...map.values()].sort((a, b) => (a.lastSubmittedAt < b.lastSubmittedAt ? 1 : -1));
}

function AssessmentSubmissionsModal({ group, onClose }: { group: AssessmentGroup; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <SchoolModal open onClose={onClose} title={group.title} size="lg" footer={
      <button onClick={() => { onClose(); navigate(`/school/leaderboard?session=${encodeURIComponent(group.title)}`); }} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--sp-teal)] hover:text-[var(--sp-teal-600)]">
        <Trophy size={13} /> View on Leaderboard
      </button>
    }>
      <div className="divide-y divide-[var(--sp-border)] -m-5">
        {[...group.submissions].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map(s => (
          <button key={s.submissionId} onClick={() => { onClose(); navigate(`/school/students/${s.studentId}`); }} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--sp-surface-alt)] transition text-left">
            <span className="w-7 text-center font-mono font-bold text-[12px] text-[var(--sp-muted)] shrink-0">{s.rank ? `#${s.rank}` : '—'}</span>
            <SchoolAvatar name={s.studentName} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[var(--sp-text)] truncate">{s.studentName}</div>
              <div className="text-[11px] text-[var(--sp-muted)] truncate">{s.className ?? '—'} · {s.branchName ?? '—'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[12.5px] font-bold text-[var(--sp-navy)] tabular-nums">{s.score}/{s.totalMarks}</div>
              <div className="text-[11px] text-[var(--sp-muted)] tabular-nums">{s.percent}%</div>
            </div>
            <SchoolPill tone={s.passed ? 'success' : 'danger'} dot={false}>{s.passed ? 'passed' : 'failed'}</SchoolPill>
          </button>
        ))}
      </div>
    </SchoolModal>
  );
}

export function SchoolAssessmentsPage() {
  const navigate = useNavigate();
  const { data: filters } = useSchoolFilterOptions();
  const [session, setSession] = useState('all');
  const [subjectExternalId, setSubjectExternalId] = useState('all');
  const [classExternalId, setClassExternalId] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [viewing, setViewing] = useState<AssessmentGroup | null>(null);

  const { data, loading, error } = useSchoolResults({
    page: 1, limit: 500,
    session: session !== 'all' ? session : undefined,
    subjectExternalId: subjectExternalId !== 'all' ? subjectExternalId : undefined,
    classExternalId: classExternalId !== 'all' ? classExternalId : undefined,
    branchId: branchId !== 'all' ? branchId : undefined,
  });

  const groups = useMemo(() => groupByAssessment(data?.items ?? []), [data]);

  return (
    <div>
      <SchoolPageHeading title="Assessments" subtitle="Assessments your students have completed, with real participation and score data." />

      <SchoolCard className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SchoolSelect value={session} onChange={setSession} options={[{ value: 'all', label: 'All sessions' }, ...(filters?.sessions ?? []).map(s => ({ value: s, label: s }))]} />
          <SchoolSelect value={subjectExternalId} onChange={setSubjectExternalId} options={[{ value: 'all', label: 'All subjects' }, ...(filters?.subjects ?? []).map(s => ({ value: s.id, label: s.name }))]} />
          <SchoolSelect value={classExternalId} onChange={setClassExternalId} options={[{ value: 'all', label: 'All classes' }, ...(filters?.classes ?? []).map(c => ({ value: c.id, label: c.name }))]} />
          <SchoolSelect value={branchId} onChange={setBranchId} options={[{ value: 'all', label: 'All branches' }, ...(filters?.branches ?? []).map(b => ({ value: b.id, label: b.name }))]} />
        </div>
      </SchoolCard>

      {error && <SchoolCard className="mb-4"><p className="text-[var(--sp-danger)] text-[13px] font-semibold">{error}</p></SchoolCard>}

      <SchoolCard noPad className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <SchoolSkeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          <SchoolTable
            columns={[
              {
                key: 'title', label: 'Assessment',
                render: (g: AssessmentGroup) => (
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--sp-text)] truncate">{g.title}</div>
                    <div className="text-[11px] text-[var(--sp-muted)]">Last activity {fmtDate(g.lastSubmittedAt)}</div>
                  </div>
                ),
              },
              { key: 'subjectName', label: 'Subject', render: (g: AssessmentGroup) => <span className="text-[var(--sp-text)] font-semibold">{g.subjectName}</span> },
              { key: 'className', label: 'Class', render: (g: AssessmentGroup) => <span className="text-[var(--sp-text)] font-semibold">{g.className ?? '—'}</span> },
              { key: 'participants', label: 'Participants', render: (g: AssessmentGroup) => <span className="flex items-center gap-1.5 font-mono font-bold"><Users size={12} className="text-[var(--sp-muted-2)]" />{g.participants}</span> },
              { key: 'averageScore', label: 'Average Score', render: (g: AssessmentGroup) => <span className="flex items-center gap-1.5 font-mono font-bold text-[var(--sp-navy)]"><Target size={12} className="text-[var(--sp-muted-2)]" />{g.averageScore} ({g.averagePercent}%)</span> },
              { key: 'status', label: 'Status', render: () => <SchoolPill tone="success" dot={false}>Completed</SchoolPill> },
              {
                key: 'actions', label: '', className: 'text-right',
                render: (g: AssessmentGroup) => (
                  <div className="flex justify-end">
                    <SchoolActionMenu items={[
                      { label: 'View Submissions', icon: Eye, onClick: () => setViewing(g) },
                      { label: 'Leaderboard', icon: Trophy, onClick: () => navigate(`/school/leaderboard?session=${encodeURIComponent(g.title)}`) },
                    ]} />
                  </div>
                ),
              },
            ]}
            rows={groups}
            empty={<SchoolEmptyState icon={ClipboardList} title="No assessments attempted yet." desc="Assessments your students complete will appear here, grouped with real participation and score data." />}
          />
        )}
      </SchoolCard>

      {viewing && <AssessmentSubmissionsModal group={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
