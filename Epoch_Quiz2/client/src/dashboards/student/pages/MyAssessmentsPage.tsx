import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Clock, FileText, CheckCircle2, RotateCcw,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton } from '../../shared/ui';
import { SessionOverScreen } from '../../shared/SessionOverScreen';
import { SESSION_END_DATE } from '../../../config/assessmentSession';
import { useAssessments } from '../../../hooks/useAssessments';
import { useMySubmissions } from '../../../hooks/useSubmissions';

export function MyAssessmentsPage() {
  const [tab, setTab]         = useState<'available' | 'completed'>('available');
  const navigate              = useNavigate();
  const sessionOver = Date.now() >= SESSION_END_DATE.getTime();

  const { data: available, loading: aLoading, error: aError } = useAssessments({ status: 'PUBLISHED', limit: 20 });
  const { data: completed, loading: cLoading, error: cError } = useMySubmissions({ status: 'GRADED', limit: 20 });
  const { data: inProgressSubs, loading: iLoading, error: iError } = useMySubmissions({ status: 'IN_PROGRESS', limit: 20 });

  // Once the session is over, students can't browse or start assessments at
  // all — this replaces the whole page, it isn't an add-on banner.
  if (sessionOver) return <SessionOverScreen />;

  const loading = aLoading || cLoading || iLoading;
  const loadError = aError || cError || iError;

  // Build a map of assessmentId → submissionId for in-progress attempts
  const inProgressMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of inProgressSubs?.items ?? []) {
      m.set(s.assessment.id, s.id);
    }
    return m;
  }, [inProgressSubs]);

  // Fresh attempts see the overview first; in-progress ones resume straight
  // into the test — the attempt/timer is already running for them.
  const goToAssessment = (assessmentId: string) => {
    const submissionId = inProgressMap.get(assessmentId);
    if (submissionId) navigate(`/student/take/${submissionId}`);
    else navigate(`/student/assessment-overview/${assessmentId}`);
  };

  const tabs = [
    { id: 'available' as const, label: 'Available',  count: available?.meta.total ?? 0 },
    { id: 'completed' as const, label: 'Completed',  count: completed?.meta.total ?? 0  },
  ];

  return (
    <>
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
            {(available?.items ?? []).map((a) => {
              const isInProgress = inProgressMap.has(a.id);

              return (
                <Card
                  key={a.id}
                  className="p-5 group flex flex-col hover:border-line2 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                      <FileText size={18} />
                    </div>
                    <Badge tone={isInProgress ? 'warning' : 'success'}>
                      {isInProgress ? 'In Progress' : 'Available'}
                    </Badge>
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
                    {a.subject && <span>{a.subject.name}</span>}
                  </div>

                  <Button
                    icon={isInProgress ? RotateCcw : Play}
                    className="w-full mt-auto"
                    onClick={() => goToAssessment(a.id)}
                  >
                    {isInProgress ? 'Resume' : 'Start now'}
                  </Button>
                </Card>
              );
            })}

            {!aLoading && !available?.items?.length && (
              <div className="col-span-full text-center py-12 text-fg3 text-[13px]">
                No assessments available right now
              </div>
            )}
          </div>
        )
      )}

      {/* ── Completed tab ─────────────────────────────────────── */}
      {tab === 'completed' && (
        cLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5"><Skeleton className="h-36" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(completed?.items ?? []).map((s) => (
              <Card key={s.id} className="p-5 group flex flex-col hover:border-line2 transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
                    <FileText size={18} />
                  </div>
                  <Badge tone="info">Completed</Badge>
                </div>

                <h3 className="font-display font-semibold text-[15.5px] text-fg1 mb-1 group-hover:text-brand transition">
                  {s.assessment.title}
                </h3>
                {s.assessment.subject && (
                  <p className="text-[12px] text-fg3 mb-1">{s.assessment.subject.name}</p>
                )}

                <div className="text-[11.5px] text-fg3 mb-4">
                  Score:{' '}
                  <span className="font-mono font-semibold text-fg1">{s.score}/{s.totalMarks}</span>
                  {' · '}{s.percent}%
                </div>

                <Button
                  variant="soft"
                  icon={CheckCircle2}
                  className="w-full mt-auto"
                  onClick={() => navigate(`/student/assessment-result/${s.id}`)}
                >
                  View Results
                </Button>
              </Card>
            ))}

            {!cLoading && !completed?.items?.length && (
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
    </>
  );
}
