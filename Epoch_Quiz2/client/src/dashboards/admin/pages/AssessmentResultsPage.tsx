import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Users, CheckCircle2, Eye, Clock, ExternalLink } from 'lucide-react';
import { PageHeader, Card, Button, Badge, EmptyState, Skeleton } from '../../shared/ui';
import { useAssessments, assessmentApi } from '../../../hooks/useAssessments';
import { useToasts } from '../../shared/ui';

/** ISO string -> value a <input type="datetime-local"> accepts (local time, no seconds/zone). */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Dedicated results-publication workflow — separate from AssessmentsPage.tsx
 * (general assessment CRUD). Every assessment the admin can see, with its
 * submission count and a focused set of controls for exactly one thing:
 * when its results become visible to students. Editing the assessment
 * itself (questions, assignment, etc.) still happens on the existing
 * "Manage" page (QuestionManagementPage.tsx, /admin/assessments/:id/questions).
 */
export function AssessmentResultsPage() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useAssessments({ limit: 50 });
  const { push, node } = useToasts();

  const rows = data?.items ?? [];

  // Per-row Result Publish Date input state, keyed by assessment id — seeded
  // from each assessment's current resultPublishAt once loaded.
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const dateFor = (id: string, current: string | null) =>
    dateDrafts[id] !== undefined ? dateDrafts[id] : toDatetimeLocal(current);

  const [savingId, setSavingId] = useState<string | null>(null);

  const handlePublish = async (id: string, title: string) => {
    setSavingId(id);
    try {
      await assessmentApi.publishResults(id);
      push({ kind: 'success', title: 'Results published', sub: `Students can now view results for "${title}".` });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot publish results', sub: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const handleUnpublish = async (id: string, title: string) => {
    setSavingId(id);
    try {
      await assessmentApi.unpublishResults(id);
      push({ kind: 'info', title: 'Results unpublished', sub: `"${title}" is back to Result Pending for students.` });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveDate = async (id: string, title: string, value: string) => {
    setSavingId(id);
    try {
      await assessmentApi.update(id, { resultPublishAt: value ? new Date(value).toISOString() : null });
      push({ kind: 'success', title: 'Result publish date saved', sub: `"${title}" updated.` });
      setDateDrafts(d => { const next = { ...d }; delete next[id]; return next; });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not save date', sub: e.message });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Content"
        title="Assessment Results"
        subtitle="Control when assessment results become visible to students. Before publishing, students see Result Pending — no score, percentage, or review."
      />

      {error && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch} className="mt-2">Retry</Button>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-44" /></Card>)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No assessments yet"
            desc="Create an assessment to manage its results here once students start submitting."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map(a => {
            const dateValue = dateFor(a.id, a.resultPublishAt);
            const dateDirty = dateDrafts[a.id] !== undefined && dateDrafts[a.id] !== toDatetimeLocal(a.resultPublishAt);
            const scheduledFuture = a.resultPublishAt && !a.resultsPublished && new Date(a.resultPublishAt).getTime() > Date.now();

            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-display font-semibold text-[16px] text-fg1 leading-snug">{a.title}</h3>
                    <div className="text-[11px] text-fg3 mt-0.5">
                      {a.subject?.name ?? 'Mixed Subjects'} ·
                      <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                        {a.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  <Badge tone={a.resultsVisible ? 'success' : 'neutral'}>
                    {a.resultsVisible ? 'Published' : scheduledFuture ? 'Scheduled' : 'Pending'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-surface1 border border-line">
                    <div className="flex items-center gap-1.5 text-[11px] text-fg3 uppercase tracking-wider mb-1">
                      <Users size={12} /> Submissions
                    </div>
                    <div className="font-mono font-semibold text-[18px] text-fg1">{a.attempts}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-surface1 border border-line">
                    <div className="flex items-center gap-1.5 text-[11px] text-fg3 uppercase tracking-wider mb-1">
                      {a.resultsVisible ? <CheckCircle2 size={12} /> : <Clock size={12} />} Results status
                    </div>
                    <div className="text-[13px] font-semibold text-fg1">
                      {a.resultsVisible
                        ? 'Visible to students'
                        : scheduledFuture
                          ? `From ${new Date(a.resultPublishAt!).toLocaleString()}`
                          : 'Result Pending'}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-[11px] font-semibold text-fg3 uppercase tracking-wider block mb-1.5">
                    Result Publish Date <span className="normal-case font-normal">(optional — auto-publishes at this time)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={dateValue}
                      onChange={e => setDateDrafts(d => ({ ...d, [a.id]: e.target.value }))}
                      className="flex-1 h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                    />
                    {dateDirty && (
                      <Button size="sm" disabled={savingId === a.id} onClick={() => handleSaveDate(a.id, a.title, dateValue)}>
                        Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!a.resultsPublished ? (
                    <Button size="sm" icon={CheckCircle2} disabled={savingId === a.id} onClick={() => handlePublish(a.id, a.title)}>
                      Publish Results
                    </Button>
                  ) : (
                    <Button size="sm" variant="soft" icon={Eye} disabled={savingId === a.id} onClick={() => handleUnpublish(a.id, a.title)}>
                      Unpublish Results
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost" icon={ExternalLink}
                    onClick={() => navigate(`/admin/assessments/${a.id}/questions`)}
                  >
                    Manage questions
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
