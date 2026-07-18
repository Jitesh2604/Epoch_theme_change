import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Users, BookOpen, CheckCircle2,
  HelpCircle, AlignLeft, ToggleLeft, FileText,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton } from '../../shared/ui';
import { useAssessment } from '../../../hooks/useAssessments';
import { useAssessmentQuestions } from '../../../hooks/useQuestions';
import { assessmentApi } from '../../../hooks/useAssessments';
import { useToasts } from '../../shared/ui';

const TYPE_ICON: Record<string, any> = {
  MCQ_SINGLE: HelpCircle, MCQ_MULTIPLE: HelpCircle,
  TRUE_FALSE: ToggleLeft, DESCRIPTIVE: AlignLeft,
  FILL_IN_BLANK: FileText, MATCH_THE_COLUMN: FileText,
};
const TYPE_LABEL: Record<string, string> = {
  MCQ_SINGLE: 'MCQ', MCQ_MULTIPLE: 'MCQ Multi', TRUE_FALSE: 'True / False',
  FILL_IN_BLANK: 'Fill in Blank', MATCH_THE_COLUMN: 'Match Column', DESCRIPTIVE: 'Descriptive',
};
const DIFF_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  EASY: 'success', MEDIUM: 'warning', HARD: 'danger',
};

export function AssessmentPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push, node } = useToasts();

  const { data: assessment, loading: aLoading, error: aError } = useAssessment(id!);
  const { data: questions, loading: qLoading } = useAssessmentQuestions(id!);

  const loading = aLoading || qLoading;

  const handlePublish = async () => {
    try {
      await assessmentApi.publish(id!);
      push({ kind: 'success', title: 'Published', sub: 'Assessment is now live.' });
    } catch (e: any) { push({ kind: 'danger', title: 'Error', sub: e.message }); }
  };

  const handleUnpublish = async () => {
    try {
      await assessmentApi.unpublish(id!);
      push({ kind: 'success', title: 'Unpublished', sub: 'Assessment moved back to draft.' });
    } catch (e: any) { push({ kind: 'danger', title: 'Error', sub: e.message }); }
  };

  if (aError) {
    return (
      <div className="text-center py-20">
        <p className="text-danger text-[13px] mb-4">{aError}</p>
        <Button variant="outline" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Admin · Assessment Preview"
        title={loading ? '…' : (assessment?.title ?? 'Assessment')}
        subtitle={assessment?.description ?? 'Preview all questions and settings before publishing.'}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
            {assessment?.status === 'DRAFT' && (
              <Button icon={CheckCircle2} onClick={handlePublish}>Publish</Button>
            )}
            {assessment?.status === 'PUBLISHED' && (
              <Button variant="soft" onClick={handleUnpublish}>Unpublish</Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-24" /></Card>)}
        </div>
      ) : (
        <>
          {/* ── Meta row ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            {[
              { icon: FileText,      label: 'Questions',   value: String(questions?.length ?? 0) },
              { icon: Clock,         label: 'Duration',    value: `${assessment?.duration ?? 0} min` },
              { icon: Users,         label: 'Attempts',    value: String(assessment?.attempts ?? 0) },
              { icon: BookOpen,      label: 'Subject',     value: assessment?.subject?.name ?? '—' },
            ].map(item => (
              <Card key={item.label} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                  <item.icon size={18} />
                </div>
                <div>
                  <div className="text-[10.5px] text-fg3 uppercase tracking-wider">{item.label}</div>
                  <div className="text-[16px] font-semibold font-mono text-fg1">{item.value}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* ── Status / info card ────────────────────────────────── */}
          <Card className="p-5 mb-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-fg3">Status:</span>
              <Badge tone={assessment?.status === 'PUBLISHED' ? 'success' : assessment?.status === 'DRAFT' ? 'warning' : 'neutral'}>
                {assessment?.status?.toLowerCase() ?? '—'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-fg3">Created by:</span>
              <span className="text-[13px] text-fg1 font-medium">{assessment?.createdBy?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-fg3">Total marks:</span>
              <span className="text-[13px] font-mono text-fg1">{assessment?.totalMarks ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-fg3">Passing marks:</span>
              <span className="text-[13px] font-mono text-fg1">{assessment?.passingMarks ?? 0}</span>
            </div>
          </Card>

          {/* ── Questions list ────────────────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="font-display font-semibold text-[15px] text-fg1">
                Questions ({questions?.length ?? 0})
              </h3>
            </div>
            {!questions?.length ? (
              <div className="text-center py-12 text-fg3 text-[13px]">
                No questions attached yet.
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {questions.map((aq, i) => {
                  const q = aq.question;
                  const Icon = TYPE_ICON[q.type] ?? HelpCircle;
                  return (
                    <div key={aq.assessmentQuestionId} className="p-5 flex items-start gap-4">
                      <div className="w-9 h-9 rounded-lg bg-surface1 border border-line grid place-items-center text-[11px] font-mono text-fg3 shrink-0">
                        Q{String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge tone="brand" dot={false}>
                            <Icon size={10} className="mr-1" />{TYPE_LABEL[q.type] ?? q.type}
                          </Badge>
                          <Badge tone={DIFF_TONE[q.difficulty] ?? 'neutral'}>
                            {q.difficulty.toLowerCase()}
                          </Badge>
                          {q.subject && <Badge tone="neutral" dot={false}>{q.subject.name}</Badge>}
                          <span className="text-[11px] text-fg3 ml-auto">
                            {aq.marksOverride ?? q.marks} marks
                            {assessment?.negativeMarking && (
                              <span className="text-rose-400">
                                {' '}· −{aq.negMarksOverride ?? assessment.negativeMarksValue}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-[14px] text-fg1 leading-relaxed font-medium">{q.prompt}</p>
                        {(q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                            {q.options.map((opt, k) => (
                              <div key={k} className={`px-3 py-2 rounded-lg text-[12.5px] border ${k === q.correctOption ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'}`}>
                                <span className="font-mono text-fg3 mr-2">{String.fromCharCode(65 + k)}.</span>
                                {opt}
                                {k === q.correctOption && <span className="ml-2 text-[10px] font-semibold text-brand uppercase tracking-wider">Correct</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.type === 'TRUE_FALSE' && (
                          <div className="flex gap-2 mt-2">
                            {['True', 'False'].map((label, k) => (
                              <div key={k} className={`px-4 py-2 rounded-lg text-[12.5px] border ${(q.correctBoolean === true && label === 'True') || (q.correctBoolean === false && label === 'False') ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'}`}>
                                {label}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.type === 'DESCRIPTIVE' && q.modelAnswer && (
                          <div className="px-3 py-2 rounded-lg bg-surface1 border border-line text-[12.5px] text-fg3 italic mt-2">
                            Sample: {q.modelAnswer.slice(0, 120)}{q.modelAnswer.length > 120 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
