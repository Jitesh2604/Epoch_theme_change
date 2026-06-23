import { useState } from 'react';
import { Bell, BellOff, Plus, Trash2, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, Modal } from '../../shared/ui';
import { useNotifications, notificationApi } from '../../../hooks/useNotifications';
import { useToasts } from '../../shared/ui';

const TYPE_ICON: Record<string, any> = { GENERAL: Info, QUIZ: CheckCircle2, RESULT: CheckCircle2, CERTIFICATE: AlertTriangle, REMINDER: AlertOctagon };
const TYPE_COLOR: Record<string, string> = { GENERAL: 'text-sky-300', QUIZ: 'text-brand', RESULT: 'text-emerald-300', CERTIFICATE: 'text-amber-300', REMINDER: 'text-rose-300' };

export function NotificationsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, error, refetch } = useNotifications();
  const { push, node } = useToasts();
  const items = (data as any)?.items ?? [];

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await notificationApi.create({ title, message });
      push({ kind: 'success', title: 'Notification created' });
      setTitle('');
      setMessage('');
      setCreateOpen(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification?')) return;
    try {
      await notificationApi.remove(id);
      push({ kind: 'success', title: 'Deleted' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    }
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        subtitle="Manage platform-wide notifications for teachers and students."
        actions={
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>New notification</Button>
        }
      />

      {error && <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-14" /></Card>)
        ) : items.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center py-16 text-center">
              <BellOff size={32} className="text-fg3 mb-3" />
              <p className="text-fg3 text-[13px]">No notifications yet</p>
            </div>
          </Card>
        ) : items.map((n: any) => {
          const Icon = TYPE_ICON[n.type] ?? Bell;
          const color = TYPE_COLOR[n.type] ?? 'text-fg3';
          return (
            <Card key={n.id} className="p-4 flex items-start gap-4">
              <div className={`w-9 h-9 rounded-xl bg-surface1 border border-line grid place-items-center shrink-0 ${color}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-semibold text-fg1">{n.title}</span>
                  <Badge tone="neutral" dot={false}>{n.type.toLowerCase()}</Badge>
                </div>
                <p className="text-[12.5px] text-fg2 leading-relaxed">{n.message}</p>
                <div className="text-[11px] text-fg3 mt-1">
                  {new Date(n.createdAt).toLocaleDateString()} · {n.isSent ? 'Sent' : 'Pending'}
                </div>
              </div>
              <button onClick={() => handleDelete(n.id)} className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-danger hover:bg-surface1 shrink-0">
                <Trash2 size={14} />
              </button>
            </Card>
          );
        })}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Notification"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Title</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Message</label>
            <textarea
              value={message} onChange={e => setMessage(e.target.value)}
              rows={4}
              placeholder="Notification message…"
              className="w-full px-3 py-2.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
