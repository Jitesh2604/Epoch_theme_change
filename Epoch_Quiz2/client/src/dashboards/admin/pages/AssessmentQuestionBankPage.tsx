import { useState } from 'react';
import { Plus, FileQuestion, Trash2, Pencil } from 'lucide-react';
import { PageHeader, Card, Button, SearchInput, Select, Badge, Skeleton } from '../../shared/ui';
import { useAssessmentBankQuestions, assessmentQuestionApi } from '../../../hooks/useAssessmentQuestionBank';
import type { AssessmentBankQuestion } from '../../../hooks/useAssessmentQuestionBank';
import { CreateQuestionModal } from '../../shared/CreateQuestionModal';
import { useToasts } from '../../shared/ui';

const TYPE_LABEL: Record<string, string> = {
  MCQ_SINGLE:     'MCQ',
  MCQ_MULTIPLE:   'MCQ (Multi)',
  TRUE_FALSE:     'True / False',
  FILL_IN_BLANK:  'Fill in Blank',
  MATCH_THE_COLUMN: 'Match Column',
  DESCRIPTIVE:    'Descriptive',
};

// The modal's draft editor only supports these three types (mirrors the
// create flow's own scope) — other types can be deleted here but not
// edited inline.
const EDITABLE_TYPES = new Set(['MCQ_SINGLE', 'TRUE_FALSE', 'DESCRIPTIVE']);

/**
 * The dedicated Assessment Question Bank — physically separate from
 * Practice/Olympiad's Question Bank (/admin/question-bank). Questions
 * created or edited here are only ever usable inside Assessments.
 */
export function AssessmentQuestionBankPage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [diff, setDiff] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssessmentBankQuestion | null>(null);

  const { data, loading, error, refetch } = useAssessmentBankQuestions({
    search:     q     || undefined,
    type:       type  !== 'all' ? type  : undefined,
    difficulty: diff  !== 'all' ? diff  : undefined,
  });

  const { push, node } = useToasts();
  const rows = data?.items ?? [];

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question permanently?')) return;
    try {
      await assessmentQuestionApi.remove(id);
      push({ kind: 'success', title: 'Question deleted' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot delete', sub: e.message });
    }
  };

  const handleSaved = (_saved: AssessmentBankQuestion) => {
    setCreateOpen(false);
    setEditing(null);
    push({ kind: 'success', title: editing ? 'Question updated' : 'Question added to bank' });
    refetch();
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Content"
        title="Assessment Question Bank"
        subtitle="Dedicated question bank for Assessments — completely separate from the Practice Olympiad question bank."
        actions={<Button icon={Plus} onClick={() => setCreateOpen(true)}>New question</Button>}
      />

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search question text…" />
          <Select value={type} onChange={setType} options={[
            { value: 'all',              label: 'All types'       },
            { value: 'MCQ_SINGLE',       label: 'MCQ'             },
            { value: 'MCQ_MULTIPLE',     label: 'MCQ (Multi)'     },
            { value: 'TRUE_FALSE',       label: 'True / False'    },
            { value: 'FILL_IN_BLANK',    label: 'Fill in Blank'   },
            { value: 'DESCRIPTIVE',      label: 'Descriptive'     },
          ]} />
          <Select value={diff} onChange={setDiff} options={[
            { value: 'all',    label: 'All difficulty' },
            { value: 'EASY',   label: 'Easy'           },
            { value: 'MEDIUM', label: 'Medium'         },
            { value: 'HARD',   label: 'Hard'           },
          ]} />
          <div className="ml-auto text-[12px] text-fg3">{loading ? '…' : `${data?.meta?.total ?? 0} questions`}</div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 mb-4">
          <p className="text-danger text-[13px]">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch} className="mt-2">Retry</Button>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-5"><Skeleton className="h-20" /></Card>)}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((it, i) => (
            <Card key={it.id} className="p-5 hover:border-line2 transition">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-surface1 border border-line grid place-items-center text-[11px] font-mono text-fg3 shrink-0">
                  Q{String(i + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge tone="brand" dot={false}><FileQuestion size={10} className="mr-1" />{TYPE_LABEL[it.type] ?? it.type}</Badge>
                    <Badge tone={it.difficulty === 'EASY' ? 'success' : it.difficulty === 'MEDIUM' ? 'warning' : 'danger'}>
                      {it.difficulty.toLowerCase()}
                    </Badge>
                    {it.subject && <Badge tone="neutral" dot={false}>{it.subject.name}</Badge>}
                    <span className="text-[11px] text-fg3">+{it.marks} marks · by {it.createdBy.name}</span>
                  </div>
                  <div className="text-[14px] text-fg1 leading-relaxed font-medium mb-2.5">{it.prompt}</div>
                  {(it.type === 'MCQ_SINGLE' || it.type === 'MCQ_MULTIPLE') && it.options && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      {it.options.map((o, k) => (
                        <div key={k} className={`px-3 py-2 rounded-lg text-[12.5px] border ${k === it.correctOption ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'}`}>
                          <span className="font-mono text-fg3 mr-2">{String.fromCharCode(65 + k)}.</span>{o}
                          {k === it.correctOption && <span className="ml-2 text-[10px] font-semibold text-brand uppercase tracking-wider">Correct</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {it.type === 'TRUE_FALSE' && (
                    <div className="flex gap-2 mt-2">
                      {['True', 'False'].map((label, k) => (
                        <div key={k} className={`px-4 py-2 rounded-lg text-[12.5px] border ${(it.correctBoolean === true && label === 'True') || (it.correctBoolean === false && label === 'False') ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'}`}>
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                  {it.type === 'DESCRIPTIVE' && (
                    <div className="px-3 py-2 rounded-lg bg-surface1 border border-line text-[12.5px] text-fg3 italic">
                      Manual grading{it.modelAnswer ? ` · ${it.modelAnswer.slice(0, 80)}…` : ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {EDITABLE_TYPES.has(it.type) && (
                    <button onClick={() => setEditing(it)} className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-brand hover:bg-surface1" title="Edit">
                      <Pencil size={15} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(it.id)} className="w-8 h-8 rounded-lg grid place-items-center text-fg3 hover:text-danger hover:bg-surface1" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && <Card><div className="text-center py-12 text-fg3 text-[13px]">No assessment questions found</div></Card>}
        </div>
      )}

      <CreateQuestionModal<AssessmentBankQuestion>
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleSaved}
        createFn={assessmentQuestionApi.create}
      />

      <CreateQuestionModal<AssessmentBankQuestion>
        open={!!editing}
        onClose={() => setEditing(null)}
        onCreated={handleSaved}
        editing={editing}
        updateFn={assessmentQuestionApi.update}
      />
    </>
  );
}
