import { useMemo, useState } from 'react';
import { Mail, MoreVertical, UserPlus, Download } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, Avatar, Table, Skeleton, useToasts } from '../../shared/ui';
import { useTeachers } from '../../../hooks/useUsers';
import { exportCsv } from '../../../lib/csv';
import { CreateUserModal } from './CreateUserModal';

export function TeachersPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const { push, node } = useToasts();

  const { data, loading, error, refetch } = useTeachers({
    search: q || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const rows = useMemo(() => data?.items ?? [], [data]);

  const handleExport = () => {
    if (rows.length === 0) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv(
      'teachers.csv',
      rows.map(t => [t.name, t.email, t.schoolName ?? '', String(t.assessments ?? 0), t.status]),
      ['Name', 'Email', 'School', 'Assessments', 'Status'],
    );
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="People · Teachers"
        title="Teachers"
        subtitle="View and manage all teachers registered on the platform."
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>
            <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>Invite teacher</Button>
          </>
        }
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search teachers…" />
          <Select value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all',      label: 'All statuses' },
            { value: 'ACTIVE',   label: 'Active'       },
            { value: 'PENDING',  label: 'Pending'      },
            { value: 'INACTIVE', label: 'Inactive'     },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">
            {loading ? '…' : `${data?.meta?.total ?? 0} teachers`}
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
                key: 'name', label: 'Teacher',
                render: t => (
                  <div className="flex items-center gap-3">
                    <Avatar name={t.name} hue={t.avatarHue} />
                    <div className="min-w-0">
                      <div className="font-semibold text-fg1 truncate">{t.name}</div>
                      <div className="text-[11.5px] text-fg3 truncate flex items-center gap-1.5"><Mail size={11} />{t.email}</div>
                    </div>
                  </div>
                ),
              },
              { key: 'school',      label: 'School',      render: t => <span className="text-fg2">{t.schoolName ?? '—'}</span> },
              { key: 'assessments', label: 'Assessments', render: t => <span className="font-mono">{t.assessments}</span> },
              { key: 'status', label: 'Status', render: t => (
                <Badge tone={t.status === 'ACTIVE' ? 'success' : t.status === 'PENDING' ? 'warning' : 'neutral'}>
                  {t.status.toLowerCase()}
                </Badge>
              )},
              {
                key: 'actions', label: '', className: 'text-right',
                render: (t) => (
                  <button
                    onClick={() => window.open(`mailto:${t.email}`)}
                    title="Email teacher"
                    className="opacity-0 group-hover:opacity-100 transition w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-fg1 hover:bg-surface2"
                  >
                    <MoreVertical size={15} />
                  </button>
                ),
              },
            ]}
            rows={rows}
            empty={<div className="text-center py-12 text-fg3 text-[13px]">No teachers found</div>}
          />
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        role="TEACHER"
        onClose={() => setCreateOpen(false)}
        onCreated={refetch}
        push={push}
      />
    </>
  );
}
