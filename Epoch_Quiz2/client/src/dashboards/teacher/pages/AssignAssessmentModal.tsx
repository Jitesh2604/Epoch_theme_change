import { useEffect, useState } from 'react';
import { Users, GraduationCap, Search } from 'lucide-react';
import { Modal, Button, Badge, Skeleton } from '../../shared/ui';
import { assessmentApi } from '../../../hooks/useAssessments';
import { useClasses } from '../../../hooks/useCatalog';
import { useStudents } from '../../../hooks/useUsers';

interface Props {
  assessmentId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  push: (t: { kind: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void;
}

/**
 * Assign an assessment to whole classes and/or individual students.
 * Replace-set semantics: whatever is checked here becomes the assignment.
 */
export function AssignAssessmentModal({ assessmentId, title, open, onClose, onDone, push }: Props) {
  const { data: classes } = useClasses();
  const [search, setSearch] = useState('');
  const { data: students, loading: studentsLoading } = useStudents({ search: search || undefined, limit: 50 });

  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the current assignment when the modal opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    assessmentApi.getAssignments(assessmentId)
      .then(a => {
        setClassIds(new Set(a.classes.map(c => c.id)));
        setStudentIds(new Set(a.students.map(s => s.id)));
      })
      .catch(() => { /* leave empty on failure */ })
      .finally(() => setLoading(false));
  }, [open, assessmentId]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await assessmentApi.assign(assessmentId, {
        classIds: [...classIds],
        studentIds: [...studentIds],
      });
      push({ kind: 'success', title: 'Assignment saved', sub: `"${title}" is now visible to the selected students.` });
      onDone?.();
      onClose();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not save assignment', sub: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = classIds.size + studentIds.size;

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={`Assign · ${title}`}
      size="lg"
      footer={
        <>
          <span className="text-[12px] text-fg3 mr-auto">
            {classIds.size} class{classIds.size !== 1 ? 'es' : ''} · {studentIds.size} student{studentIds.size !== 1 ? 's' : ''}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : totalSelected === 0 ? 'Clear assignment' : 'Save assignment'}
          </Button>
        </>
      }
    >
      {loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Classes */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-fg1 font-semibold text-[13px]">
              <GraduationCap size={15} className="text-brand" /> Classes
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {(classes ?? []).map(c => (
                <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface1">
                  <input
                    type="checkbox"
                    checked={classIds.has(c.id)}
                    onChange={() => toggle(classIds, c.id, setClassIds)}
                  />
                  <span className="text-[13px] text-fg1">{c.name}</span>
                </label>
              ))}
              {!classes?.length && <div className="px-3 py-4 text-[12px] text-fg3">No classes found.</div>}
            </div>
          </div>

          {/* Students */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-fg1 font-semibold text-[13px]">
              <Users size={15} className="text-brand" /> Students
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full h-9 pl-8 pr-3 rounded-xl bg-surface1 border border-line text-[12.5px] text-fg1"
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {studentsLoading ? (
                <div className="px-3 py-4"><Skeleton className="h-16" /></div>
              ) : (students?.items ?? []).map(s => (
                <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface1">
                  <input
                    type="checkbox"
                    checked={studentIds.has(s.id)}
                    onChange={() => toggle(studentIds, s.id, setStudentIds)}
                  />
                  <span className="text-[13px] text-fg1 flex-1 truncate">{s.name}</span>
                  <span className="text-[11px] text-fg3 truncate">{s.email}</span>
                </label>
              ))}
              {!studentsLoading && !students?.items?.length && (
                <div className="px-3 py-4 text-[12px] text-fg3">No students found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-surface1 border border-line">
        <Badge tone="brand" dot={false}>Tip</Badge>
        <p className="text-[12px] text-fg3">
          Students see this assessment only if they are selected here — directly, or via a class they belong to.
          Publish the assessment so assigned students can start it.
        </p>
      </div>
    </Modal>
  );
}
