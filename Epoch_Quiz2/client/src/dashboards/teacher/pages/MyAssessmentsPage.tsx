import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilePlus2, Clock, Users, ClipboardList, CheckCircle2, Eye,
  BookMarked, Star, Calendar, Hash, UserPlus,
} from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, EmptyState, Skeleton } from '../../shared/ui';
import { useAssessments, assessmentApi } from '../../../hooks/useAssessments';
import { useToasts } from '../../shared/ui';
import { AssignAssessmentModal } from '../../shared/AssignAssessmentModal';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MyAssessmentsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const { data, loading, error, refetch } = useAssessments({
    search: q || undefined,
    status: status !== 'all' ? status : undefined,
  });
  const { push, node } = useToasts();
  const [assignFor, setAssignFor] = useState<{ id: string; title: string } | null>(null);
  const rows = data?.items ?? [];

  const handlePublish = async (id: string, title: string) => {
    try {
      await assessmentApi.publish(id);
      push({ kind: 'success', title: 'Published', sub: `"${title}" is now live.` });
      refetch();
    } catch (e: any) { push({ kind: 'danger', title: 'Cannot publish', sub: e.message }); }
  };

  const handleUnpublish = async (id: string, title: string) => {
    try {
      await assessmentApi.unpublish(id);
      push({ kind: 'info', title: 'Unpublished', sub: `"${title}" is now a draft.` });
      refetch();
    } catch (e: any) { push({ kind: 'danger', title: 'Failed', sub: e.message }); }
  };

  const handleArchive = async (id: string, title: string) => {
    if (!confirm(`Archive "${title}"? It will no longer be available to students.`)) return;
    try {
      await assessmentApi.archive(id);
      push({ kind: 'info', title: 'Archived', sub: `"${title}" has been archived.` });
      refetch();
    } catch (e: any) { push({ kind: 'danger', title: 'Failed', sub: e.message }); }
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
        eyebrow="Teacher · Assessments"
        title="My Assessments"
        subtitle="Manage the assessments you've created."
        actions={<Button icon={FilePlus2} onClick={() => navigate('/teacher/create-assessment')}>Create assessment</Button>}
      />

      {/* Filters */}
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search assessments…" />
          <Select value={status} onChange={setStatus} options={[
            { value: 'all',       label: 'All statuses' },
            { value: 'PUBLISHED', label: 'Published'    },
            { value: 'DRAFT',     label: 'Draft'        },
            { value: 'ARCHIVED',  label: 'Archived'     },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">
            {loading ? '…' : `${data?.meta?.total ?? 0} result${data?.meta?.total !== 1 ? 's' : ''}`}
          </div>
        </div>
      </Card>

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-48" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            desc="Create your first assessment to get started."
            action={<Button icon={FilePlus2} onClick={() => navigate('/teacher/create-assessment')}>Create assessment</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(a => (
            <Card key={a.id} className="p-5 group flex flex-col hover:border-line2 transition">
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <ClipboardList size={18} />
                </div>
                <Badge
                  tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}
                >
                  {a.status.toLowerCase()}
                </Badge>
              </div>

              {/* Title & description */}
              <h3 className="font-display font-semibold text-[16px] text-fg1 leading-snug group-hover:text-brand transition mb-1">
                {a.title}
              </h3>
              <p className="text-[12.5px] text-fg3 line-clamp-2 mb-3">
                {a.description ?? 'No description'}
              </p>

              {/* Subject tag */}
              {a.subject && (
                <div className="mb-3">
                  <Badge tone="brand" dot={false}>{a.subject.name}</Badge>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 text-center py-3 border-y border-line mb-3">
                <div>
                  <div className="flex items-center justify-center gap-1 font-mono text-[14px] text-fg1">
                    <Hash size={10} className="text-fg3" />{a.questionCount}
                  </div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">questions</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 font-mono text-[14px] text-fg1">
                    <Clock size={10} className="text-fg3" />{a.duration}m
                  </div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">duration</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 font-mono text-[14px] text-fg1">
                    <Users size={10} className="text-fg3" />{a.attempts}
                  </div>
                  <div className="text-[10px] text-fg3 uppercase tracking-wider mt-0.5">attempts</div>
                </div>
              </div>

              {/* Marks + date row */}
              <div className="flex items-center justify-between text-[11.5px] text-fg3 mb-4">
                <div className="flex items-center gap-1">
                  <Star size={10} />
                  <span>{a.totalMarks} total marks</span>
                  {a.passingMarks > 0 && <span className="text-fg4"> · pass {a.passingMarks}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar size={10} />
                  <span>{formatDate(a.createdAt)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-auto">
                <Button
                  variant="outline" size="sm" icon={Eye} className="flex-1 min-w-[7rem]"
                  onClick={() => navigate(`/teacher/assessments/${a.id}/questions`)}
                >
                  Questions
                </Button>
                {a.status !== 'ARCHIVED' && (
                  <Button
                    variant="soft" size="sm" icon={UserPlus}
                    onClick={() => setAssignFor({ id: a.id, title: a.title })}
                  >
                    Assign
                  </Button>
                )}
                {a.status === 'DRAFT' && (
                  <Button size="sm" icon={CheckCircle2} className="flex-1"
                    onClick={() => handlePublish(a.id, a.title)}>
                    Publish
                  </Button>
                )}
                {a.status === 'PUBLISHED' && (
                  <Button variant="soft" size="sm" className="flex-1"
                    onClick={() => handleUnpublish(a.id, a.title)}>
                    Unpublish
                  </Button>
                )}
                {a.status === 'PUBLISHED' && (
                  <Button variant="ghost" size="sm" icon={BookMarked}
                    onClick={() => handleArchive(a.id, a.title)} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
