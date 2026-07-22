import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ChevronLeft, ArrowRight, Wand2, FilePlus2, Sparkles } from 'lucide-react';
import { PageHeader, Card, Button } from './ui';
import { useToasts } from './ui';
import { assessmentApi } from '../../hooks/useAssessments';
import { useSubjects } from '../../hooks/useSubjects';

interface FormData {
  title: string;
  description: string;
  instructions: string;
  subjectId: string;
  duration: number;
  passingMarks: number;
}

/** Shared between Teacher and Admin — same create flow, only the eyebrow
 *  label and post-create destination differ per role. */
export function CreateAssessmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const assessmentsPath = isAdmin ? '/admin/assessments' : '/teacher/assessments';
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    defaultValues: { title: '', description: '', instructions: '', subjectId: '', duration: 30, passingMarks: 0 },
  });
  const { push, node } = useToasts();
  const [submitting, setSubmitting] = useState(false);
  const { data: subjects } = useSubjects();

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const assessment = await assessmentApi.create({
        title:        data.title,
        description:  data.description || undefined,
        instructions: data.instructions || undefined,
        duration:     data.duration,
        subjectExternalId: data.subjectId || undefined,
        passingMarks: data.passingMarks,
      });
      push({ kind: 'success', title: 'Assessment created', sub: `"${data.title}" is ready — add questions next.` });
      setTimeout(() => navigate(`${assessmentsPath}/${assessment.id}/questions`), 600);
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to create', sub: e.message });
      setSubmitting(false);
    }
  };

  const watchedTitle = watch('title');

  return (
    <>
      {node}
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-[12.5px] text-fg3 hover:text-fg1 mb-4">
        <ChevronLeft size={14} />Back
      </button>
      <PageHeader
        eyebrow={isAdmin ? 'Admin · Create' : 'Teacher · Create'}
        title="Create a new assessment"
        subtitle="Define the essentials. You'll add questions in the next step."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
            <Field label="Assessment title" required error={errors.title?.message}>
              <input
                {...register('title', { required: 'Please name your assessment' })}
                placeholder="e.g. Algebra Foundations Mid-Term"
                className="w-full h-11 px-3.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
            </Field>

            <Field label="Description" error={errors.description?.message}>
              <textarea
                {...register('description')}
                rows={4}
                placeholder="Describe what this assessment covers…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
            </Field>

            <Field label="Instructions" error={errors.instructions?.message}>
              <textarea
                {...register('instructions')}
                rows={3}
                placeholder="Shown to students before they start — e.g. read each question carefully, no negative marking…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Subject" required>
                <select
                  {...register('subjectId', { required: true })}
                  className="w-full h-11 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1"
                >
                  <option value="">— Select subject —</option>
                  {(subjects ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Duration (minutes)" required>
                <input
                  type="number" min={5} max={240}
                  {...register('duration', { required: true, min: 5, max: 240, valueAsNumber: true })}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                />
              </Field>
            </div>

            <Field label="Passing marks">
              <input
                type="number" min={0}
                {...register('passingMarks', { min: 0, valueAsNumber: true })}
                className="w-full h-11 px-3.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Button variant="ghost" type="button" onClick={() => navigate(assessmentsPath)}>Cancel</Button>
              <Button type="submit" icon={ArrowRight} disabled={submitting}>
                {submitting ? 'Creating…' : 'Continue to questions'}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 text-fg1 font-semibold">
              <Sparkles size={16} className="text-brand" />Live preview
            </div>
            <div className="rounded-xl border border-line p-4 bg-surface1/50">
              <div className="text-[10px] uppercase tracking-wider text-fg3 mb-2">Assessment</div>
              <div className="font-display font-semibold text-[18px] text-fg1 leading-snug">
                {watchedTitle || 'Untitled assessment'}
              </div>
              <div className="text-[12px] text-fg3 mt-2 line-clamp-3">
                {watch('description') || 'Your description will appear here.'}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                <div className="rounded-lg bg-bg border border-line p-2.5">
                  <div className="text-fg3">Duration</div>
                  <div className="text-fg1 font-semibold mt-0.5">{watch('duration')} min</div>
                </div>
                <div className="rounded-lg bg-bg border border-line p-2.5">
                  <div className="text-fg3">Passing marks</div>
                  <div className="text-fg1 font-semibold mt-0.5">{watch('passingMarks') || '—'}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 text-fg1 font-semibold">
              <Wand2 size={16} className="text-brand" />Quick tips
            </div>
            <ul className="space-y-2 text-[12.5px] text-fg2 leading-relaxed">
              <li className="flex gap-2"><FilePlus2 size={13} className="text-brand mt-0.5 shrink-0" />Pick a name students will recognise on their dashboards.</li>
              <li className="flex gap-2"><FilePlus2 size={13} className="text-brand mt-0.5 shrink-0" />Choose a duration that matches the number of questions.</li>
              <li className="flex gap-2"><FilePlus2 size={13} className="text-brand mt-0.5 shrink-0" />Assessment stays as Draft until you publish it.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-fg2 block mb-1.5">
        {label}{required && <span className="text-brand ml-0.5">*</span>}
      </label>
      {children}
      {error && <div className="text-[11.5px] text-danger mt-1">{error}</div>}
    </div>
  );
}
