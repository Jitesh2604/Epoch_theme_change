import React, { useRef, useState } from 'react';
import type { NavigateFn } from '../../types';
import {
  BookOpen, ChevronRight, Target, Clock,
  PlayCircle, AlertTriangle, ArrowLeft, Trophy,
  Hash, Award, MinusCircle, Globe, Info, ListChecks, ShieldAlert,
} from 'lucide-react';
import {
  Card, Button, Badge, Modal, Skeleton, EmptyState, useToasts,
} from '../../dashboards/shared/ui';
import { usePracticeSubjects, practiceApi, type PracticeSubject, type PracticePreview } from '../../hooks/usePracticeQuiz';
import { Footer } from '../../components/layout/Footer';
import { PageHead } from '../../components/layout/PageHead';
import { useT } from '../../lib/i18n';

interface QuizPlayPageProps {
  navigate: NavigateFn;
}

function fmtMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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

// ── Overview detail row ─────────────────────────────────────────────

function OverviewRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-surface1/50">
      <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-fg3">{label}</div>
        <div className="text-[13px] font-semibold text-fg1 truncate">{value}</div>
      </div>
    </div>
  );
}

/**
 * Practice Olympiad entry point — Subject Selection → Quiz Overview → Start
 * Quiz, entirely on the marketing site's `/play` route (and its `play/quiz/:id`,
 * `play/result/:id` children — see App.tsx). Never touches `/student/practice`;
 * closing/cancelling out of any step here just stays on `/play`.
 */
export const QuizPlayPage: React.FC<QuizPlayPageProps> = ({ navigate }) => {
  const t = useT();
  const { push, node: toastNode } = useToasts();
  const { data: subjects, loading, error: subjectsError, refetch: refetchSubjects } = usePracticeSubjects();

  const [selected,   setSelected]   = useState<PracticeSubject | null>(null);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | ''>('');
  const [starting,   setStarting]   = useState(false);
  const startingRef = useRef(false);

  // Quiz Overview / Confirmation step — shown after difficulty is picked,
  // before any attempt (and its time-limit clock) is created.
  const [phase,          setPhase]          = useState<'subjects' | 'overview'>('subjects');
  const [overview,       setOverview]       = useState<PracticePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openModal = (s: PracticeSubject) => {
    setSelected(s);
    setDifficulty('');
    setOverview(null);
    setPhase('subjects');
  };

  // Difficulty picked in the modal → fetch the backend-assigned quiz details
  // (question count / time limit / marks) and show the overview. No attempt
  // is created yet.
  const openOverview = async () => {
    if (!selected || !difficulty) return;
    setPreviewLoading(true);
    try {
      const preview = await practiceApi.previewPractice({ subjectExternalId: selected.id, difficulty });
      setOverview(preview);
      setPhase('overview');
    } catch (err: any) {
      push({ kind: 'danger', title: 'Could not load quiz overview', sub: err?.message ?? 'Please try again' });
    } finally {
      setPreviewLoading(false);
    }
  };

  // "Start Quiz" on the overview screen — this is the only place an attempt
  // gets created, so the time-limit clock never starts before the student
  // explicitly confirms.
  const startQuiz = async () => {
    if (!selected || !difficulty) return;
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const attempt = await practiceApi.start({
        subjectExternalId: selected.id,
        difficulty,
      });
      navigate(`play/quiz/${attempt.attemptId}`);
    } catch (err: any) {
      push({ kind: 'danger', title: 'Could not start quiz', sub: err?.message ?? 'Please try again' });
      setStarting(false);
      startingRef.current = false;
    }
  };

  // ── Overview / Confirmation screen ──────────────────────────────

  if (phase === 'overview' && overview) {
    const minutes = Math.round(overview.timeLimitSec / 60);
    return (
      <div className="page-enter">
        {toastNode}
        <div className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <Trophy size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold tracking-[0.1em] uppercase text-fg3">Quiz Overview</div>
                <h1 className="font-display font-semibold text-[20px] text-fg1">{overview.subject.name}</h1>
              </div>
            </div>

            {overview.resuming && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-soft border border-brand/30 mb-4">
                <PlayCircle size={14} className="text-brand shrink-0" />
                <p className="text-[12.5px] text-brand font-medium">
                  Resuming your paused session — you'll pick up right where you left off.
                </p>
              </div>
            )}

            <Card className="p-5 mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <OverviewRow icon={BookOpen}     label="Subject"            value={overview.subject.name} />
                <OverviewRow icon={Target}       label="Difficulty"         value={overview.difficulty[0] + overview.difficulty.slice(1).toLowerCase()} />
                <OverviewRow icon={Hash}         label="Total Questions"    value={String(overview.questionCount)} />
                <OverviewRow icon={Clock}        label="Total Time"         value={`${minutes} Minute${minutes !== 1 ? 's' : ''}`} />
                <OverviewRow icon={Award}        label="Total Marks"        value={fmtMarks(overview.totalMarks)} />
                <OverviewRow icon={Award}        label="Marks / Question"   value={fmtMarks(overview.marksPerQuestion)} />
                <OverviewRow icon={MinusCircle}  label="Negative Marking"   value={overview.negativeMarking ? 'Yes' : 'No'} />
                <OverviewRow icon={Trophy}       label="Quiz Type"          value="Practice Olympiad" />
                <OverviewRow icon={Globe}        label="Language"           value="English" />
              </div>
            </Card>

            <Card className="p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-brand" />
                <h3 className="font-display font-semibold text-[14px] text-fg1">Timer Information</h3>
              </div>
              <p className="text-[12.5px] text-fg2 leading-relaxed">
                {overview.resuming ? (
                  <>Your countdown was paused when you left and picks up from exactly where it stopped — the time you
                  spent away doesn't count against you.</>
                ) : (
                  <>Once you click <strong className="text-fg1">Start Quiz</strong>, a {minutes}-minute countdown begins immediately.
                  The quiz submits automatically if time runs out, so nothing you've answered is lost. The timer does not run
                  while you're on this page — it only starts after you confirm.</>
                )}
              </p>
            </Card>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-brand" />
                  <h3 className="font-display font-semibold text-[14px] text-fg1">Instructions</h3>
                </div>
                <ul className="space-y-2 text-[12.5px] text-fg2 leading-relaxed list-disc pl-4">
                  <li>Read each question carefully before answering.</li>
                  <li>Select an option and submit, or skip if you're unsure.</li>
                  <li>Explanations are shown right after each answer.</li>
                  <li>Passing criteria and scheduled date/time do not apply — this is a self-paced practice quiz.</li>
                </ul>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks size={14} className="text-brand" />
                  <h3 className="font-display font-semibold text-[14px] text-fg1">Rules</h3>
                </div>
                <ul className="space-y-2 text-[12.5px] text-fg2 leading-relaxed list-disc pl-4">
                  <li>Once submitted, an answer is locked — you cannot go back to a previous question.</li>
                  <li>Your progress is saved automatically as you go.</li>
                  <li>You can pause anytime and resume later — the timer picks up from where you left off.</li>
                  <li>Wrong answers are not negatively marked.</li>
                </ul>
              </Card>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-surface1 border border-line mb-6">
              <ShieldAlert size={14} className="text-fg3 shrink-0" />
              <p className="text-[12px] text-fg3">
                Question count and time limit are assigned automatically based on the difficulty you chose — they cannot be changed here.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setPhase('subjects')} disabled={starting}>
                Back
              </Button>
              <Button className="flex-1" icon={PlayCircle} onClick={startQuiz} disabled={starting}>
                {starting ? 'Starting…' : overview.resuming ? 'Resume Quiz' : 'Start Quiz'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Subject selection screen ────────────────────────────────────

  return (
    <div className="page-enter">
      {toastNode}
      <PageHead
        eyebrow={t('nav.quizPlay')}
        title={t('page.chooseCategory')}
        body={t('page.twoQuizModes')}
      />

      <section className="container" style={{ paddingBottom: 80 }}>
        {/* Hidden while the difficulty modal is open — otherwise the same
            card the student just clicked stays visible, dimmed, behind it. */}
        {!selected && (
          loading ? (
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
          ) : subjects?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {subjects.map(s => (
                <SubjectCard key={s.id} subject={s} onPlay={openModal} />
              ))}
            </div>
          ) : (
            <Card className="p-0 overflow-hidden">
              <EmptyState
                icon={BookOpen}
                title="No subjects available"
                desc="The question bank is empty. Ask a teacher or admin to add questions."
              />
            </Card>
          )
        )}
      </section>

      {/* Difficulty-selection modal — closing/cancelling just clears local
          state, so it always lands back on this same /play screen. */}
      <Modal
        open={phase === 'subjects' && !!selected}
        onClose={() => !previewLoading && setSelected(null)}
        title={`Practice · ${selected?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={previewLoading}>Cancel</Button>
            <Button icon={ChevronRight} onClick={openOverview} disabled={previewLoading || !difficulty}>
              {previewLoading ? 'Loading…' : 'Continue'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-fg2 uppercase tracking-wider mb-2">Difficulty</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'EASY',   label: 'Easy',   count: selected?.easyCount   ?? 0 },
                { val: 'MEDIUM', label: 'Medium', count: selected?.mediumCount ?? 0 },
                { val: 'HARD',   label: 'Hard',   count: selected?.hardCount   ?? 0 },
              ].map(o => {
                const disabled = o.count === 0;
                return (
                  <button
                    key={o.val}
                    disabled={disabled}
                    onClick={() => setDifficulty(o.val as 'EASY' | 'MEDIUM' | 'HARD')}
                    className={`px-3 py-2.5 rounded-xl border text-left transition ${
                      disabled
                        ? 'bg-surface1/50 border-line text-fg4 cursor-not-allowed opacity-60'
                        : difficulty === o.val
                          ? 'bg-brand-soft border-brand/40 text-brand'
                          : 'bg-surface1 border-line text-fg1 hover:border-brand/20'
                    }`}
                  >
                    <div className="text-[13px] font-semibold">{o.label}</div>
                    <div className="text-[11px] text-fg3 mt-0.5">{o.count} available</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-surface1 border border-line">
            <Clock size={14} className="text-fg3 shrink-0" />
            <p className="text-[12px] text-fg3">
              Question count and time limit are set automatically based on the difficulty you choose. You'll see the full quiz overview next.
            </p>
          </div>
        </div>
      </Modal>

      <Footer navigate={navigate} />
    </div>
  );
};
