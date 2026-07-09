import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Plus, CheckCircle2, BookOpen, MessageSquareText,
  GripVertical, Trash2, Library, ArrowUp, ArrowDown, Eye, Pencil,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Modal, Skeleton } from '../../shared/ui';
import { useToasts } from '../../shared/ui';
import { useAssessmentQuestions, questionApi } from '../../../hooks/useQuestions';
import { useAssessment, assessmentApi } from '../../../hooks/useAssessments';
import type { Question } from '../../../hooks/useQuestions';
import { QuestionBankPickerModal } from './QuestionBankPickerModal';
import { useClasses } from '../../../hooks/useCatalog';
import { useRealSubjects } from '../../../hooks/useSubjects';
import { EDUCATION_BOARD_OPTIONS } from '../../../lib/educationBoards';

type QuestionType = 'MCQ_SINGLE' | 'TRUE_FALSE' | 'DESCRIPTIVE';
type AddMode = 'pick' | 'create' | null;

interface DraftQuestion {
  id: string;
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

export function QuestionManagementPage() {
  const navigate = useNavigate();
  const { id: assessmentId } = useParams<{ id: string }>();
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [pickType, setPickType] = useState<QuestionType>('MCQ_SINGLE');
  const [saving, setSaving] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const { push, node } = useToasts();

  const { data: assessment, refetch: refetchAssessment } = useAssessment(assessmentId!);
  const { data: questions, loading, refetch } = useAssessmentQuestions(assessmentId!);
  const { data: classes } = useClasses();
  const { data: subjects } = useRealSubjects();

  const [draft, setDraft] = useState<DraftQuestion | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [previewQ, setPreviewQ] = useState<Question | null>(null);

  const startDraft = (type: QuestionType) => {
    const base: DraftQuestion = {
      id: 'new', type, marks: 1, prompt: '',
      difficulty: 'MEDIUM',
      // Inherit the assessment's subject by default; teacher can still change it.
      subjectId: assessment?.subject?.id ?? '',
      classId: '',
      educationBoard: '',
    };
    if (type === 'MCQ_SINGLE') { base.options = ['', '', '', '']; base.correctIndex = 0; }
    if (type === 'TRUE_FALSE') base.correctBool = true;
    if (type === 'DESCRIPTIVE') base.answer = '';
    setDraft(base);
    setAddMode(null);
  };

  const saveDraft = async () => {
    if (!draft || !assessmentId) return;
    if (!draft.prompt.trim()) { push({ kind: 'danger', title: 'Prompt is required' }); return; }
    if (!draft.subjectId)      { push({ kind: 'danger', title: 'Subject is required' }); return; }
    if (!draft.classId)        { push({ kind: 'danger', title: 'Class is required' }); return; }
    if (!draft.educationBoard) { push({ kind: 'danger', title: 'Board is required' }); return; }

    setAddingQuestion(true);
    try {
      const payload: any = {
        type:           draft.type,
        prompt:         draft.prompt,
        marks:          draft.marks,
        difficulty:     draft.difficulty,
        subjectExternalId: draft.subjectId,
        classExternalId:   draft.classId,
        educationBoard: draft.educationBoard,
      };

      if (draft.type === 'MCQ_SINGLE') {
        payload.options       = draft.options ?? [];
        payload.correctOption = draft.correctIndex ?? 0;
      } else if (draft.type === 'TRUE_FALSE') {
        payload.correctBoolean = draft.correctBool;
      } else if (draft.type === 'DESCRIPTIVE') {
        payload.modelAnswer = draft.answer || undefined;
      }

      // Create in question bank, then attach to this assessment
      const created = await questionApi.create(payload) as Question;
      await questionApi.attachToAssessment(assessmentId, created.id);
      push({ kind: 'success', title: 'Question saved to bank and added' });
      setDraft(null);
      refetch();
      refetchAssessment();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setAddingQuestion(false);
    }
  };

  const handleBankAdd = async (questionIds: string[]) => {
    if (!assessmentId) return;
    try {
      await questionApi.bulkAttachToAssessment(assessmentId, questionIds);
      push({ kind: 'success', title: `${questionIds.length} question${questionIds.length !== 1 ? 's' : ''} added` });
      refetch();
      refetchAssessment();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to add questions', sub: e.message });
      throw e;
    }
  };

  const removeQuestion = async (questionId: string) => {
    if (!assessmentId) return;
    setSaving(questionId);
    try {
      await questionApi.detachFromAssessment(assessmentId, questionId);
      push({ kind: 'info', title: 'Question removed' });
      refetch();
      refetchAssessment();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSaving(null);
    }
  };

  const moveQuestion = async (questionId: string, direction: 'up' | 'down') => {
    const qList = questions ?? [];
    const idx = qList.findIndex(q => q.question.id === questionId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= qList.length) return;

    // Swap orders
    const newOrder = qList.map((q, i) => ({ questionId: q.question.id, order: q.order }));
    const tmp = newOrder[idx].order;
    newOrder[idx].order = newOrder[targetIdx].order;
    newOrder[targetIdx].order = tmp;

    try {
      await questionApi.reorder(assessmentId!, newOrder);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Reorder failed', sub: e.message });
    }
  };

  const handlePublish = async () => {
    if (!assessmentId) return;
    try {
      await assessmentApi.publish(assessmentId);
      push({ kind: 'success', title: 'Assessment published', sub: 'Students can now attempt it.' });
      navigate('/teacher/assessments');
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot publish', sub: e.message });
    }
  };

  const qList = questions ?? [];

  return (
    <>
      {node}

      <button
        onClick={() => navigate('/teacher/assessments')}
        className="inline-flex items-center gap-1 text-[12.5px] text-fg3 hover:text-fg1 mb-4"
      >
        <ChevronLeft size={14} />Back to my assessments
      </button>

      <PageHeader
        eyebrow={`Assessment · ${assessment?.status?.toLowerCase() ?? 'draft'}`}
        title={assessment?.title ?? 'Manage questions'}
        subtitle={assessment?.description ?? 'Add and arrange questions for this assessment.'}
        actions={<>
          {assessment?.status === 'DRAFT' && (
            <Button variant="outline" onClick={() => navigate('/teacher/assessments')}>Back</Button>
          )}
          {assessment?.status === 'DRAFT' && (
            <Button icon={CheckCircle2} onClick={handlePublish}>Publish</Button>
          )}
          {assessment?.status === 'PUBLISHED' && (
            <Button variant="soft" icon={Eye}>Published</Button>
          )}
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Left: question list */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5"><Skeleton className="h-24" /></Card>
            ))
          ) : (
            qList.map((aq, i) => {
              const q = aq.question;
              return (
                <Card key={q.id} className="p-5 group">
                  <div className="flex items-start gap-3">
                    {/* Drag handle / order */}
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <button
                        onClick={() => moveQuestion(q.id, 'up')}
                        disabled={i === 0}
                        className="text-fg3 hover:text-fg1 disabled:opacity-20"
                        title="Move up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <div className="w-7 h-7 rounded-md bg-surface1 border border-line grid place-items-center text-[10px] font-mono text-fg3">
                        {i + 1}
                      </div>
                      <button
                        onClick={() => moveQuestion(q.id, 'down')}
                        disabled={i === qList.length - 1}
                        className="text-fg3 hover:text-fg1 disabled:opacity-20"
                        title="Move down"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge tone="brand" dot={false}>
                          {q.type === 'MCQ_SINGLE' ? 'MCQ'
                            : q.type === 'MCQ_MULTIPLE' ? 'MCQ (Multi)'
                            : q.type === 'TRUE_FALSE' ? 'True / False'
                            : q.type === 'FILL_IN_BLANK' ? 'Fill in Blank'
                            : q.type === 'DESCRIPTIVE' ? 'Descriptive'
                            : q.type}
                        </Badge>
                        <Badge
                          tone={q.difficulty === 'EASY' ? 'success' : q.difficulty === 'MEDIUM' ? 'warning' : 'danger'}
                          dot={false}
                        >
                          {q.difficulty.toLowerCase()}
                        </Badge>
                        <Badge tone="neutral" dot={false}>+{aq.effectiveMarks} marks</Badge>
                        {q.subject && <Badge tone="neutral" dot={false}>{q.subject.name}</Badge>}
                      </div>
                      <div className="text-[14px] text-fg1 leading-relaxed font-medium mb-2">{q.prompt}</div>

                      {q.options && (q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {q.options.map((opt, k) => (
                            <div
                              key={k}
                              className={`px-3 py-1.5 rounded-lg text-[12.5px] border ${
                                k === q.correctOption
                                  ? 'bg-brand-soft border-brand/30 text-fg1'
                                  : 'bg-surface1 border-line text-fg2'
                              }`}
                            >
                              <span className="font-mono text-fg3 mr-2">{String.fromCharCode(65 + k)}.</span>
                              {opt}
                              {k === q.correctOption && (
                                <span className="ml-1.5 text-[10px] font-semibold text-brand uppercase">✓ Correct</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === 'TRUE_FALSE' && (
                        <div className="flex gap-2 mt-1">
                          {['True', 'False'].map((label, k) => {
                            const isCorrect = (q.correctBoolean === true && label === 'True') ||
                                              (q.correctBoolean === false && label === 'False');
                            return (
                              <div key={k} className={`px-4 py-1.5 rounded-lg text-[12.5px] border ${isCorrect ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'}`}>
                                {label}{isCorrect && <span className="ml-1.5 text-[10px] font-semibold text-brand">✓</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.type === 'FILL_IN_BLANK' && q.correctAnswer && (
                        <div className="mt-1 px-3 py-1.5 rounded-lg bg-brand-soft border border-brand/30 text-[12.5px] text-fg1">
                          Answer: <span className="font-semibold">{q.correctAnswer}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setPreviewQ(prev => prev?.id === q.id ? null : q)}
                        className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-brand hover:bg-surface1"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => removeQuestion(q.id)}
                        disabled={saving === q.id}
                        className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-danger hover:bg-surface1 disabled:opacity-50"
                        title="Remove from assessment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Inline preview expansion */}
                  {previewQ?.id === q.id && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <div className="text-[11px] text-fg3 uppercase tracking-wider mb-2">Full preview</div>
                      {q.explanation && (
                        <div className="text-[12.5px] text-fg2 italic">{q.explanation}</div>
                      )}
                      {q.tags && q.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {q.tags.map(t => (
                            <span key={t} className="px-2 py-0.5 rounded-full bg-surface1 border border-line text-[10px] text-fg3">#{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="text-[11px] text-fg3 mt-2">
                        Created by {q.createdBy.name}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* Inline draft editor for new question */}
          {draft && (
            <Card className="p-5 border-brand/40">
              <div className="flex items-center gap-2 mb-3">
                <Badge tone="brand" dot={false}>
                  {draft.type === 'MCQ_SINGLE' ? 'MCQ' : draft.type === 'TRUE_FALSE' ? 'True / False' : 'Descriptive'}
                </Badge>
                <span className="text-[12px] text-fg3">New question — will be saved to Question Bank</span>
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
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Discard</Button>
                  <Button size="sm" icon={CheckCircle2} onClick={saveDraft} disabled={addingQuestion}>
                    {addingQuestion ? 'Saving…' : 'Save & add'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Add question buttons */}
          {!draft && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setBankOpen(true)}
                className="rounded-2xl border-2 border-dashed border-line2 hover:border-brand text-fg2 hover:text-fg1 py-6 transition group"
              >
                <div className="flex flex-col items-center gap-2">
                  <Library size={20} className="group-hover:scale-110 transition" />
                  <div className="text-[13.5px] font-semibold">From Question Bank</div>
                  <div className="text-[11.5px] text-fg3">Browse and select existing questions</div>
                </div>
              </button>

              <button
                onClick={() => setAddMode('create')}
                className="rounded-2xl border-2 border-dashed border-line2 hover:border-brand text-fg2 hover:text-fg1 py-6 transition group"
              >
                <div className="flex flex-col items-center gap-2">
                  <Plus size={20} className="group-hover:rotate-90 transition" />
                  <div className="text-[13.5px] font-semibold">Create New Question</div>
                  <div className="text-[11.5px] text-fg3">Auto-saved to Question Bank</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Right: assessment summary */}
        <div className="space-y-4">
          <Card className="p-5 sticky top-24">
            <h4 className="font-display font-semibold text-[15px] text-fg1 mb-3">Assessment summary</h4>
            <div className="space-y-2.5">
              {[
                { label: 'Total questions', value: qList.length },
                { label: 'MCQ',             value: qList.filter(q => q.question.type === 'MCQ_SINGLE' || q.question.type === 'MCQ_MULTIPLE').length },
                { label: 'True / False',    value: qList.filter(q => q.question.type === 'TRUE_FALSE').length },
                { label: 'Descriptive',     value: qList.filter(q => q.question.type === 'DESCRIPTIVE').length },
                { label: 'Total marks',     value: qList.reduce((s, q) => s + q.effectiveMarks, 0) },
                { label: 'Duration',        value: assessment?.duration ? `${assessment.duration} min` : '—' },
                { label: 'Passing marks',   value: assessment?.passingMarks ?? '—' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-[13px]">
                  <span className="text-fg3">{r.label}</span>
                  <span className="font-mono font-semibold text-fg1">{r.value}</span>
                </div>
              ))}
            </div>

            {assessment?.subject && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-[11px] text-fg3 mb-1">Subject</div>
                <Badge tone="brand" dot={false}>{assessment.subject.name}</Badge>
              </div>
            )}

            {assessment?.status && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-[11px] text-fg3 mb-1">Status</div>
                <Badge
                  tone={
                    assessment.status === 'PUBLISHED' ? 'success'
                    : assessment.status === 'DRAFT' ? 'warning'
                    : 'neutral'
                  }
                >
                  {assessment.status.toLowerCase()}
                </Badge>
              </div>
            )}

            {assessment?.status === 'DRAFT' && qList.length > 0 && (
              <Button
                className="w-full mt-4"
                icon={CheckCircle2}
                onClick={handlePublish}
              >
                Publish assessment
              </Button>
            )}

            {qList.length === 0 && !loading && (
              <p className="text-[11.5px] text-fg3 mt-3 text-center">
                Add at least one question to publish.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Create new question type picker modal */}
      <Modal open={addMode === 'create'} onClose={() => setAddMode(null)} title="Create a new question" size="sm">
        <div className="space-y-2">
          {([
            { type: 'MCQ_SINGLE'  as QuestionType, icon: BookOpen,           label: 'Multiple choice', desc: '4 options, single correct answer.' },
            { type: 'TRUE_FALSE'  as QuestionType, icon: CheckCircle2,       label: 'True / False',    desc: 'Quick binary verification.'        },
            { type: 'DESCRIPTIVE' as QuestionType, icon: MessageSquareText,  label: 'Descriptive',     desc: 'Free-form, manually graded.'        },
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
          New questions are automatically saved to the Question Bank.
        </p>
      </Modal>

      {/* Question Bank picker modal */}
      <QuestionBankPickerModal
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        assessmentId={assessmentId!}
        onAdd={handleBankAdd}
      />
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
