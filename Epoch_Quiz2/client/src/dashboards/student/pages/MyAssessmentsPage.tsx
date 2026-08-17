import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Clock, FileText, CheckCircle2, HourglassIcon,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton } from '../../shared/ui';
import { SessionOverScreen } from '../../shared/SessionOverScreen';
import { BranchCodeGate } from '../../shared/BranchCodeGate';
import { SESSION_END_DATE } from '../../../config/assessmentSession';
import { useAssessments, useAssessmentAccess } from '../../../hooks/useAssessments';
import { useMySubmissions } from '../../../hooks/useSubmissions';

/** Restored entry point of the standalone Assessment flow — see
 *  DashboardApp.tsx. Same minimal full-page shell as every other page in
 *  this flow; there is no Student Dashboard. */
function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

export function MyAssessmentsPage() {
  const [tab, setTab]         = useState<'available' | 'completed'>('available');
  const navigate              = useNavigate();
  const sessionOver = Date.now() >= SESSION_END_DATE.getTime();

  // A student who hasn't verified their Branch Code yet sees the unlock
  // popup instead of the assessment list entirely — Practice has no
  // equivalent check. The real security boundary is server-side
  // (requireBranchVerification on POST /assessments/:id/start); this is
  // purely the UX for it.
  const access = useAssessmentAccess();

  const { data: available, loading: aLoading, error: aError } = useAssessments({ status: 'PUBLISHED', limit: 20 });
  // Unfiltered so it covers every status the student can be in (including
  // SUBMITTED-but-not-yet-graded, which used to fall through the cracks —
  // fetched only under 'GRADED' before, so it showed in neither tab).
  const { data: myAttempts, loading: sLoading, error: sError } = useMySubmissions({ limit: 100 });

  // These must run on every render regardless of which early return below
  // fires (session-over / access-loading / Branch Code gate) — hooks can't
  // be called conditionally, or React throws "Rendered more hooks than
  // during the previous render" the moment the gate clears.
  const completedItems = useMemo(
    () => (myAttempts?.items ?? []).filter((s) => s.status !== 'IN_PROGRESS'),
    [myAttempts],
  );
  const completedAssessmentIds = useMemo(
    () => new Set(completedItems.map((s) => s.assessment.id)),
    [completedItems],
  );
  const availableItems = useMemo(
    () => (available?.items ?? []).filter((a) => !completedAssessmentIds.has(a.id)),
    [available, completedAssessmentIds],
  );

  // Once the session is over, students can't browse or start assessments at
  // all — this replaces the whole page, it isn't an add-on banner.
  if (sessionOver) return <StandalonePage><SessionOverScreen /></StandalonePage>;

  if (access.loading) {
    return (
      <StandalonePage>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-36" /></Card>
          ))}
        </div>
      </StandalonePage>
    );
  }
  if (!access.data?.hasAccess) {
    return <StandalonePage><BranchCodeGate onVerified={() => access.refetch()} /></StandalonePage>;
  }

  const loading = aLoading || sLoading;
  const loadError = aError || sError;

  // Assessment has no pause/resume: every assessment, whether or not a
  // previous attempt was interrupted, always opens the overview page and
  // a fresh attempt from there — never straight into the exam.
  const goToAssessment = (assessmentId: string) => navigate(`/assessment/${assessmentId}`);

  const tabs = [
    { id: 'available' as const, label: 'Available',  count: availableItems.length },
    { id: 'completed' as const, label: 'Completed',  count: completedItems.length  },
  ];

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Assessments"
        title="My Assessments"
        subtitle="Assessments assigned to you and your recent results."
      />

      {loadError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Some data could not be loaded — {loadError}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 px-4 rounded-xl text-[12.5px] font-semibold transition ${
              tab === t.id
                ? 'bg-brand text-brand-ink'
                : 'bg-surface1 text-fg2 border border-line hover:text-fg1'
            }`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ── Available tab ─────────────────────────────────────── */}
      {tab === 'available' && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5"><Skeleton className="h-36" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {availableItems.map((a) => (
              <Card
                key={a.id}
                className="p-5 group flex flex-col hover:border-line2 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                    <FileText size={18} />
                  </div>
                  <Badge tone="success">Available</Badge>
                </div>

                <h3 className="font-display font-semibold text-[15.5px] text-fg1 mb-1 group-hover:text-brand transition">
                  {a.title}
                </h3>
                <p className="text-[12.5px] text-fg3 line-clamp-2 mb-3">
                  {a.description ?? 'No description'}
                </p>

                <div className="flex items-center gap-4 text-[11.5px] text-fg3 mb-4">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />{a.duration} min
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText size={11} />{a.questionCount} questions
                  </span>
                  <span>{a.subject?.name ?? 'Mixed Subjects'}</span>
                </div>

                <Button
                  icon={Play}
                  className="w-full mt-auto"
                  onClick={() => goToAssessment(a.id)}
                >
                  Start now
                </Button>
              </Card>
            ))}

            {!aLoading && !availableItems.length && (
              <div className="col-span-full text-center py-12 text-fg3 text-[13px]">
                No assessments available right now
              </div>
            )}
          </div>
        )
      )}

      {/* ── Completed tab ─────────────────────────────────────── */}
      {tab === 'completed' && (
        sLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5"><Skeleton className="h-36" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {completedItems.map((s) => {
              // Results aren't shown the moment a submission is graded —
              // they stay withheld until the admin publishes them (or the
              // configured publish date arrives). See useSubmissions.ts /
              // the Assessment result-publication feature.
              const visible = s.resultsVisible ?? (s.percent !== null);

              return (
                <Card key={s.id} className="p-5 group flex flex-col hover:border-line2 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                      <FileText size={18} />
                    </div>
                    <Badge tone={visible ? 'info' : 'neutral'}>{visible ? 'Completed' : 'Result Pending'}</Badge>
                  </div>

                  <h3 className="font-display font-semibold text-[15.5px] text-fg1 mb-1 group-hover:text-brand transition">
                    {s.assessment.title}
                  </h3>
                  <p className="text-[12px] text-fg3 mb-1">{s.assessment.subject?.name ?? 'Mixed Subjects'}</p>

                  {visible ? (
                    <div className="text-[11.5px] text-fg3 mb-4">
                      Score:{' '}
                      <span className="font-mono font-semibold text-fg1">{s.score}/{s.totalMarks}</span>
                      {' · '}{s.percent}%
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-fg3 mb-4">
                      Results will be available once officially published.
                    </div>
                  )}

                  {visible ? (
                    <Button
                      variant="soft"
                      icon={CheckCircle2}
                      className="w-full mt-auto"
                      onClick={() => navigate(`/assessment/result/${s.id}`)}
                    >
                      View Results
                    </Button>
                  ) : (
                    <Button variant="soft" icon={HourglassIcon} className="w-full mt-auto" disabled>
                      Result Pending
                    </Button>
                  )}
                </Card>
              );
            })}

            {!sLoading && !completedItems.length && (
              <div className="col-span-full text-center py-12 text-fg3 text-[13px]">
                No completed assessments.{' '}
                <button onClick={() => setTab('available')} className="text-brand">
                  Start one →
                </button>
              </div>
            )}
          </div>
        )
      )}
    </StandalonePage>
  );
}
