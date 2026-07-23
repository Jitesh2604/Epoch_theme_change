import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, ClipboardList, FilePlus2, UserPlus, Archive, Trash2 } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, EmptyState, Skeleton } from '../../shared/ui';
import { useAssessments, assessmentApi } from '../../../hooks/useAssessments';
import { useToasts } from '../../shared/ui';
import { AssignAssessmentModal } from '../../shared/AssignAssessmentModal';

export function AssessmentsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const { data, loading, error, refetch } = useAssessments({
    search: q || undefined,
    status: status !== 'all' ? status : undefined,
  });

  const navigate = useNavigate();
  const { push, node } = useToasts();
  const [assignFor, setAssignFor] = useState<{ id: string; title: string } | null>(null);

  const rows = data?.items ?? [];

  const handleArchive = async (id: string, title: string) => {
    if (!confirm(`Archive "${title}"? It will no longer be available to students.`)) return;
    await assessmentApi.archive(id);
    push({ kind: 'success', title: 'Archived', sub: `"${title}" has been archived.` });
    refetch();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;
    try {
      await assessmentApi.remove(id);
      push({ kind: 'success', title: 'Deleted', sub: `"${title}" has been removed.` });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot delete', sub: e.message });
    }
  };

  return (
    <>
      {node}
      {assignFor && (
        <AssignAssessmentModal
          assessmentId={assignFor.id}
          title={assignFor.title}
          open={!!assignFor}
          onClose={() => setAssignFor(null)}
          onDone={refetch}
          push={push}
        />
      )}
      <PageHeader
        eyebrow="Content"
        title="Assessment Management"
        subtitle="Every assessment created on your publication, with controls for status, visibility, and performance."
        actions={<Button icon={FilePlus2} onClick={() => navigate('/admin/create-assessment')}>New assessment</Button>}
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
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assessments match"
            desc="Try adjusting the search or filters above."
            action={<Button icon={FilePlus2} onClick={() => navigate('/admin/create-assessment')}>New assessment</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(a => (
            <Card key={a.id} className="p-5 hover:border-line2 transition group flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                  <ClipboardList size={18} />
                </div>
                <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                  {a.status.toLowerCase()}
                </Badge>
              </div>
              <h3 className="font-display font-semibold text-[16px] text-fg1 leading-snug group-hover:text-brand transition mb-1">{a.title}</h3>
              <p className="text-[12.5px] text-fg3 leading-relaxed line-clamp-2 mb-3">{a.description ?? 'No description'}</p>
              <div className="text-[11px] text-fg3 mb-4">
                By <span className="text-fg2">{a.createdBy.name}</span> · {a.subject?.name ?? 'Mixed Subjects'}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-line mb-4">
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

              <div className="flex flex-wrap gap-2 mt-auto">
                <Button size="sm" className="flex-1 min-w-[7rem]"
                  onClick={() => navigate(`/admin/assessments/${a.id}/questions`)}>Manage</Button>
                {a.status !== 'ARCHIVED' && (
                  <Button variant="soft" size="sm" icon={UserPlus}
                    onClick={() => setAssignFor({ id: a.id, title: a.title })}>Assign</Button>
                )}
                {a.status !== 'ARCHIVED' && (
                  <Button variant="ghost" size="sm" icon={Archive}
                    onClick={() => handleArchive(a.id, a.title)} title="Archive" />
                )}
                <Button variant="ghost" size="sm" icon={Trash2}
                  onClick={() => handleDelete(a.id, a.title)} title="Delete" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
