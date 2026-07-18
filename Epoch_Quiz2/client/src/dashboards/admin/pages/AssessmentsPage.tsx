import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, ClipboardList, MoreVertical } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, EmptyState, Skeleton } from '../../shared/ui';
import { useAssessments, assessmentApi } from '../../../hooks/useAssessments';
import { useToasts } from '../../shared/ui';

export function AssessmentsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const { data, loading, error, refetch } = useAssessments({
    search: q || undefined,
    status: status !== 'all' ? status : undefined,
  });

  const navigate = useNavigate();
  const { push, node } = useToasts();

  const rows = data?.items ?? [];

  const handleArchive = async (id: string, title: string) => {
    await assessmentApi.archive(id);
    push({ kind: 'success', title: 'Archived', sub: `"${title}" has been archived.` });
    refetch();
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Content"
        title="Assessment Management"
        subtitle="Every assessment created on your publication, with controls for status, visibility, and performance."
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search assessments…" />
          <Select value={status} onChange={setStatus} options={[
            { value: 'all',       label: 'All statuses' },
            { value: 'PUBLISHED', label: 'Published'    },
            { value: 'DRAFT',     label: 'Draft'        },
            { value: 'ARCHIVED',  label: 'Archived'     },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">{loading ? '…' : `${data?.meta?.total ?? 0} results`}</div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch} className="mt-2">Retry</Button>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-36" /></Card>)}
        </div>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="No assessments match" desc="Try adjusting the search or filters above." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(a => (
            <Card key={a.id} className="p-5 hover:border-line2 transition group flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                  <ClipboardList size={18} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                    {a.status.toLowerCase()}
                  </Badge>
                  <button
                    onClick={() => handleArchive(a.id, a.title)}
                    className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-fg1 hover:bg-surface1"
                    title="Archive"
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              </div>
              <h3 className="font-display font-semibold text-[16px] text-fg1 leading-snug group-hover:text-brand transition mb-1">{a.title}</h3>
              <p className="text-[12.5px] text-fg3 leading-relaxed line-clamp-2 mb-3">{a.description ?? 'No description'}</p>
              <div className="text-[11px] text-fg3 mb-4">
                By <span className="text-fg2">{a.createdBy.name}</span>
                {a.subject && <> · {a.subject.name}</>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-line mt-auto">
                <div>
                  <div className="font-mono font-semibold text-[14px] text-fg1 flex items-center justify-center gap-1"><ClipboardList size={12} className="text-fg3" />{a.questionCount}</div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">questions</div>
                </div>
                <div>
                  <div className="font-mono font-semibold text-[14px] text-fg1 flex items-center justify-center gap-1"><Clock size={12} className="text-fg3" />{a.duration}m</div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">duration</div>
                </div>
                <div>
                  <div className="font-mono font-semibold text-[14px] text-fg1 flex items-center justify-center gap-1"><Users size={12} className="text-fg3" />{a.attempts}</div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">attempts</div>
                </div>
              </div>
              {/* A dedicated Preview action (view-only, no management controls)
                  used to sit next to Manage here, but both navigated to the
                  exact same page — a confusing duplicate. Removed for now;
                  re-add it as its own button once there's a real read-only
                  preview distinct from Manage. Manage is the one true entry
                  point into this assessment's page — extend that page
                  (question editing, settings, scheduling, publishing, etc.)
                  rather than introducing another duplicate route. */}
              <div className="flex gap-2 mt-4">
                <Button size="sm" className="w-full"
                  onClick={() => navigate(`/admin/assessments/${a.id}`)}>Manage</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
