import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Clock, Target, ClipboardList } from 'lucide-react';
import { Modal, Button, Skeleton, Badge } from './ui';
import { assessmentApi, useAssessmentGenerationConfig } from '../../hooks/useAssessments';
import { useRealSubjects } from '../../hooks/useSubjects';
import { useClasses } from '../../hooks/useCatalog';

interface Props {
  open: boolean;
  onClose: () => void;
  push: (t: { kind: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void;
}

const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

/**
 * Auto-generate an Assessment from the backend's ASSESSMENT_CONFIG: picks
 * the configured number of Easy/Medium/Hard questions from the chosen
 * subject's (and optional class's) Question Bank, assigns marks so the
 * total matches the config exactly, and sets duration from the config.
 * The preview panel reads the live config from the backend rather than
 * hardcoding the numbers, so it always reflects whatever an admin has set
 * in server/src/config/assessmentConfig.ts.
 */
export function GenerateAssessmentModal({ open, onClose, push }: Props) {
  const navigate = useNavigate();
  const { data: config, loading: configLoading } = useAssessmentGenerationConfig();
  const { data: subjects } = useRealSubjects();
  const { data: classes } = useClasses();

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setTitle(''); setSubjectId(''); setClassId(''); };

  const handleClose = () => { if (!submitting) { reset(); onClose(); } };

  const handleGenerate = async () => {
    if (!title.trim() || !subjectId) return;
    setSubmitting(true);
    try {
      const assessment = await assessmentApi.generate({
        title: title.trim(),
        subjectExternalId: subjectId,
        classExternalId: classId || undefined,
      });
      push({ kind: 'success', title: 'Assessment generated', sub: `"${title.trim()}" is ready with ${config?.totalQuestions ?? ''} questions.` });
      reset();
      onClose();
      navigate(`/admin/assessments/${assessment.id}/questions`);
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not generate assessment', sub: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const difficultyRows = config ? Object.entries(config.difficultyDistribution) : [];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Auto-Generate Assessment"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button icon={Wand2} onClick={handleGenerate} disabled={submitting || !title.trim() || !subjectId}>
            {submitting ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-[12px] font-semibold text-fg2 block mb-1.5">
            Assessment title<span className="text-brand ml-0.5">*</span>
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Algebra Foundations Mid-Term"
            className="w-full h-11 px-3.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-semibold text-fg2 block mb-1.5">
              Subject<span className="text-brand ml-0.5">*</span>
            </label>
            <select
              value={subjectId}
              onChange={e => setSubjectId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1"
            >
              <option value="">Select a subject…</option>
              {(subjects ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-[11px] text-fg3 mt-1">Questions are drawn from this subject's Question Bank.</p>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-fg2 block mb-1.5">Class (optional)</label>
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1"
            >
              <option value="">Any class</option>
              {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-line p-4 bg-surface1/50">
          <div className="text-[10px] uppercase tracking-wider text-fg3 mb-2.5">Will generate</div>
          {configLoading ? (
            <Skeleton className="h-16" />
          ) : !config ? (
            <p className="text-[12px] text-fg3">Couldn't load the generation config.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-bg border border-line p-2.5 text-center">
                  <ClipboardList size={14} className="text-brand mx-auto mb-1" />
                  <div className="text-fg1 font-semibold text-[13px]">{config.totalQuestions}</div>
                  <div className="text-[10px] text-fg3">questions</div>
                </div>
                <div className="rounded-lg bg-bg border border-line p-2.5 text-center">
                  <Target size={14} className="text-brand mx-auto mb-1" />
                  <div className="text-fg1 font-semibold text-[13px]">{config.totalMarks}</div>
                  <div className="text-[10px] text-fg3">marks</div>
                </div>
                <div className="rounded-lg bg-bg border border-line p-2.5 text-center">
                  <Clock size={14} className="text-brand mx-auto mb-1" />
                  <div className="text-fg1 font-semibold text-[13px]">{config.durationMinutes}m</div>
                  <div className="text-[10px] text-fg3">duration</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {difficultyRows.map(([difficulty, count]) => (
                  <Badge key={difficulty} tone="brand">{count} {DIFFICULTY_LABEL[difficulty] ?? difficulty}</Badge>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="text-[11.5px] text-fg3">
          If the subject/class doesn't have enough questions of a required difficulty, generation fails with a clear
          error instead of creating an incomplete assessment.
        </p>
      </div>
    </Modal>
  );
}
