import { useState, useEffect } from 'react';
import { Plus, KeyRound } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Table, Skeleton, EmptyState, Modal, useToasts } from '../../shared/ui';
import { teacherCodeApi, type TeacherCodeItem } from '../../../hooks/useTeacherCodes';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40';

export function TeacherCodesPage() {
  const { push, node } = useToasts();
  const [items, setItems] = useState<TeacherCodeItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refetch = () => {
    setLoading(true);
    teacherCodeApi.list(true).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetch(); }, []);

  const handleCreate = async () => {
    if (newCode.trim().length < 1) { push({ kind: 'danger', title: 'Teacher code is required' }); return; }
    setSubmitting(true);
    try {
      await teacherCodeApi.create({ code: newCode.trim() });
      push({ kind: 'success', title: 'Teacher code added' });
      setNewCode('');
      setAddOpen(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to add teacher code', sub: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: TeacherCodeItem) => {
    try {
      await teacherCodeApi.update(item.id, { isActive: !item.isActive });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Update failed', sub: e?.message });
    }
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="People · Assessment access"
        title="Teacher Codes"
        subtitle="Codes students enter to unlock Assessment. Deactivating a code immediately locks out anyone using it — Practice is never affected."
        actions={<Button icon={Plus} onClick={() => setAddOpen(true)}>Add teacher code</Button>}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <Table
            columns={[
              {
                key: 'code', label: 'Code',
                render: (item: TeacherCodeItem) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface2 border border-line grid place-items-center text-fg3"><KeyRound size={14} /></div>
                    <span className="font-mono font-semibold text-fg1">{item.code}</span>
                  </div>
                ),
              },
              {
                key: 'status', label: 'Status',
                render: (item: TeacherCodeItem) => <Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'active' : 'inactive'}</Badge>,
              },
              {
                key: 'actions', label: '', className: 'text-right',
                render: (item: TeacherCodeItem) => (
                  <Button size="sm" variant="outline" onClick={() => toggleActive(item)}>
                    {item.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                ),
              },
            ]}
            rows={items ?? []}
            empty={<EmptyState icon={KeyRound} title="No teacher codes yet" desc="Add a code and share it with students — entering it unlocks Assessment for them." />}
          />
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => { if (!submitting) { setAddOpen(false); setNewCode(''); } }}
        title="Add teacher code"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Adding…' : 'Add teacher code'}</Button>
          </>
        }
      >
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Teacher code</label>
          <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. MRS-SHARMA-9A" className={inputCls} />
        </div>
      </Modal>
    </>
  );
}
