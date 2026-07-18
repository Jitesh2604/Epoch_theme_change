import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, EmptyState } from './ui';
import { useUploadHistory, type UploadHistoryItem } from '../../hooks/useQuestions';

const STATUS_TONE: Record<UploadHistoryItem['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED:  'danger',
  PENDING: 'neutral',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function UploadRow({ item }: { item: UploadHistoryItem }) {
  const [open, setOpen] = useState(false);
  const hasErrors = item.errors.length > 0;

  return (
    <div className="border-t border-line/70 first:border-t-0">
      <button
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-surface1/50 transition disabled:cursor-default"
        onClick={() => hasErrors && setOpen(o => !o)}
        disabled={!hasErrors}
      >
        <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
          <FileSpreadsheet size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-fg1">
            {item.assessment ? `Imported into · ${item.assessment.title}` : 'Imported into question bank'}
          </div>
          <div className="text-[11.5px] text-fg3 mt-0.5">
            {item.uploadedBy.name} · {fmtDate(item.uploadedAt)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[12.5px] text-fg1">{item.rowsImported}/{item.totalRows} rows</div>
          {item.rowsFailed > 0 && <div className="text-[11px] text-rose-400 mt-0.5">{item.rowsFailed} failed</div>}
        </div>
        <Badge tone={STATUS_TONE[item.status]} className="shrink-0">{item.status.toLowerCase()}</Badge>
        {hasErrors && (open ? <ChevronUp size={14} className="text-fg3 shrink-0" /> : <ChevronDown size={14} className="text-fg3 shrink-0" />)}
      </button>

      {open && hasErrors && (
        <div className="px-4 pb-4 pt-1 space-y-1.5">
          {item.errors.map((e, i) => (
            <div key={i} className="text-[12px] text-fg2 bg-surface1 border border-line rounded-lg px-3 py-2">
              <span className="font-mono text-fg3">Row {e.row}{e.field ? ` · ${e.field}` : ''}:</span> {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UploadHistoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const roleLabel = location.pathname.startsWith('/teacher') ? 'Teacher' : 'Admin';
  const uploadPath = location.pathname.startsWith('/teacher') ? '/teacher/upload-questions' : '/admin/upload-questions';

  const [page, setPage] = useState(1);
  const { data, loading, error } = useUploadHistory({ page, limit: 20 });

  return (
    <>
      <PageHeader
        eyebrow={`${roleLabel} · Bulk Import`}
        title="Upload History"
        subtitle="Every Excel import you've run, with row counts and any validation errors."
        actions={<Button variant="outline" icon={ArrowLeft} onClick={() => navigate(uploadPath)}>Back to upload</Button>}
      />

      {error && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{error}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No uploads yet"
            desc="Excel imports you run from the Upload Questions page will show up here."
          />
        ) : (
          <div>
            {data.items.map(item => <UploadRow key={item.id} item={item} />)}
          </div>
        )}
      </Card>

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-fg3">Page {data.meta.page} of {data.meta.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  );
}
