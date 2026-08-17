import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Users, Eye, Pencil, ClipboardList, BarChart3 } from 'lucide-react';
import { useSchoolStudents, useSchoolFilterOptions, type SchoolStudentRow } from '../../../hooks/useSchoolPanel';
import {
  SchoolCard, SchoolPageHeading, SchoolSearchInput, SchoolSelect, SchoolPill, SchoolAvatar,
  SchoolTable, SchoolSkeleton, SchoolPagination, SchoolEmptyState, SchoolActionMenu,
} from '../schoolUI';

type PerformanceTier = 'all' | 'high' | 'medium' | 'low';
type StatusFilter = 'all' | 'ACTIVE' | 'PENDING' | 'INACTIVE';

function performanceTierOf(s: SchoolStudentRow): 'high' | 'medium' | 'low' | null {
  if (s.assessmentsAttempted === 0) return null;
  if (s.averagePercentage >= 75) return 'high';
  if (s.averagePercentage >= 50) return 'medium';
  return 'low';
}

/** Higher per-page than the previous 20 default — Performance/Status below
 *  are real client-side filters over whatever this page's requested rows
 *  are (no such filter param exists on the backend), so a bigger page keeps
 *  them meaningful for the realistic school sizes this panel serves; the
 *  Pagination control below still applies for schools that exceed it. */
const PAGE_LIMIT = 100;

export function SchoolStudentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [branchId, setBranchId] = useState(() => searchParams.get('branchId') ?? 'all');
  const [classExternalId, setClassExternalId] = useState('all');
  const [performance, setPerformance] = useState<PerformanceTier>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const { data: filters } = useSchoolFilterOptions();
  const { data, loading, error } = useSchoolStudents({
    page, limit: PAGE_LIMIT,
    search: q || undefined,
    branchId: branchId !== 'all' ? branchId : undefined,
    classExternalId: classExternalId !== 'all' ? classExternalId : undefined,
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter(s => {
      if (status !== 'all' && s.status !== status) return false;
      if (performance !== 'all' && performanceTierOf(s) !== performance) return false;
      return true;
    });
  }, [data, status, performance]);

  const resetPage = () => setPage(1);

  return (
    <div>
      <SchoolPageHeading title="Students" subtitle="Manage students across all branches." />

      <SchoolCard className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SchoolSearchInput value={q} onChange={v => { setQ(v); resetPage(); }} placeholder="Search students…" />
          <SchoolSelect
            value={branchId}
            onChange={v => { setBranchId(v); resetPage(); }}
            options={[{ value: 'all', label: 'Branch: All' }, ...(filters?.branches ?? []).map(b => ({ value: b.id, label: b.name }))]}
          />
          <SchoolSelect
            value={classExternalId}
            onChange={v => { setClassExternalId(v); resetPage(); }}
            options={[{ value: 'all', label: 'Class: All' }, ...(filters?.classes ?? []).map(c => ({ value: c.id, label: c.name }))]}
          />
          <SchoolSelect
            value={performance}
            onChange={v => setPerformance(v as PerformanceTier)}
            options={[
              { value: 'all', label: 'Performance: All' },
              { value: 'high', label: 'High (≥75%)' },
              { value: 'medium', label: 'Medium (50–74%)' },
              { value: 'low', label: 'Low (<50%)' },
            ]}
          />
          <SchoolSelect
            value={status}
            onChange={v => setStatus(v as StatusFilter)}
            options={[
              { value: 'all', label: 'Status: All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
          <div className="ml-auto text-[12px] font-bold text-[var(--sp-muted)]">
            {loading ? '…' : `${rows.length} of ${data?.meta?.total ?? 0} students`}
          </div>
        </div>
      </SchoolCard>

      {error && (
        <SchoolCard className="mb-4">
          <p className="text-[var(--sp-danger)] text-[13px] font-semibold">{error}</p>
        </SchoolCard>
      )}

      <SchoolCard noPad className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <SchoolSkeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : (
          <>
            <SchoolTable
              sticky
              columns={[
                {
                  key: 'name', label: 'Student',
                  render: (s: SchoolStudentRow) => (
                    <button className="flex items-center gap-3 text-left" onClick={() => navigate(`/school/students/${s.id}`)}>
                      <SchoolAvatar name={s.name} />
                      <div className="min-w-0">
                        <div className="font-bold text-[var(--sp-text)] truncate hover:text-[var(--sp-navy)]">{s.name}</div>
                        <div className="text-[11.5px] text-[var(--sp-muted)] truncate flex items-center gap-1.5"><Mail size={11} />{s.email}</div>
                      </div>
                    </button>
                  ),
                },
                { key: 'className', label: 'Class', render: (s: SchoolStudentRow) => <span className="text-[var(--sp-text)] font-semibold">{s.className ?? '—'}</span> },
                { key: 'branchName', label: 'Branch', render: (s: SchoolStudentRow) => <span className="text-[var(--sp-text)] font-semibold">{s.branchName ?? '—'}</span> },
                {
                  key: 'averageScore', label: 'Average',
                  render: (s: SchoolStudentRow) => s.assessmentsAttempted
                    ? <span className="font-mono font-bold text-[var(--sp-navy)]">{s.averagePercentage}%</span>
                    : <span className="text-[var(--sp-muted-2)]">—</span>,
                },
                { key: 'assessmentsAttempted', label: 'Assessments', render: (s: SchoolStudentRow) => <span className="font-mono font-semibold">{s.assessmentsAttempted}</span> },
                {
                  key: 'status', label: 'Status',
                  render: (s: SchoolStudentRow) => (
                    <div className="flex flex-col gap-1 items-start">
                      <SchoolPill tone={s.status === 'ACTIVE' ? 'success' : s.status === 'PENDING' ? 'warning' : 'neutral'}>{s.status.toLowerCase()}</SchoolPill>
                      {!s.verified && <SchoolPill tone="neutral" dot={false} className="text-[10px]">unverified</SchoolPill>}
                    </div>
                  ),
                },
                {
                  key: 'actions', label: '', className: 'text-right',
                  render: (s: SchoolStudentRow) => (
                    <div className="flex justify-end">
                      <SchoolActionMenu items={[
                        { label: 'View Profile', icon: Eye, onClick: () => navigate(`/school/students/${s.id}`) },
                        { label: 'Edit Profile', icon: Pencil, onClick: () => navigate(`/school/students/${s.id}?edit=1`) },
                        { label: 'Results', icon: ClipboardList, onClick: () => navigate(`/school/students/${s.id}?tab=results`) },
                        { label: 'Analytics', icon: BarChart3, onClick: () => navigate(`/school/students/${s.id}?tab=analytics`) },
                      ]} />
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty={
                <SchoolEmptyState
                  icon={Users}
                  title="No students match these filters."
                  desc="Try a different search, branch, class, performance, or status filter."
                />
              }
            />
            {data?.meta && <SchoolPagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} disabled={loading} />}
          </>
        )}
      </SchoolCard>
    </div>
  );
}
