import { useMemo, useState } from 'react';
import { Mail, MoreVertical, UserPlus, Download } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, Avatar, Table, ProgressBar, Skeleton, useToasts } from '../../shared/ui';
import { useStudents } from '../../../hooks/useUsers';
import { exportCsv } from '../../../lib/csv';
import { CreateUserModal } from './CreateUserModal';

export function StudentsPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const { push, node } = useToasts();

  const { data, loading, error, refetch } = useStudents({
    search: q || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const rows = useMemo(() => data?.items ?? [], [data]);

  const handleExport = () => {
    if (rows.length === 0) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv(
      'students.csv',
      rows.map(s => [s.name, s.email, s.schoolName ?? '', String(s.attempted ?? 0), String(s.avgScore ?? 0), s.rank ? `#${s.rank}` : '', s.status]),
      ['Name', 'Email', 'School', 'Attempted', 'Avg Score (%)', 'Rank', 'Status'],
    );
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="People · Students"
        title="Students"
        subtitle="View, search, and manage every student enrolled on the platform."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>
            <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>Add student</Button>
          </>
        }
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search students…" />
          <Select value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all',      label: 'All statuses' },
            { value: 'ACTIVE',   label: 'Active'       },
            { value: 'PENDING',  label: 'Pending'      },
            { value: 'INACTIVE', label: 'Inactive'     },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">
            {loading ? '…' : `${data?.meta?.total ?? 0} students`}
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch} className="mt-2">Retry</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : (
          <Table
            columns={[
              {
                key: 'name', label: 'Student',
                render: s => (
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} hue={s.avatarHue} />
                    <div className="min-w-0">
                      <div className="font-semibold text-fg1 truncate">{s.name}</div>
                      <div className="text-[11.5px] text-fg3 truncate flex items-center gap-1.5"><Mail size={11} />{s.email}</div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'school', label: 'School',
                render: s => <span className="text-fg2">{s.schoolName ?? '—'}</span>,
              },
              { key: 'attempted', label: 'Attempted', render: s => <span className="font-mono">{s.attempted}</span> },
              {
                key: 'avgScore', label: 'Avg score',
                render: s => (
                  <div className="min-w-[120px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[12px]">{s.avgScore}%</span>
                    </div>
                    <ProgressBar value={s.avgScore} tone={s.avgScore >= 75 ? 'emerald' : s.avgScore >= 50 ? 'amber' : 'rose'} />
                  </div>
                ),
              },
              { key: 'rank',   label: 'Rank',   render: s => <span className="font-mono text-fg2">#{s.rank || '—'}</span> },
              { key: 'status', label: 'Status', render: s => (
                <Badge tone={s.status === 'ACTIVE' ? 'success' : s.status === 'PENDING' ? 'warning' : 'neutral'}>
                  {s.status.toLowerCase()}
                </Badge>
              )},
              {
                key: 'actions', label: '', className: 'text-right',
                render: (s) => (
                  <button
                    onClick={() => window.open(`mailto:${s.email}`)}
                    title="Email student"
                    className="opacity-0 group-hover:opacity-100 transition w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-fg1 hover:bg-surface2"
                  >
                    <MoreVertical size={15} />
                  </button>
                ),
              },
            ]}
            rows={rows}
            empty={<div className="text-center py-12 text-fg3 text-[13px]">No students found</div>}
          />
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        role="STUDENT"
        onClose={() => setCreateOpen(false)}
        onCreated={refetch}
        push={push}
      />
    </>
  );
}
