import { useState } from 'react';
import { BookOpen, CheckCircle2, MessageSquareText } from 'lucide-react';
import { Card, Button, Badge, Modal, useToasts } from './ui';
import { questionApi } from '../../hooks/useQuestions';
import type { Question } from '../../hooks/useQuestions';
import { useClasses } from '../../hooks/useCatalog';
import { useRealSubjects } from '../../hooks/useSubjects';
import { EDUCATION_BOARD_OPTIONS } from '../../lib/educationBoards';

type QuestionType = 'MCQ_SINGLE' | 'TRUE_FALSE' | 'DESCRIPTIVE';

interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  correctBool?: boolean;
  answer?: string;
  marks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  subjectId: string;
  classId: string;
  educationBoard: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after the question is created in the bank (not yet attached to anything). */
  onCreated: (question: Question) => void;
  /** Pre-fill the subject (e.g. an assessment's own subject). */
  defaultSubjectId?: string;
}

/**
 * Two-step "create a new question" flow: pick a type, then fill in an inline
 * draft editor. Always creates directly in the Question Bank via
 * `questionApi.create` — callers decide what to do next (attach to an
 * assessment, or just refresh a bank listing).
 */
export function CreateQuestionModal({ open, onClose, onCreated, defaultSubjectId }: Props) {
  const [pickType, setPickType] = useState<QuestionType>('MCQ_SINGLE');
  const [draft, setDraft] = useState<DraftQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const { push, node } = useToasts();

  const { data: classes } = useClasses();
  const { data: subjects } = useRealSubjects();

  const startDraft = (type: QuestionType) => {
    const base: DraftQuestion = {
      type, marks: 1, prompt: '',
      difficulty: 'MEDIUM',
      subjectId: defaultSubjectId ?? '',
      classId: '',
      educationBoard: '',
    };
    if (type === 'MCQ_SINGLE') { base.options = ['', '', '', '']; base.correctIndex = 0; }
    if (type === 'TRUE_FALSE') base.correctBool = true;
    if (type === 'DESCRIPTIVE') base.answer = '';
    setDraft(base);
  };

  const discard = () => { setDraft(null); onClose(); };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.prompt.trim()) { push({ kind: 'danger', title: 'Prompt is required' }); return; }
    if (!draft.subjectId)      { push({ kind: 'danger', title: 'Subject is required' }); return; }
    if (!draft.classId)        { push({ kind: 'danger', title: 'Class is required' }); return; }
    if (!draft.educationBoard) { push({ kind: 'danger', title: 'Board is required' }); return; }

    setSaving(true);
    try {
      const payload: any = {
        type:              draft.type,
        prompt:            draft.prompt,
        marks:             draft.marks,
        difficulty:        draft.difficulty,
        subjectExternalId: draft.subjectId,
        classExternalId:   draft.classId,
        educationBoard:    draft.educationBoard,
      };

      if (draft.type === 'MCQ_SINGLE') {
        payload.options       = draft.options ?? [];
        payload.correctOption = draft.correctIndex ?? 0;
      } else if (draft.type === 'TRUE_FALSE') {
        payload.correctBoolean = draft.correctBool;
      } else if (draft.type === 'DESCRIPTIVE') {
        payload.modelAnswer = draft.answer || undefined;
      }

      const created = await questionApi.create(payload);
      setDraft(null);
      onCreated(created);
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {node}

      {/* Step 1 — type picker */}
      <Modal open={open && !draft} onClose={onClose} title="Create a new question" size="sm">
        <div className="space-y-2">
          {([
            { type: 'MCQ_SINGLE'  as QuestionType, icon: BookOpen,          label: 'Multiple choice', desc: '4 options, single correct answer.' },
            { type: 'TRUE_FALSE'  as QuestionType, icon: CheckCircle2,      label: 'True / False',    desc: 'Quick binary verification.'        },
            { type: 'DESCRIPTIVE' as QuestionType, icon: MessageSquareText, label: 'Descriptive',     desc: 'Free-form, manually graded.'        },
          ] as const).map(t => (
            <button
              key={t.type}
              onClick={() => startDraft(t.type)}
              onMouseEnter={() => setPickType(t.type)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition ${
                pickType === t.type ? 'border-brand bg-brand-soft' : 'border-line hover:border-line2'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-surface1 border border-line2 grid place-items-center text-brand">
                <t.icon size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-fg1">{t.label}</div>
                <div className="text-[12px] text-fg3">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-fg3 text-center">
          New questions are saved directly to the Question Bank.
        </p>
      </Modal>

      {/* Step 2 — inline draft editor */}
      <Modal open={open && !!draft} onClose={discard} title="New question" size="lg">
        {draft && (
          <Card className="p-0 border-none shadow-none">
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="brand" dot={false}>
                {draft.type === 'MCQ_SINGLE' ? 'MCQ' : draft.type === 'TRUE_FALSE' ? 'True / False' : 'Descriptive'}
              </Badge>
              <span className="text-[12px] text-fg3">Will be saved to Question Bank</span>
            </div>

            <textarea
              value={draft.prompt}
              onChange={e => setDraft(d => d ? { ...d, prompt: e.target.value } : d)}
              placeholder="Type your question here…"
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-surface1 border border-line text-[14px] text-fg1 focus:outline-none focus:border-brand/40 mb-3"
            />

            {draft.type === 'MCQ_SINGLE' && draft.options && (
              <div className="space-y-2 mb-3">
                {draft.options.map((opt, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <button
                      onClick={() => setDraft(d => d ? { ...d, correctIndex: k } : d)}
                      className={`w-7 h-7 rounded-md border ${
                        draft.correctIndex === k
                          ? 'bg-brand text-brand-ink border-brand'
                          : 'bg-surface1 border-line text-fg3'
                      } grid place-items-center font-mono text-[11px]`}
                    >
                      {String.fromCharCode(65 + k)}
                    </button>
                    <input
                      value={opt}
                      onChange={e => {
                        const next = [...(draft.options ?? [])];
                        next[k] = e.target.value;
                        setDraft(d => d ? { ...d, options: next } : d);
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + k)}`}
                      className="flex-1 h-9 px-3 rounded-md bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                    />
                  </div>
                ))}
              </div>
            )}

            {draft.type === 'TRUE_FALSE' && (
              <div className="flex gap-2 mb-3">
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setDraft(d => d ? { ...d, correctBool: v } : d)}
                    className={`flex-1 h-10 rounded-lg border text-[13px] font-semibold transition ${
                      draft.correctBool === v ? 'bg-brand-soft border-brand text-fg1' : 'bg-surface1 border-line text-fg2'
                    }`}
                  >
                    {v ? 'True' : 'False'}
                  </button>
                ))}
              </div>
            )}

            {draft.type === 'DESCRIPTIVE' && (
              <textarea
                rows={3}
                value={draft.answer ?? ''}
                onChange={e => setDraft(d => d ? { ...d, answer: e.target.value } : d)}
                placeholder="Reference answer (optional)…"
                className="w-full px-3 py-2.5 rounded-lg bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 mb-3"
              />
            )}

            {/* Academic tagging — Subject, Class and Board are required so the
                question is scoped correctly for practice & olympiad. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
              <DraftSelect
                label="Subject *" value={draft.subjectId}
                onChange={v => setDraft(d => d ? { ...d, subjectId: v } : d)}
                placeholder="Select subject"
                options={(subjects ?? []).map(s => ({ value: s.id, label: s.name }))}
              />
              <DraftSelect
                label="Class *" value={draft.classId}
                onChange={v => setDraft(d => d ? { ...d, classId: v } : d)}
                placeholder="Select class"
                options={(classes ?? []).map(c => ({ value: c.id, label: c.name }))}
              />
              <DraftSelect
                label="Board *" value={draft.educationBoard}
                onChange={v => setDraft(d => d ? { ...d, educationBoard: v } : d)}
                placeholder="Select board"
                options={EDUCATION_BOARD_OPTIONS.map(b => ({ value: b.value, label: b.label }))}
              />
              <DraftSelect
                label="Difficulty" value={draft.difficulty}
                onChange={v => setDraft(d => d ? { ...d, difficulty: v as DraftQuestion['difficulty'] } : d)}
                options={[
                  { value: 'EASY', label: 'Easy' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HARD', label: 'Hard' },
                ]}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-fg3">Marks:</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.marks}
                  onChange={e => setDraft(d => d ? { ...d, marks: Number(e.target.value) } : d)}
                  className="w-16 h-8 px-2 rounded-md bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40"
                />
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={discard}>Discard</Button>
                <Button size="sm" icon={CheckCircle2} onClick={saveDraft} disabled={saving}>
                  {saving ? 'Saving…' : 'Save question'}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </Modal>
    </>
  );
}

function DraftSelect({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-fg3 block mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded-md bg-surface1 border border-line text-[12.5px] text-fg1 focus:outline-none focus:border-brand/40"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
