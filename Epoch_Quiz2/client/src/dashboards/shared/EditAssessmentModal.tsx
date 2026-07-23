import { useEffect, useState } from 'react';
import { Modal, Button, useToasts } from './ui';
import { useAssessment, assessmentApi } from '../../hooks/useAssessments';
import { useSubjects } from '../../hooks/useSubjects';

interface Props {
  assessmentId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  instructions: string;
  subjectId: string;
  duration: number;
  passingMarks: number;
  negativeMarking: boolean;
  negativeMarksValue: number;
  resultsPublished: boolean;
  resultPublishAt: string; // datetime-local value, '' = unset
}

const EMPTY: FormState = {
  title: '', description: '', instructions: '', subjectId: '',
  duration: 30, passingMarks: 0, negativeMarking: false, negativeMarksValue: 0,
  resultsPublished: false, resultPublishAt: '',
};

/** ISO string -> value a <input type="datetime-local"> accepts (local time, no seconds/zone). */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Edit an existing assessment's metadata — title, subject, duration, marks,
 *  instructions. Same field set as CreateAssessmentPage, as a modal so it can
 *  be reached in-context from QuestionManagementPage without navigating away. */
export function EditAssessmentModal({ assessmentId, open, onClose, onSaved }: Props) {
  const { data: assessment, loading } = useAssessment(assessmentId);
  const { data: subjects } = useSubjects();
  const { push, node } = useToasts();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !assessment) return;
    setForm({
      title: assessment.title,
      description: assessment.description ?? '',
      instructions: assessment.instructions ?? '',
      subjectId: assessment.subject?.id ?? '',
      duration: assessment.duration,
      passingMarks: assessment.passingMarks,
      negativeMarking: assessment.negativeMarking,
      negativeMarksValue: assessment.negativeMarksValue,
      resultsPublished: assessment.resultsPublished,
      resultPublishAt: toDatetimeLocal(assessment.resultPublishAt),
    });
  }, [open, assessment]);

  const save = async () => {
    if (!form.title.trim()) { push({ kind: 'danger', title: 'Title is required' }); return; }
    setSaving(true);
    try {
      await assessmentApi.update(assessmentId, {
        title: form.title,
        description: form.description || undefined,
        instructions: form.instructions || null,
        subjectExternalId: form.subjectId || undefined,
        duration: form.duration,
        passingMarks: form.passingMarks,
        negativeMarking: form.negativeMarking,
        negativeMarksValue: form.negativeMarksValue,
        resultsPublished: form.resultsPublished,
        resultPublishAt: form.resultPublishAt ? new Date(form.resultPublishAt).toISOString() : null,
      });
      push({ kind: 'success', title: 'Assessment updated' });
      onSaved();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not save changes', sub: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {node}
      <Modal
        open={open}
        onClose={() => !saving && onClose()}
        title="Edit assessment details"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        }
      >
        {loading ? (
          <div className="text-[13px] text-fg3 py-8 text-center">Loading…</div>
        ) : (
          <div className="space-y-4">
            <Field label="Title" required>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
              />
            </Field>

            <Field label="Instructions" hint="Shown to students on the pre-start overview screen.">
              <textarea
                value={form.instructions}
                onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                rows={3}
                placeholder="e.g. Read each question carefully. No negative marking. Submit before time runs out."
                className="w-full px-3 py-2 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject" hint="Leave blank for a mixed-subject exam.">
                <select
                  value={form.subjectId}
                  onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}
                  className="w-full h-10 px-2.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1"
                >
                  <option value="">Mixed Subjects (default)</option>
                  {(subjects ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number" min={1} max={1440}
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Passing marks">
                <input
                  type="number" min={0}
                  value={form.passingMarks}
                  onChange={e => setForm(f => ({ ...f, passingMarks: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                />
              </Field>
              <Field label="Negative marks per wrong answer">
                <input
                  type="number" min={0} step={0.5}
                  value={form.negativeMarksValue}
                  disabled={!form.negativeMarking}
                  onChange={e => setForm(f => ({ ...f, negativeMarksValue: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 disabled:opacity-50"
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.negativeMarking}
                onChange={e => setForm(f => ({ ...f, negativeMarking: e.target.checked }))}
              />
              <span className="text-[12.5px] text-fg2">Enable negative marking</span>
            </label>

            <div className="pt-2 border-t border-line space-y-3">
              <div className="text-[12px] font-semibold text-fg2">Result visibility</div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.resultsPublished}
                  onChange={e => setForm(f => ({ ...f, resultsPublished: e.target.checked }))}
                />
                <span className="text-[12.5px] text-fg2">Publish results to students now</span>
              </label>
              <Field
                label="Auto-publish results at"
                hint="Results become visible to students as soon as either control here is set, whichever happens first. Leave blank to only publish manually."
              >
                <input
                  type="datetime-local"
                  value={form.resultPublishAt}
                  onChange={e => setForm(f => ({ ...f, resultPublishAt: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-fg2 block mb-1.5">
        {label}{required && <span className="text-brand ml-0.5">*</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-fg3 mt-1">{hint}</div>}
    </div>
  );
}
