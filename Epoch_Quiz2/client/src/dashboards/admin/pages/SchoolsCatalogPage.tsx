import { useState, useEffect } from 'react';
import { Plus, Check, X, School as SchoolIcon, MapPin, Building2, Clock } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Table, Skeleton, EmptyState, Modal, Select, useToasts } from '../../shared/ui';
import { useAdminUsers } from '../../../hooks/useUsers';
import { userApi } from '../../../hooks/useUsers';
import { schoolApi, useSchoolCatalog, useSchoolStates, useSchoolBranches, type CatalogItem } from '../../../hooks/useSchools';

type Tab = 'approvals' | 'schools' | 'states' | 'branches';

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40';

// ── Pending School Approvals ────────────────────────────────────────────────

function ApprovalsTab({ push }: { push: (t: { kind?: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void }) {
  const { data, loading, error, refetch } = useAdminUsers({ role: 'SCHOOL_ADMIN', status: 'PENDING' });
  const rows = data?.items ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, status: 'ACTIVE' | 'INACTIVE') => {
    setBusyId(id);
    try {
      await userApi.update(id, { status });
      push({ kind: 'success', title: status === 'ACTIVE' ? 'School approved' : 'School registration rejected' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Action failed', sub: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Card className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</Card>;
  if (error) return <Card className="p-4"><p className="text-danger text-[13px]">{error}</p></Card>;

  return (
    <Card className="overflow-hidden">
      <Table
        columns={[
          {
            key: 'school', label: 'School',
            render: (u: any) => (
              <div className="min-w-0">
                <div className="font-semibold text-fg1 truncate">{u.schoolRegistration?.schoolName ?? '—'}</div>
                <div className="text-[11.5px] text-fg3 truncate">
                  {u.schoolRegistration?.branchName ?? '—'} · {u.schoolRegistration?.stateName ?? '—'}
                </div>
              </div>
            ),
          },
          {
            key: 'contact', label: 'Registered by',
            render: (u: any) => (
              <div className="min-w-0">
                <div className="text-fg1 truncate">{u.name}</div>
                <div className="text-[11.5px] text-fg3 truncate">{u.email}</div>
              </div>
            ),
          },
          { key: 'phone', label: 'Contact phone', render: (u: any) => <span className="text-fg2">{u.schoolRegistration?.contactPhone ?? '—'}</span> },
          {
            key: 'actions', label: '', className: 'text-right',
            render: (u: any) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" icon={X} disabled={busyId === u.id} onClick={() => act(u.id, 'INACTIVE')}>Reject</Button>
                <Button size="sm" icon={Check} disabled={busyId === u.id} onClick={() => act(u.id, 'ACTIVE')}>Approve</Button>
              </div>
            ),
          },
        ]}
        rows={rows}
        empty={
          <EmptyState icon={Clock} title="No pending registrations" desc="New school self-registrations will show up here for review." />
        }
      />
    </Card>
  );
}

// ── Generic simple catalog (School / State) ─────────────────────────────────

function SimpleCatalogTab({
  icon: Icon, noun, list, create, update, push,
}: {
  icon: any;
  noun: string;
  list: (includeInactive: boolean) => Promise<CatalogItem[]>;
  create: (data: { name: string }) => Promise<CatalogItem>;
  update: (id: string, data: { isActive?: boolean }) => Promise<CatalogItem>;
  push: (t: { kind?: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void;
}) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refetch = () => {
    setLoading(true);
    list(true).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetch(); }, []);

  const handleCreate = async () => {
    if (newName.trim().length < 1) { push({ kind: 'danger', title: `${noun} name is required` }); return; }
    setSubmitting(true);
    try {
      await create({ name: newName.trim() });
      push({ kind: 'success', title: `${noun} added` });
      setNewName('');
      setAddOpen(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: `Failed to add ${noun.toLowerCase()}`, sub: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    try {
      await update(item.id, { isActive: !item.isActive });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Update failed', sub: e?.message });
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button icon={Plus} onClick={() => setAddOpen(true)}>Add {noun.toLowerCase()}</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <Table
            columns={[
              {
                key: 'name', label: noun,
                render: (item: CatalogItem) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface2 border border-line grid place-items-center text-fg3"><Icon size={14} /></div>
                    <span className="font-semibold text-fg1">{item.name}</span>
                  </div>
                ),
              },
              {
                key: 'status', label: 'Status',
                render: (item: CatalogItem) => <Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'active' : 'inactive'}</Badge>,
              },
              {
                key: 'actions', label: '', className: 'text-right',
                render: (item: CatalogItem) => (
                  <Button size="sm" variant="outline" onClick={() => toggleActive(item)}>
                    {item.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                ),
              },
            ]}
            rows={items ?? []}
            empty={<EmptyState icon={Icon} title={`No ${noun.toLowerCase()}s yet`} desc={`Add your first ${noun.toLowerCase()} — it will then be selectable on the School registration form.`} />}
          />
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => { if (!submitting) { setAddOpen(false); setNewName(''); } }}
        title={`Add ${noun.toLowerCase()}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Adding…' : `Add ${noun.toLowerCase()}`}</Button>
          </>
        }
      >
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">{noun} name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`e.g. ${noun === 'School' ? 'Delhi Public School' : 'Delhi'}`} className={inputCls} />
        </div>
      </Modal>
    </>
  );
}

// ── Branch catalog (needs a School + State to scope create/list) ───────────

function BranchesTab({ push }: { push: (t: { kind?: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void }) {
  const { data: schools } = useSchoolCatalog(true);
  const [schoolId, setSchoolId] = useState('');
  const { data: states } = useSchoolStates(true);
  const [stateId, setStateId] = useState('');
  const { data: branches, loading, refetch } = useSchoolBranches(schoolId || null, stateId || null, true);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!schoolId || !stateId) { push({ kind: 'danger', title: 'Select a school and state first' }); return; }
    if (newName.trim().length < 1) { push({ kind: 'danger', title: 'Branch name is required' }); return; }
    setSubmitting(true);
    try {
      await schoolApi.createBranch({ schoolId, stateId, name: newName.trim() });
      push({ kind: 'success', title: 'Branch added' });
      setNewName('');
      setAddOpen(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to add branch', sub: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await schoolApi.updateBranch(id, { isActive: !isActive });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Update failed', sub: e?.message });
    }
  };

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={schoolId}
            onChange={setSchoolId}
            options={[{ value: '', label: 'Select school' }, ...(schools ?? []).map(s => ({ value: s.id, label: s.name }))]}
          />
          <Select
            value={stateId}
            onChange={setStateId}
            options={[{ value: '', label: 'Select state' }, ...(states ?? []).map(s => ({ value: s.id, label: s.name }))]}
          />
          <Button icon={Plus} className="ml-auto" disabled={!schoolId || !stateId} onClick={() => setAddOpen(true)}>Add branch</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!schoolId || !stateId ? (
          <EmptyState icon={Building2} title="Pick a school and state" desc="Select a school and state above to view or add its branches." />
        ) : loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <Table
            columns={[
              {
                key: 'name', label: 'Branch',
                render: (b: any) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface2 border border-line grid place-items-center text-fg3"><Building2 size={14} /></div>
                    <span className="font-semibold text-fg1">{b.name}</span>
                  </div>
                ),
              },
              {
                key: 'status', label: 'Status',
                render: (b: any) => <Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'active' : 'inactive'}</Badge>,
              },
              {
                key: 'actions', label: '', className: 'text-right',
                render: (b: any) => (
                  <Button size="sm" variant="outline" onClick={() => toggleActive(b.id, b.isActive)}>
                    {b.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                ),
              },
            ]}
            rows={branches ?? []}
            empty={<EmptyState icon={Building2} title="No branches yet" desc="Add the first branch for this school and state." />}
          />
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => { if (!submitting) { setAddOpen(false); setNewName(''); } }}
        title="Add branch"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Adding…' : 'Add branch'}</Button>
          </>
        }
      >
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Branch name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. DPS Rohini" className={inputCls} />
        </div>
      </Modal>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export function SchoolsCatalogPage() {
  const [tab, setTab] = useState<Tab>('approvals');
  const { push, node } = useToasts();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'approvals', label: 'Pending approvals' },
    { id: 'schools', label: 'Schools' },
    { id: 'states', label: 'States' },
    { id: 'branches', label: 'Branches' },
  ];

  return (
    <>
      {node}
      <PageHeader
        eyebrow="People · Schools"
        title="Schools"
        subtitle="Manage the School / State / Branch catalog used on the School registration form, and review pending self-registrations."
      />

      <div className="flex gap-1 mb-5 border-b border-line">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition ${
              tab === t.id ? 'border-brand text-fg1' : 'border-transparent text-fg3 hover:text-fg1'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'approvals' && <ApprovalsTab push={push} />}
      {tab === 'schools' && (
        <SimpleCatalogTab
          icon={SchoolIcon}
          noun="School"
          list={schoolApi.listSchools}
          create={schoolApi.createSchool}
          update={schoolApi.updateSchool}
          push={push}
        />
      )}
      {tab === 'states' && (
        <SimpleCatalogTab
          icon={MapPin}
          noun="State"
          list={(includeInactive) => schoolApi.listStates(undefined, includeInactive)}
          create={schoolApi.createState}
          update={schoolApi.updateState}
          push={push}
        />
      )}
      {tab === 'branches' && <BranchesTab push={push} />}
    </>
  );
}
