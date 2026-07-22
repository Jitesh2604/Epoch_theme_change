import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, MessageSquareText } from 'lucide-react';
import { Card, Button, Badge, Modal, useToasts } from './ui';
import { questionApi } from '../../hooks/useQuestions';
import type { Question } from '../../hooks/useQuestions';
import { useClasses } from '../../hooks/useCatalog';
import { useRealSubjects } from '../../hooks/useSubjects';
import { EDUCATION_BOARD_OPTIONS } from '../../lib/educationBoards';

/** Default create function — Practice/Olympiad's question bank. Pass
 *  `createFn={assessmentQuestionApi.create}` to save into the (physically
 *  separate) Assessment Question Bank instead — same form, different
 *  destination table, so the two banks stay independent while sharing UI. */
const defaultCreateFn = (payload: any) => questionApi.create(payload);

type QuestionType = 'MCQ_SINGLE' | 'TRUE_FALSE' | 'DESCRIPTIVE';

interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  promptImageUrl: string;
  options?: string[];
  optionImageUrls?: string[];
  correctIndex?: number;
  correctBool?: boolean;
  answer?: string;
  explanation: string;
  explanationImageUrl: string;
  marks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  subjectId: string;
  classId: string;
  educationBoard: string;
}

/** Minimal shape this modal needs to prefill an edit — satisfied by both
 *  Question (Practice) and AssessmentBankQuestion (Assessment), which are
 *  structurally identical. Only MCQ_SINGLE/TRUE_FALSE/DESCRIPTIVE are
 *  editable here, matching what the create flow itself supports. */
export interface EditableQuestion {
  id: string;
  type: string;
  prompt: string;
  promptImageUrl: string | null;
  options: string[] | null;
  optionImageUrls: { A: string | null; B: string | null; C: string | null; D: string | null };
  correctOption: number | null;
  correctBoolean: boolean | null;
  modelAnswer: string | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  marks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  subjectExternalId: string | null;
  classExternalId: string | null;
  educationBoard: string | null;
}

function draftFromExisting(q: EditableQuestion): DraftQuestion {
  const base: DraftQuestion = {
    type: q.type as QuestionType,
    marks: q.marks,
    prompt: q.prompt,
    promptImageUrl: q.promptImageUrl ?? '',
    explanation: q.explanation ?? '',
    explanationImageUrl: q.explanationImageUrl ?? '',
    difficulty: q.difficulty,
    subjectId: q.subjectExternalId ?? '',
    classId: q.classExternalId ?? '',
    educationBoard: q.educationBoard ?? '',
  };
  if (q.type === 'MCQ_SINGLE') {
    base.options = [0, 1, 2, 3].map(i => q.options?.[i] ?? '');
    base.optionImageUrls = [q.optionImageUrls.A, q.optionImageUrls.B, q.optionImageUrls.C, q.optionImageUrls.D].map(v => v ?? '');
    base.correctIndex = q.correctOption ?? 0;
  }
  if (q.type === 'TRUE_FALSE') base.correctBool = q.correctBoolean ?? true;
  if (q.type === 'DESCRIPTIVE') base.answer = q.modelAnswer ?? '';
  return base;
}

interface Props<Q> {
  open: boolean;
  onClose: () => void;
  /** Called after the question is created/updated in the bank. */
  onCreated: (question: Q) => void;
  /** Pre-fill the subject (e.g. an assessment's own subject). Ignored in edit mode. */
  defaultSubjectId?: string;
  /** Which bank to create into — defaults to the Practice/Olympiad bank
   *  (questionApi.create). Pass assessmentQuestionApi.create to create into
   *  the separate Assessment Question Bank instead. */
  createFn?: (payload: any) => Promise<Q>;
  /** When set, the modal opens directly into edit mode for this question
   *  (skips the type picker) and calls updateFn instead of createFn. */
  editing?: EditableQuestion | null;
  updateFn?: (id: string, payload: any) => Promise<Q>;
}

/**
 * Two-step "create a new question" flow: pick a type, then fill in an inline
 * draft editor. Creates directly in a question bank via `createFn` (Practice
 * by default) — callers decide what to do next (attach to an assessment, or
 * just refresh a bank listing). Pass `editing` + `updateFn` to reuse the same
 * draft editor to edit an existing question instead.
 */
export function CreateQuestionModal<Q = Question>({
  open, onClose, onCreated, defaultSubjectId, editing, updateFn,
  createFn = defaultCreateFn as unknown as (payload: any) => Promise<Q>,
}: Props<Q>) {
  const [pickType, setPickType] = useState<QuestionType>('MCQ_SINGLE');
  const [draft, setDraft] = useState<DraftQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const { push, node } = useToasts();

  const { data: classes } = useClasses();
  const { data: subjects } = useRealSubjects();

  // Edit mode seeds the draft immediately (no type-picker step); create mode
  // waits for startDraft() to be called from the picker.
  useEffect(() => {
    if (open && editing) setDraft(draftFromExisting(editing));
    if (!open) setDraft(null);
  }, [open, editing]);

  const startDraft = (type: QuestionType) => {
    const base: DraftQuestion = {
      type, marks: 1, prompt: '', promptImageUrl: '',
      explanation: '', explanationImageUrl: '',
      difficulty: 'MEDIUM',
      subjectId: defaultSubjectId ?? '',
      classId: '',
      educationBoard: '',
    };
    if (type === 'MCQ_SINGLE') { base.options = ['', '', '', '']; base.optionImageUrls = ['', '', '', '']; base.correctIndex = 0; }
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
        promptImageUrl:    draft.promptImageUrl.trim() || undefined,
        explanation:          draft.explanation.trim() || undefined,
        explanationImageUrl:  draft.explanationImageUrl.trim() || undefined,
        marks:             draft.marks,
        difficulty:        draft.difficulty,
        subjectExternalId: draft.subjectId,
        classExternalId:   draft.classId,
        educationBoard:    draft.educationBoard,
      };

      if (draft.type === 'MCQ_SINGLE') {
        payload.options       = draft.options ?? [];
        payload.correctOption = draft.correctIndex ?? 0;
        const imgs = draft.optionImageUrls ?? [];
        payload.optionAImageUrl = imgs[0]?.trim() || undefined;
        payload.optionBImageUrl = imgs[1]?.trim() || undefined;
        payload.optionCImageUrl = imgs[2]?.trim() || undefined;
        payload.optionDImageUrl = imgs[3]?.trim() || undefined;
      } else if (draft.type === 'TRUE_FALSE') {
        payload.correctBoolean = draft.correctBool;
      } else if (draft.type === 'DESCRIPTIVE') {
        payload.modelAnswer = draft.answer || undefined;
      }

      const saved = editing
        ? await updateFn!(editing.id, payload)
        : await createFn(payload);
      setDraft(null);
      onCreated(saved);
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {node}

      {/* Step 1 — type picker (skipped entirely in edit mode) */}
      <Modal open={open && !draft && !editing} onClose={onClose} title="Create a new question" size="sm">
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
      <Modal open={open && !!draft} onClose={discard} title={editing ? 'Edit question' : 'New question'} size="lg">
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
              className="w-full px-3 py-2.5 rounded-lg bg-surface1 border border-line text-[14px] text-fg1 focus:outline-none focus:border-brand/40 mb-2"
            />
            <input
              value={draft.promptImageUrl}
              onChange={e => setDraft(d => d ? { ...d, promptImageUrl: e.target.value } : d)}
              placeholder="Question image URL (optional)"
              className="w-full h-8 px-3 rounded-md bg-surface1 border border-line text-[12px] text-fg2 focus:outline-none focus:border-brand/40 mb-3"
            />

            {draft.type === 'MCQ_SINGLE' && draft.options && (
              <div className="space-y-2 mb-3">
                {draft.options.map((opt, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <button
                      onClick={() => setDraft(d => d ? { ...d, correctIndex: k } : d)}
                      className={`w-7 h-7 rounded-md border shrink-0 ${
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
                    <input
                      value={draft.optionImageUrls?.[k] ?? ''}
                      onChange={e => {
                        const next = [...(draft.optionImageUrls ?? ['', '', '', ''])];
                        next[k] = e.target.value;
                        setDraft(d => d ? { ...d, optionImageUrls: next } : d);
                      }}
                      placeholder="Image URL (optional)"
                      className="w-40 h-9 px-2.5 rounded-md bg-surface1 border border-line text-[11.5px] text-fg3 focus:outline-none focus:border-brand/40 shrink-0"
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

            {/* Explanation shown to the student after grading — optional, any type. */}
            <div className="mb-3">
              <textarea
                value={draft.explanation}
                onChange={e => setDraft(d => d ? { ...d, explanation: e.target.value } : d)}
                placeholder="Explanation shown after grading (optional)…"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 mb-2"
              />
              <input
                value={draft.explanationImageUrl}
                onChange={e => setDraft(d => d ? { ...d, explanationImageUrl: e.target.value } : d)}
                placeholder="Explanation image URL (optional)"
                className="w-full h-8 px-3 rounded-md bg-surface1 border border-line text-[12px] text-fg2 focus:outline-none focus:border-brand/40"
              />
            </div>

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
                <Button variant="ghost" size="sm" onClick={discard}>{editing ? 'Cancel' : 'Discard'}</Button>
                <Button size="sm" icon={CheckCircle2} onClick={saveDraft} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Save question'}
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
