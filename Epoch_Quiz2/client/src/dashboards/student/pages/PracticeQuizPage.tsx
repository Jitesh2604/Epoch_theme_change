import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Zap, ChevronRight, BarChart2, Target, Clock,
  Filter, Search, PlayCircle, AlertTriangle,
} from 'lucide-react';
import {
  PageHeader, Card, Button, Badge, Modal, Skeleton, EmptyState,
} from '../../shared/ui';
import { usePracticeSubjects, practiceApi, type PracticeSubject } from '../../../hooks/usePracticeQuiz';
import { useToasts } from '../../shared/ui';
import { useBasePath } from '../../shared/basePath';

const DIFFICULTY_OPTS = [
  { value: '',       label: 'All Difficulties' },
  { value: 'EASY',   label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD',   label: 'Hard' },
];

// Default number of questions when a student opens the start dialog.
const DEFAULT_COUNT = 20;
const COUNT_PRESETS = [10, 20, 30, 50];

const DIFF_COLORS: Record<string, string> = {
  EASY:   'success',
  MEDIUM: 'warning',
  HARD:   'danger',
};

// ── Subject card ──────────────────────────────────────────────────

function SubjectCard({
  subject,
  onPlay,
}: {
  subject: PracticeSubject;
  onPlay: (s: PracticeSubject) => void;
}) {
  const total = subject.questionCount;
  const easyPct   = total ? Math.round((subject.easyCount   / total) * 100) : 0;
  const mediumPct = total ? Math.round((subject.mediumCount / total) * 100) : 0;
  const hardPct   = total ? Math.round((subject.hardCount   / total) * 100) : 0;

  return (
    <Card className="p-5 flex flex-col gap-4 hover:border-brand/30 transition group cursor-pointer" onClick={() => onPlay(subject)}>
      <div className="flex items-start justify-between gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0 group-hover:scale-105 transition">
          <BookOpen size={20} />
        </div>
        <Badge tone="neutral" dot={false} className="text-[10px]">
          {total} Qs
        </Badge>
      </div>

      <div>
        <h3 className="font-display font-semibold text-[15px] text-fg1 group-hover:text-brand transition leading-tight">
          {subject.name}
        </h3>

        {/* Difficulty breakdown bar */}
        <div className="flex gap-1 mt-3 h-1.5 rounded-full overflow-hidden">
          {easyPct   > 0 && <div className="bg-emerald-400 rounded-full" style={{ width: `${easyPct}%` }} />}
          {mediumPct > 0 && <div className="bg-amber-400  rounded-full" style={{ width: `${mediumPct}%` }} />}
          {hardPct   > 0 && <div className="bg-rose-400   rounded-full" style={{ width: `${hardPct}%` }} />}
        </div>

        <div className="flex gap-3 mt-2 text-[11px] text-fg3">
          {subject.easyCount   > 0 && <span><span className="text-emerald-400 font-semibold">{subject.easyCount}</span> Easy</span>}
          {subject.mediumCount > 0 && <span><span className="text-amber-400  font-semibold">{subject.mediumCount}</span> Med</span>}
          {subject.hardCount   > 0 && <span><span className="text-rose-400   font-semibold">{subject.hardCount}</span> Hard</span>}
        </div>
      </div>

      <Button
        variant="soft"
        icon={PlayCircle}
        className="w-full mt-auto"
        onClick={e => { e.stopPropagation(); onPlay(subject); }}
      >
        Start Practice
      </Button>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export function PracticeQuizPage() {
  const navigate = useNavigate();
  const base = useBasePath();
  const [searchParams, setSearchParams] = useSearchParams();
  const { push, node: toastNode } = useToasts();

  const { data: subjects, loading, error: subjectsError, refetch: refetchSubjects } = usePracticeSubjects();

  const [search,     setSearch]     = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [selected,   setSelected]   = useState<PracticeSubject | null>(null);
  const [difficulty, setDifficulty] = useState('');
  const [count,      setCount]      = useState(String(DEFAULT_COUNT));
  const [starting,   setStarting]   = useState(false);
  const startingRef = useRef(false);

  const openModal = (s: PracticeSubject) => {
    setSelected(s);
    setDifficulty('');
    setCount(String(Math.min(DEFAULT_COUNT, Math.max(1, s.questionCount))));
  };

  // Deep link from the marketing Categories grid (?subject=<externalId>) —
  // preselect that subject's start-quiz modal instead of making the visitor
  // find it again in the grid below.
  useEffect(() => {
    const subjectId = searchParams.get('subject');
    if (!subjectId || !subjects) return;
    const match = subjects.find(s => s.id === subjectId);
    if (match) {
      openModal(match);
    } else {
      // The catalog (Content API) lists subjects that haven't had any
      // questions synced into the local question bank yet — nothing to do
      // but tell the student instead of silently landing on the grid.
      push({ kind: 'danger', title: 'No practice questions yet', sub: 'This subject doesn’t have practice questions available yet — check back soon.' });
    }
    setSearchParams(prev => { prev.delete('subject'); return prev; }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  // How many questions exist for the current subject + difficulty selection.
  const available = !selected
    ? 0
    : difficulty === 'EASY'   ? selected.easyCount
    : difficulty === 'MEDIUM' ? selected.mediumCount
    : difficulty === 'HARD'   ? selected.hardCount
    : selected.questionCount;

  // Requested count, clamped to what is actually available (min 1).
  const requestedCount = Math.min(Math.max(1, Number(count) || 1), Math.max(1, available));

  const filtered = (subjects ?? []).filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesDiff   =
      !filterDiff ||
      (filterDiff === 'EASY'   && s.easyCount   > 0) ||
      (filterDiff === 'MEDIUM' && s.mediumCount  > 0) ||
      (filterDiff === 'HARD'   && s.hardCount    > 0);
    return matchesSearch && matchesDiff;
  });

  const beginQuiz = async () => {
    if (!selected) return;
    // Hard guard: a fast double-click can fire twice before `starting` re-renders
    // the button as disabled, which would create two attempts.
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const attempt = await practiceApi.start({
        subjectExternalId: selected.id,
        difficulty:    difficulty || undefined,
        questionCount: requestedCount,
      });
      navigate(`${base}/practice/play/${attempt.attemptId}`, { state: { attempt } });
    } catch (err: any) {
      push({ kind: 'danger', title: 'Could not start quiz', sub: err?.message ?? 'Please try again' });
      setStarting(false);
      startingRef.current = false;
    }
  };

  return (
    <>
      {toastNode}

      <PageHeader
        eyebrow="Student · Practice"
        title="Practice Quizzes"
        subtitle="Sharpen your skills with questions from our question bank — no teacher required."
        actions={
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-amber-300" />
            <span className="text-[12px] text-fg3">Instant results &amp; explanations</span>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { icon: Target,   label: 'Practice makes perfect', sub: 'No pressure, just learning' },
          { icon: BarChart2, label: 'Track your progress',    sub: 'See correct / wrong per quiz' },
          { icon: Clock,    label: 'Play at your own pace',   sub: 'No time limit by default' },
        ].map(({ icon: Icon, label, sub }) => (
          <Card key={label} className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
              <Icon size={16} />
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-fg1">{label}</div>
              <div className="text-[11px] text-fg3 mt-0.5">{sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg3 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search subjects…"
            className="w-full h-10 pl-9 pr-3.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-fg3" />
          <div className="flex gap-1">
            {DIFFICULTY_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => setFilterDiff(o.value)}
                className={`px-3 h-9 rounded-xl text-[12px] font-semibold border transition ${
                  filterDiff === o.value
                    ? 'bg-brand text-brand-ink border-transparent'
                    : 'bg-surface1 text-fg2 border-line hover:border-brand/30 hover:text-fg1'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subject grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-11 w-11 rounded-xl mb-4" />
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-2 w-full mb-2" />
              <Skeleton className="h-9 w-full mt-4 rounded-xl" />
            </Card>
          ))}
        </div>
      ) : subjectsError ? (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load subjects"
            desc={subjectsError}
            action={<Button variant="outline" onClick={refetchSubjects}>Retry</Button>}
          />
        </Card>
      ) : filtered.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(s => (
            <SubjectCard key={s.id} subject={s} onPlay={openModal} />
          ))}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <EmptyState
            icon={BookOpen}
            title={search || filterDiff ? 'No subjects match your filters' : 'No subjects available'}
            desc={
              search || filterDiff
                ? 'Try clearing your search or filter to see all available subjects.'
                : 'The question bank is empty. Ask a teacher or admin to add questions.'
            }
            action={
              (search || filterDiff) ? (
                <Button variant="outline" onClick={() => { setSearch(''); setFilterDiff(''); }}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {/* Start quiz modal */}
      <Modal
        open={!!selected}
        onClose={() => !starting && setSelected(null)}
        title={`Practice · ${selected?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={starting}>Cancel</Button>
            <Button icon={PlayCircle} onClick={beginQuiz} disabled={starting}>
              {starting ? 'Starting…' : 'Begin Quiz'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-fg2 uppercase tracking-wider mb-2">Difficulty</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: '',       label: 'Mixed',  sub: 'All difficulties' },
                { val: 'EASY',   label: 'Easy',   sub: `${selected?.easyCount ?? 0} questions` },
                { val: 'MEDIUM', label: 'Medium', sub: `${selected?.mediumCount ?? 0} questions` },
                { val: 'HARD',   label: 'Hard',   sub: `${selected?.hardCount ?? 0} questions` },
              ].map(o => (
                <button
                  key={o.val}
                  onClick={() => {
                    setDifficulty(o.val);
                    // Clamp the requested count to the newly-selected pool.
                    const avail = !selected ? 0
                      : o.val === 'EASY'   ? selected.easyCount
                      : o.val === 'MEDIUM' ? selected.mediumCount
                      : o.val === 'HARD'   ? selected.hardCount
                      : selected.questionCount;
                    setCount(c => String(Math.min(Math.max(1, Number(c) || 1), Math.max(1, avail))));
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-left transition ${
                    difficulty === o.val
                      ? 'bg-brand-soft border-brand/40 text-brand'
                      : 'bg-surface1 border-line text-fg1 hover:border-brand/20'
                  }`}
                >
                  <div className="text-[13px] font-semibold">{o.label}</div>
                  <div className="text-[11px] text-fg3 mt-0.5">{o.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-fg2 uppercase tracking-wider">
                Number of questions
              </p>
              <span className="text-[11px] text-fg3">{available} available</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={available || 1}
                value={count}
                onChange={e => setCount(e.target.value)}
                onBlur={() => setCount(String(requestedCount))}
                className="w-20 h-10 px-3 rounded-xl bg-surface1 border border-line text-[14px] font-semibold text-fg1 text-center focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
              <div className="flex flex-wrap gap-1.5">
                {COUNT_PRESETS.filter(n => n <= available).map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(String(n))}
                    className={`px-3 h-10 rounded-xl text-[12px] font-semibold border transition ${
                      requestedCount === n
                        ? 'bg-brand text-brand-ink border-transparent'
                        : 'bg-surface1 text-fg2 border-line hover:border-brand/30 hover:text-fg1'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {available > 0 && !COUNT_PRESETS.includes(available) && (
                  <button
                    onClick={() => setCount(String(available))}
                    className={`px-3 h-10 rounded-xl text-[12px] font-semibold border transition ${
                      requestedCount === available
                        ? 'bg-brand text-brand-ink border-transparent'
                        : 'bg-surface1 text-fg2 border-line hover:border-brand/30 hover:text-fg1'
                    }`}
                  >
                    All ({available})
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-surface1 border border-line">
            <Clock size={14} className="text-fg3 shrink-0" />
            <p className="text-[12px] text-fg3">
              You'll get <strong className="text-fg1">{requestedCount} question{requestedCount !== 1 ? 's' : ''}</strong> · estimated time <strong className="text-fg1">~{requestedCount} min</strong>. No time limit enforced.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
