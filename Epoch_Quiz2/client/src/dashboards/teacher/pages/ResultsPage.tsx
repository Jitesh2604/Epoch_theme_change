import { useState } from 'react';
import { Download, Award } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, ProgressBar, Table, Skeleton, useToasts } from '../../shared/ui';
import { useSubmissions } from '../../../hooks/useSubmissions';
import { exportCsv } from '../../../lib/csv';

export function ResultsPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { push, node } = useToasts();

  const { data, loading, error, refetch } = useSubmissions({
    limit: 40,
    ...(statusFilter !== 'all' ? {} : {}),
  });

  const rows = (data?.items ?? []).filter(s => {
    const matchQ = !q || s.student?.name?.toLowerCase().includes(q.toLowerCase()) || s.assessment.title.toLowerCase().includes(q.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchQ && matchStatus;
  });

  const handleExport = () => {
    if (rows.length === 0) { push({ kind: 'info', title: 'Nothing to export' }); return; }
    exportCsv(
      'results.csv',
      rows.map(s => [s.student?.name ?? '', s.assessment.title, s.assessment.subject?.name ?? 'Mixed Subjects', String(s.score), String(s.totalMarks), String(s.percent), s.status]),
      ['Student', 'Assessment', 'Subject', 'Score', 'Total', 'Percent (%)', 'Status'],
    );
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Teacher · Results"
        title="Student Results"
        subtitle="All submissions across your assessments."
        actions={<Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>}
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search by student or assessment…" />
          <Select value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all',       label: 'All statuses' },
            { value: 'GRADED',    label: 'Graded'       },
            { value: 'SUBMITTED', label: 'Submitted'    },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">{loading ? '…' : `${rows.length} results`}</div>
        </div>
      </Card>

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p><Button size="sm" variant="outline" onClick={refetch} className="mt-2">Retry</Button></Card>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          <Table
            columns={[
              { key: 'student',    label: 'Student',    render: s => <span className="font-semibold text-fg1">{s.student?.name ?? '—'}</span> },
              { key: 'assessment', label: 'Assessment', render: s => <span className="text-fg2 truncate max-w-[180px] block">{s.assessment.title}</span> },
              { key: 'subject',    label: 'Subject',    render: s => <span className="text-fg3">{s.assessment.subject?.name ?? 'Mixed Subjects'}</span> },
              {
                key: 'score', label: 'Score',
                render: s => (
                  <div className="min-w-[120px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[13px] text-fg1">{s.score}/{s.totalMarks}</span>
                      <span className="text-[11px] text-fg3">({s.percent}%)</span>
                    </div>
                    <ProgressBar value={s.percent} tone={s.percent >= 75 ? 'emerald' : s.percent >= 50 ? 'amber' : 'rose'} />
                  </div>
                ),
              },
              { key: 'status', label: 'Status', render: s => <Badge tone={s.percent >= 50 ? 'success' : 'danger'}>{s.status.toLowerCase()}</Badge> },
            ]}
            rows={rows}
            empty={<div className="text-center py-12 text-fg3 text-[13px]">No results found</div>}
          />
        )}
      </Card>
    </>
  );
}
