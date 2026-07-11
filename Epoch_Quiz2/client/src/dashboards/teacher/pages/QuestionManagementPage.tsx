import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Plus, CheckCircle2, GripVertical, Trash2, Library, ArrowUp, ArrowDown, Eye, Pencil,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton } from '../../shared/ui';
import { useToasts } from '../../shared/ui';
import { CreateQuestionModal } from '../../shared/CreateQuestionModal';
import { useAssessmentQuestions, questionApi } from '../../../hooks/useQuestions';
import { useAssessment, assessmentApi } from '../../../hooks/useAssessments';
import type { Question } from '../../../hooks/useQuestions';
import { QuestionBankPickerModal } from './QuestionBankPickerModal';

export function QuestionManagementPage() {
  const navigate = useNavigate();
  const { id: assessmentId } = useParams<{ id: string }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const { push, node } = useToasts();

  const { data: assessment, refetch: refetchAssessment } = useAssessment(assessmentId!);
  const { data: questions, loading, refetch } = useAssessmentQuestions(assessmentId!);

  const [previewQ, setPreviewQ] = useState<Question | null>(null);

  const handleQuestionCreated = async (created: Question) => {
    if (!assessmentId) return;
    try {
      await questionApi.attachToAssessment(assessmentId, created.id);
      push({ kind: 'success', title: 'Question saved to bank and added' });
      setCreateOpen(false);
      refetch();
      refetchAssessment();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed to attach question', sub: e.message });
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

          {/* Add question buttons */}
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
              onClick={() => setCreateOpen(true)}
              className="rounded-2xl border-2 border-dashed border-line2 hover:border-brand text-fg2 hover:text-fg1 py-6 transition group"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus size={20} className="group-hover:rotate-90 transition" />
                <div className="text-[13.5px] font-semibold">Create New Question</div>
                <div className="text-[11.5px] text-fg3">Auto-saved to Question Bank</div>
              </div>
            </button>
          </div>
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

      {/* Create question — type picker + draft editor, saves to bank then attaches */}
      <CreateQuestionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleQuestionCreated}
        defaultSubjectId={assessment?.subject?.id}
      />

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
