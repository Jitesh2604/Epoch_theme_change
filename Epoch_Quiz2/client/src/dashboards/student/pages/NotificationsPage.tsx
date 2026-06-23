import { Bell, BellOff, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { PageHeader, Card, Badge, Skeleton } from '../../shared/ui';
import { useNotifications } from '../../../hooks/useNotifications';

const TYPE_ICON: Record<string, any> = {
  GENERAL: Info, QUIZ: CheckCircle2, RESULT: CheckCircle2,
  CERTIFICATE: AlertTriangle, REMINDER: AlertOctagon,
};
const TYPE_COLOR: Record<string, string> = {
  GENERAL: 'text-sky-300', QUIZ: 'text-brand', RESULT: 'text-emerald-300',
  CERTIFICATE: 'text-amber-300', REMINDER: 'text-rose-300',
};

export function NotificationsPage() {
  const { data, loading, error } = useNotifications();
  const items = (data as any)?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        subtitle="Platform announcements and updates."
      />

      {error && (
        <Card className="p-4 mb-4"><p className="text-danger text-[13px]">{error}</p></Card>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-14" /></Card>
          ))
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
                  {new Date(n.createdAt).toLocaleDateString()}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
