import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, CheckSquare, Square, BookOpen, CheckCircle2,
  Filter, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button, Badge, Skeleton } from '../../shared/ui';
import { useQuestions } from '../../../hooks/useQuestions';
import { useSubjects } from '../../../hooks/useSubjects';
import type { Question } from '../../../hooks/useQuestions';

interface Props {
  open: boolean;
  onClose: () => void;
  assessmentId: string;
  /** Called with the IDs of questions the teacher confirmed to add */
  onAdd: (questionIds: string[]) => Promise<void>;
}

const TYPE_LABEL: Record<string, string> = {
  MCQ_SINGLE:       'MCQ',
  MCQ_MULTIPLE:     'MCQ (Multi)',
  TRUE_FALSE:       'True / False',
  FILL_IN_BLANK:    'Fill in Blank',
  MATCH_THE_COLUMN: 'Match Column',
  DESCRIPTIVE:      'Descriptive',
};

function QuestionPreview({ q }: { q: Question }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand" dot={false}>{TYPE_LABEL[q.type] ?? q.type}</Badge>
        <Badge
          tone={q.difficulty === 'EASY' ? 'success' : q.difficulty === 'MEDIUM' ? 'warning' : 'danger'}
          dot={false}
        >
          {q.difficulty.toLowerCase()}
        </Badge>
        {q.subject && <Badge tone="neutral" dot={false}>{q.subject.name}</Badge>}
        <Badge tone="neutral" dot={false}>+{q.marks} marks</Badge>
      </div>
      <p className="text-[14px] text-fg1 leading-relaxed font-medium">{q.prompt}</p>

      {(q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && q.options && (
        <div className="space-y-1.5">
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
                <span className="ml-2 text-[10px] font-semibold text-brand uppercase">Correct</span>
              )}
            </div>
          ))}
        </div>
      )}

      {q.type === 'TRUE_FALSE' && (
        <div className="flex gap-2">
          {['True', 'False'].map((label, k) => {
            const isCorrect =
              (q.correctBoolean === true && label === 'True') ||
              (q.correctBoolean === false && label === 'False');
            return (
              <div
                key={k}
                className={`flex-1 px-3 py-2 rounded-lg text-[12.5px] text-center border ${
                  isCorrect ? 'bg-brand-soft border-brand/30 text-fg1' : 'bg-surface1 border-line text-fg2'
                }`}
              >
                {label}
                {isCorrect && <span className="ml-2 text-[10px] font-semibold text-brand uppercase">✓</span>}
              </div>
            );
          })}
        </div>
      )}

      {q.type === 'FILL_IN_BLANK' && (
        <div className="px-3 py-2 rounded-lg bg-brand-soft border border-brand/30 text-[12.5px] text-fg1">
          Answer: <span className="font-semibold">{q.correctAnswer}</span>
        </div>
      )}

      {q.type === 'DESCRIPTIVE' && q.modelAnswer && (
        <div className="px-3 py-2 rounded-lg bg-surface1 border border-line text-[12.5px] text-fg3 italic">
          {q.modelAnswer.slice(0, 160)}{q.modelAnswer.length > 160 ? '…' : ''}
        </div>
      )}

      {q.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {q.tags.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-surface1 border border-line text-[10px] text-fg3">
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuestionBankPickerModal({ open, onClose, assessmentId, onAdd }: Props) {
  const [search, setSearch]     = useState('');
  const [typeF, setTypeF]       = useState('all');
  const [diffF, setDiffF]       = useState('all');
  const [subjectF, setSubjectF] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage]         = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview]   = useState<Question | null>(null);
  const [adding, setAdding]     = useState(false);

  const { data: subjects } = useSubjects();

  const { data, loading } = useQuestions({
    page,
    limit: 12,
    search:   search  || undefined,
    type:     typeF   !== 'all' ? typeF   : undefined,
    difficulty: diffF !== 'all' ? diffF   : undefined,
    subjectExternalId: subjectF !== 'all' ? subjectF : undefined,
    mine:     mineOnly || undefined,
    excludeAssessmentId: assessmentId,
  });

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, typeF, diffF, subjectF, mineOnly]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setSelected(new Set()); setPreview(null); setPage(1); }
  }, [open]);

  const questions = data?.items ?? [];
  const meta      = data?.meta;

  function toggle(q: Question) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(q.id)) { next.delete(q.id); if (preview?.id === q.id) setPreview(null); }
      else { next.add(q.id); setPreview(q); }
      return next;
    });
  }

  function toggleAll() {
    if (questions.every(q => selected.has(q.id))) {
      setSelected(prev => { const n = new Set(prev); questions.forEach(q => n.delete(q.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); questions.forEach(q => n.add(q.id)); return n; });
    }
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      await onAdd([...selected]);
      onClose();
    } finally {
      setAdding(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — rendered in document.body, always above sidebar/topbar */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9998,
                     background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'fixed', zIndex: 9999,
                     top: 32, right: 32, bottom: 32, left: 32 }}
            className="flex flex-col bg-bg border border-line2 rounded-2xl shadow-elev2 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <div>
                <h3 className="font-display font-semibold text-[16px] text-fg1">Browse Question Bank</h3>
                <p className="text-[12px] text-fg3">Select questions to add to this assessment.</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-fg3 hover:text-fg1 hover:bg-surface1">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0">
              {/* Filters sidebar */}
              <div className="w-52 shrink-0 border-r border-line p-4 space-y-4 overflow-y-auto hidden md:block">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fg3 mb-2 flex items-center gap-1.5">
                    <Filter size={10} />Filters
                  </div>
                  <div className="space-y-2">
                    <select
                      value={typeF} onChange={e => setTypeF(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg bg-surface1 border border-line text-[12px] text-fg1 focus:outline-none focus:border-brand/40"
                    >
                      <option value="all">All types</option>
                      <option value="MCQ_SINGLE">MCQ</option>
                      <option value="MCQ_MULTIPLE">MCQ (Multi)</option>
                      <option value="TRUE_FALSE">True / False</option>
                      <option value="FILL_IN_BLANK">Fill in Blank</option>
                      <option value="MATCH_THE_COLUMN">Match Column</option>
                      <option value="DESCRIPTIVE">Descriptive</option>
                    </select>

                    <select
                      value={diffF} onChange={e => setDiffF(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg bg-surface1 border border-line text-[12px] text-fg1 focus:outline-none focus:border-brand/40"
                    >
                      <option value="all">All difficulty</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>

                    <select
                      value={subjectF} onChange={e => setSubjectF(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg bg-surface1 border border-line text-[12px] text-fg1 focus:outline-none focus:border-brand/40"
                    >
                      <option value="all">All subjects</option>
                      {(subjects ?? []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mineOnly}
                      onChange={e => setMineOnly(e.target.checked)}
                      className="accent-brand"
                    />
                    <span className="text-[12px] text-fg2">My questions only</span>
                  </label>
                </div>

                {selected.size > 0 && (
                  <div className="pt-3 border-t border-line">
                    <div className="text-[11px] text-fg3 mb-2">Selected questions</div>
                    <div className="text-[22px] font-mono font-bold text-brand">{selected.size}</div>
                  </div>
                )}
              </div>

              {/* Question list */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Search bar */}
                <div className="px-4 py-3 border-b border-line shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg3" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search questions…"
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface1 border border-line text-[13px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40"
                    />
                  </div>
                </div>

                {/* Select all row */}
                {questions.length > 0 && (
                  <div className="px-4 py-2 border-b border-line shrink-0 flex items-center justify-between">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-[12px] text-fg2 hover:text-fg1">
                      {questions.every(q => selected.has(q.id))
                        ? <CheckSquare size={14} className="text-brand" />
                        : <Square size={14} />
                      }
                      Select all on page
                    </button>
                    <span className="text-[11px] text-fg3">
                      {loading ? '…' : `${meta?.total ?? 0} questions`}
                    </span>
                  </div>
                )}

                {/* Question rows */}
                <div className="flex-1 overflow-y-auto divide-y divide-line">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="p-4"><Skeleton className="h-16" /></div>
                    ))
                  ) : questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-fg3">
                      <BookOpen size={32} className="mb-3 opacity-40" />
                      <p className="text-[13px]">No questions match your filters.</p>
                    </div>
                  ) : (
                    questions.map(q => {
                      const isSelected = selected.has(q.id);
                      const isPreviewing = preview?.id === q.id;
                      return (
                        <div
                          key={q.id}
                          onClick={() => toggle(q)}
                          className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition select-none ${
                            isSelected ? 'bg-brand-soft/40' : isPreviewing ? 'bg-surface1/50' : 'hover:bg-surface1/30'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isSelected
                              ? <CheckSquare size={16} className="text-brand" />
                              : <Square size={16} className="text-fg3" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <Badge tone="brand" dot={false} className="text-[10px]">
                                {TYPE_LABEL[q.type] ?? q.type}
                              </Badge>
                              <Badge
                                tone={q.difficulty === 'EASY' ? 'success' : q.difficulty === 'MEDIUM' ? 'warning' : 'danger'}
                                dot={false}
                                className="text-[10px]"
                              >
                                {q.difficulty.toLowerCase()}
                              </Badge>
                              {q.subject && (
                                <Badge tone="neutral" dot={false} className="text-[10px]">{q.subject.name}</Badge>
                              )}
                              <span className="text-[10px] text-fg3">+{q.marks}m</span>
                            </div>
                            <p className="text-[13px] text-fg1 leading-snug line-clamp-2">{q.prompt}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                {meta && meta.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-line shrink-0">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center gap-1 text-[12px] text-fg2 hover:text-fg1 disabled:opacity-40"
                    >
                      <ChevronLeft size={13} />Prev
                    </button>
                    <span className="text-[12px] text-fg3">Page {page} of {meta.totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                      disabled={page === meta.totalPages}
                      className="flex items-center gap-1 text-[12px] text-fg2 hover:text-fg1 disabled:opacity-40"
                    >
                      Next<ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Preview panel */}
              {preview && (
                <div className="w-72 shrink-0 border-l border-line p-4 overflow-y-auto hidden lg:block">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-fg3 mb-3">Preview</div>
                  <QuestionPreview q={preview} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-line bg-surface1/50 shrink-0">
              <span className="text-[13px] text-fg2">
                {selected.size > 0
                  ? <><span className="font-semibold text-fg1">{selected.size}</span> question{selected.size !== 1 ? 's' : ''} selected</>
                  : 'Select questions to add'
                }
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button
                  size="sm"
                  icon={CheckCircle2}
                  disabled={selected.size === 0 || adding}
                  onClick={handleAdd}
                >
                  {adding ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} question${selected.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
