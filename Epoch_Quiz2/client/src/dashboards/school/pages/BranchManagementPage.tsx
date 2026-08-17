import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, RefreshCw, Ban, Users, Copy, Check, MapPin, BarChart3 } from 'lucide-react';
import { useMyBranches, branchCodeAdminApi, type SchoolBranchItem } from '../../../hooks/useBranchCodes';
import { schoolApi, type CatalogItem } from '../../../hooks/useSchools';
import { useSchoolStudents } from '../../../hooks/useSchoolPanel';
import { groupByBranch } from '../schoolAggregates';
import {
  SchoolCard, SchoolPageHeading, SchoolButton, SchoolPill, SchoolSkeleton, SchoolEmptyState, SchoolModal,
  SchoolLabel, SchoolFieldError, SchoolInput, SchoolSelect, SchoolTextarea, useSchoolToasts,
} from '../schoolUI';

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-1 text-[var(--sp-muted)] hover:text-[var(--sp-text)] transition"
      title="Copy code"
      onClick={() => {
        navigator.clipboard.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={13} className="text-[var(--sp-success)]" /> : <Copy size={13} />}
    </button>
  );
}

// Create Branch — always for the logged-in School Admin's own school
// (never a schoolId picked here; the backend resolves it server-side).
function CreateBranchModal({ open, onClose, onCreated, push }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  push: (t: { kind: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void;
}) {
  const [name, setName]       = useState('');
  const [city, setCity]       = useState('');
  const [address, setAddress] = useState('');
  const [stateId, setStateId] = useState('');
  const [states, setStates]   = useState<CatalogItem[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    schoolApi.listStates().then(setStates).catch(() => setStates([])).finally(() => setLoadingStates(false));
  }, [open]);

  const reset = () => { setName(''); setCity(''); setAddress(''); setStateId(''); setErrors({}); };
  const close = () => { if (!saving) { reset(); onClose(); } };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name = 'Branch name is required';
    if (!city.trim())    errs.city = 'City is required';
    if (!address.trim()) errs.address = 'Address is required';
    if (!stateId)         errs.stateId = 'Select a state';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await branchCodeAdminApi.createBranch({ name: name.trim(), stateId, city: city.trim(), address: address.trim() });
      push({ kind: 'success', title: 'Branch created', sub: `"${name.trim()}" is ready — generate a Branch Code for it below.` });
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not create branch', sub: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SchoolModal
      open={open}
      onClose={close}
      title="Create Branch"
      footer={
        <>
          <SchoolButton variant="secondary" onClick={close} disabled={saving}>Cancel</SchoolButton>
          <SchoolButton icon={Plus} onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</SchoolButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <SchoolLabel required>Branch Name</SchoolLabel>
          <SchoolInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rohini Campus" />
          <SchoolFieldError>{errors.name}</SchoolFieldError>
        </div>
        <div>
          <SchoolLabel required>City</SchoolLabel>
          <SchoolInput value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
          <SchoolFieldError>{errors.city}</SchoolFieldError>
        </div>
        <div>
          <SchoolLabel required>State</SchoolLabel>
          <SchoolSelect value={stateId} onChange={setStateId} options={[{ value: '', label: loadingStates ? 'Loading states…' : 'Select state' }, ...states.map(s => ({ value: s.id, label: s.name }))]} className="w-full" />
          <SchoolFieldError>{errors.stateId}</SchoolFieldError>
        </div>
        <div>
          <SchoolLabel required>Address</SchoolLabel>
          <SchoolTextarea value={address} onChange={e => setAddress(e.target.value)} rows={3} placeholder="Street, area" />
          <SchoolFieldError>{errors.address}</SchoolFieldError>
        </div>
      </div>
    </SchoolModal>
  );
}

export function BranchManagementPage() {
  const navigate = useNavigate();
  const { push, node } = useSchoolToasts();
  const { data: branches, loading, refetch } = useMyBranches();
  const { data: roster, loading: rosterLoading } = useSchoolStudents({ page: 1, limit: 500 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const perf = useMemo(() => {
    const groups = groupByBranch(roster?.items ?? []);
    return new Map(groups.map(g => [g.label, g]));
  }, [roster]);

  const generateCode = async (b: SchoolBranchItem) => {
    setBusyId(b.id);
    try {
      await branchCodeAdminApi.generateCode(b.id);
      push({ kind: 'success', title: b.activeCode ? 'Branch code regenerated' : 'Branch code generated' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to generate code', sub: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  const deactivateCode = async (b: SchoolBranchItem) => {
    if (!b.activeCode) return;
    setBusyId(b.id);
    try {
      await branchCodeAdminApi.deactivateCode(b.activeCode.id);
      push({ kind: 'success', title: 'Branch code deactivated' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to deactivate code', sub: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {node}
      <CreateBranchModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetch} push={push} />

      <SchoolPageHeading
        title="Branch Management"
        subtitle="Every branch has its own code — students verify their selected branch with it to unlock Assessment."
        actions={<SchoolButton icon={Plus} onClick={() => setCreateOpen(true)}>Create Branch</SchoolButton>}
      />

      {loading || rosterLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-52" /></SchoolCard>)}
        </div>
      ) : !branches?.length ? (
        <SchoolCard>
          <SchoolEmptyState
            icon={Building2}
            title="No branches yet"
            desc="Create your school's first branch to get started — students will be able to select it and verify with a Branch Code once it exists."
            action={<SchoolButton icon={Plus} onClick={() => setCreateOpen(true)}>Create Branch</SchoolButton>}
          />
        </SchoolCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(b => {
            const g = perf.get(b.name);
            return (
              <SchoolCard key={b.id} className="flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--sp-navy-100)] text-[var(--sp-navy)] grid place-items-center shrink-0 text-[17px]">🏫</div>
                    <div className="min-w-0">
                      <h4 className="font-body font-extrabold text-[15px] text-[var(--sp-text)] truncate">{b.name}</h4>
                      {b.city && <p className="text-[11.5px] text-[var(--sp-muted)] flex items-center gap-1 truncate"><MapPin size={10} />{b.city}</p>}
                    </div>
                  </div>
                  <SchoolPill tone={b.activeCode ? 'success' : 'neutral'}>{b.activeCode ? 'code active' : 'no code'}</SchoolPill>
                </div>

                {b.address && <p className="text-[11.5px] text-[var(--sp-muted)] mb-3 line-clamp-2">{b.address}</p>}

                <div className="space-y-2.5 mb-3">
                  <div>
                    <div className="flex items-center justify-between text-[11.5px] mb-1"><span className="text-[var(--sp-muted)] font-semibold">Average score</span><span className="font-bold text-[var(--sp-text)]">{g ? `${g.averagePercentage}%` : '—'}</span></div>
                    <div className="h-2 rounded-full bg-[var(--sp-bg)] border border-[var(--sp-border)] overflow-hidden"><div className="h-full rounded-full bg-[var(--sp-navy)]" style={{ width: `${g?.averagePercentage ?? 0}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11.5px] mb-1"><span className="text-[var(--sp-muted)] font-semibold">Participation</span><span className="font-bold text-[var(--sp-text)]">{g ? `${g.participationPercent}%` : '—'}</span></div>
                    <div className="h-2 rounded-full bg-[var(--sp-bg)] border border-[var(--sp-border)] overflow-hidden"><div className="h-full rounded-full bg-[var(--sp-teal)]" style={{ width: `${g?.participationPercent ?? 0}%` }} /></div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--sp-text)] mb-3">
                  <Users size={13} className="text-[var(--sp-muted-2)]" /> {g?.studentCount ?? 0} students
                </div>

                <div className="rounded-xl bg-[var(--sp-surface-alt)] border border-[var(--sp-border)] px-3 py-2.5 mb-3 flex items-center justify-between">
                  {b.activeCode ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[13px] text-[var(--sp-text)]">{b.activeCode.code}</span>
                      <CopyCodeButton code={b.activeCode.code} />
                    </span>
                  ) : <span className="text-[12px] text-[var(--sp-muted)]">No active code</span>}
                  <div className="flex items-center gap-1">
                    <button title={b.activeCode ? 'Regenerate' : 'Generate'} disabled={busyId === b.id} onClick={() => generateCode(b)} className="w-7 h-7 grid place-items-center rounded-lg text-[var(--sp-muted)] hover:text-[var(--sp-navy)] hover:bg-white transition disabled:opacity-50"><RefreshCw size={13} /></button>
                    {b.activeCode && (
                      <button title="Deactivate" disabled={busyId === b.id} onClick={() => deactivateCode(b)} className="w-7 h-7 grid place-items-center rounded-lg text-[var(--sp-muted)] hover:text-[var(--sp-danger)] hover:bg-white transition disabled:opacity-50"><Ban size={13} /></button>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <button onClick={() => navigate(`/school/students?branchId=${b.id}`)} className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-bold text-[var(--sp-navy)] bg-[var(--sp-navy-100)] hover:bg-[var(--sp-border-strong)] transition">
                    <Users size={13} /> Students
                  </button>
                  <button onClick={() => navigate(`/school/analytics?branchId=${b.id}`)} className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-bold text-[var(--sp-teal-600)] bg-[var(--sp-teal-100)] hover:bg-[var(--sp-teal-100)]/70 transition">
                    <BarChart3 size={13} /> Analytics
                  </button>
                </div>
              </SchoolCard>
            );
          })}
        </div>
      )}

      {/* Renaming/editing a branch's own details (name/city/address) has no
          backing endpoint today — only Create, Generate/Regenerate Code,
          and Deactivate Code are real, existing capabilities, all kept
          above. Not adding a facade "Edit" button that doesn't do anything. */}
      <p className="text-[11.5px] font-semibold text-[var(--sp-muted-2)] mt-4">
        Only branches belonging to your own school are ever shown or editable here.
      </p>
    </div>
  );
}
