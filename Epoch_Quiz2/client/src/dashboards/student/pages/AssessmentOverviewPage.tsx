import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, FileText, Target, ListChecks, ArrowLeft, Play, Info, AlertTriangle, Layers,
  CheckCircle2, HourglassIcon,
} from 'lucide-react';
import { Card, Button, Badge, Skeleton, useToasts } from '../../shared/ui';
import { SessionOverScreen } from '../../shared/SessionOverScreen';
import { SESSION_END_DATE } from '../../../config/assessmentSession';
import { useAssessment } from '../../../hooks/useAssessments';
import { useMySubmissions } from '../../../hooks/useSubmissions';
import { assessmentTakeApi, type TakeSubmission, type SubmissionResult } from '../../../hooks/useSubmissionApi';

/** This page is deliberately a dedicated exam-landing page, not a dashboard
 *  page — see DashboardApp.tsx: the whole Assessment flow (entry, details,
 *  exam, result) is a set of standalone top-level routes; there is no
 *  Student Dashboard. Every return path here shares this same minimal
 *  full-page shell. */
function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

const GENERIC_INSTRUCTIONS = [
  'Read each question carefully before answering.',
  'Do not refresh, close the tab, or navigate away once the test has started — doing so ends the attempt immediately. Restarting begins a brand-new attempt from Question 1 with the timer reset.',
  'Make sure you have a stable internet connection.',
  'Submit your answers before the timer runs out — the test auto-submits at zero.',
];

function InfoTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surface1 border border-line">
      <div className="w-10 h-10 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-fg3 uppercase tracking-wide">{label}</div>
        <div className="text-[14px] font-semibold text-fg1 truncate">{value}</div>
      </div>
    </div>
  );
}

export function AssessmentOverviewPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { push, node } = useToasts();
  const { data: assessment, loading, error } = useAssessment(assessmentId ?? '');
  const [starting, setStarting] = useState(false);

  // A student gets exactly one attempt: once a submission for THIS assessment
  // exists and is no longer IN_PROGRESS, the Details page must show a status
  // screen instead of the Start button — regardless of how they got here
  // (Home quick-start card, My Assessments, a direct/bookmarked URL). The
  // backend already rejects a re-Start with a 409 (see SubmissionService.start),
  // so this is belt-and-suspenders: it stops the button from ever being shown
  // in the first place, rather than only catching the error after a click.
  const { data: mySubmissions, loading: subLoading } = useMySubmissions({
    assessmentId: assessmentId ?? '__none__', limit: 1,
  });
  const mySubmission = mySubmissions?.items.find(s => s.assessment.id === assessmentId);
  const alreadySubmitted = !!mySubmission && mySubmission.status !== 'IN_PROGRESS';

  // Blocks direct/bookmarked links into the assessment flow once the
  // session is over — the listing page already stops linking here, but a
  // stale link shouldn't still work.
  if (Date.now() >= SESSION_END_DATE.getTime()) {
    return <StandalonePage><SessionOverScreen /></StandalonePage>;
  }

  const handleStart = async () => {
    if (!assessmentId) return;
    setStarting(true);
    try {
      const resp = await assessmentTakeApi.start(assessmentId);

      if (resp.autoSubmitted) {
        const result = resp.submission as SubmissionResult;
        push({ kind: 'info', title: 'Time already expired', sub: 'Redirecting to your results…' });
        setTimeout(() => navigate(`/assessment/result/${result.id}`, { state: { result } }), 400);
        return;
      }

      const sub = resp.submission as TakeSubmission;
      navigate(`/assessment/take/${sub.id}`, { state: { submission: sub } });
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot start', sub: e.message });
      setStarting(false);
    }
  };

  if (loading || subLoading) {
    return (
      <StandalonePage>
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Card className="p-6"><Skeleton className="h-28" /></Card>
          <Card className="p-6"><Skeleton className="h-40" /></Card>
        </div>
      </StandalonePage>
    );
  }

  if (error || !assessment) {
    return (
      <StandalonePage>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center text-fg3 mb-4">
            <AlertTriangle size={22} />
          </div>
          <h2 className="font-display font-semibold text-[18px] text-fg1 mb-1.5">Assessment not found</h2>
          <p className="text-[13px] text-fg3 mb-5">{error || "This assessment isn't available or isn't assigned to you."}</p>
          <Button onClick={() => navigate('/assessment')}>Back to Assessments</Button>
        </div>
      </StandalonePage>
    );
  }

  // One attempt only: a submitted/graded row for this assessment already
  // exists, so the Details page must show status instead of Start — see the
  // alreadySubmitted computation above for why this is checked here rather
  // than only at the moment Start is clicked.
  if (alreadySubmitted && mySubmission) {
    const visible = mySubmission.resultsVisible ?? (mySubmission.percent !== null);
    return (
      <StandalonePage>
        <div className="max-w-md mx-auto text-center py-16">
          {node}
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-soft border border-line grid place-items-center text-brand mb-4">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="font-display font-semibold text-[19px] text-fg1 mb-1.5">Assessment Already Submitted</h2>
          <p className="text-[13.5px] text-fg3 leading-relaxed mb-5">
            You have already completed this assessment. Your assessment has been submitted successfully.
            {!visible && ' Results are not available yet and will be published by the Admin on the official result date.'}
          </p>

          <Card className="p-4 mb-6 text-left">
            <div className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="text-fg3">Submitted on</span>
              <span className="font-semibold text-fg1">
                {mySubmission.submittedAt ? new Date(mySubmission.submittedAt).toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 text-[13px] border-t border-line">
              <span className="text-fg3">Assessment status</span>
              <Badge tone="success">Submitted</Badge>
            </div>
            <div className="flex items-center justify-between py-1.5 text-[13px] border-t border-line">
              <span className="text-fg3">Result status</span>
              <Badge tone={visible ? 'info' : 'neutral'}>{visible ? 'Published' : 'Pending Publication'}</Badge>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/assessment')}>
              Back to Assessments
            </Button>
            {visible ? (
              <Button className="flex-1" icon={CheckCircle2} onClick={() => navigate(`/assessment/result/${mySubmission.id}`)}>
                View Results
              </Button>
            ) : (
              <Button className="flex-1" icon={HourglassIcon} disabled>
                Result Pending
              </Button>
            )}
          </div>
        </div>
      </StandalonePage>
    );
  }

  const passPct = assessment.totalMarks > 0 ? Math.round((assessment.passingMarks / assessment.totalMarks) * 100) : 0;

  return (
    <StandalonePage>
    <div className="max-w-2xl mx-auto pb-10">
      {node}

      <button
        onClick={() => navigate('/assessment')}
        className="flex items-center gap-1.5 text-[12.5px] text-fg3 hover:text-fg1 transition mb-5"
      >
        <ArrowLeft size={13} />
        Back to Assessments
      </button>

      {/* ── Header ─────────────────────────────────────────────── */}
      <Card className="p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
            <FileText size={20} />
          </div>
          <Badge tone="brand">{assessment.subject?.name ?? 'Mixed Subjects'}</Badge>
        </div>
        <h1 className="font-display font-semibold text-[20px] md:text-[22px] text-fg1 mt-3 mb-1.5">
          {assessment.title}
        </h1>
        {assessment.description && (
          <p className="text-[13.5px] text-fg3 leading-relaxed">{assessment.description}</p>
        )}
      </Card>

      {/* ── Key details ────────────────────────────────────────── */}
      <Card className="p-6 mb-4">
        <h3 className="font-display font-semibold text-[14px] text-fg1 mb-3 flex items-center gap-2">
          <ListChecks size={15} className="text-brand" />
          Assessment details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoTile icon={Layers} label="Subjects" value={assessment.subject?.name ?? 'Mixed Subjects'} />
          <InfoTile icon={Clock} label="Duration" value={`${assessment.duration} minutes`} />
          <InfoTile icon={FileText} label="Total questions" value={String(assessment.questionCount)} />
          <InfoTile icon={Target} label="Total marks" value={String(assessment.totalMarks)} />
          {assessment.passingMarks > 0 && (
            <InfoTile
              icon={ListChecks}
              label="Passing criteria"
              value={`${assessment.passingMarks}/${assessment.totalMarks} marks (${passPct}%)`}
            />
          )}
        </div>
      </Card>

      {/* ── Instructions ───────────────────────────────────────── */}
      <Card className="p-6 mb-6">
        <h3 className="font-display font-semibold text-[14px] text-fg1 mb-3 flex items-center gap-2">
          <Info size={15} className="text-brand" />
          Instructions
        </h3>
        {assessment.instructions ? (
          <p className="text-[13px] text-fg2 leading-relaxed whitespace-pre-line">{assessment.instructions}</p>
        ) : (
          <ul className="space-y-2">
            {GENERIC_INSTRUCTIONS.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] text-fg2 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button
        icon={Play}
        size="lg"
        className="w-full"
        onClick={handleStart}
        disabled={starting}
      >
        {starting ? 'Starting…' : 'Start Assessment'}
      </Button>
    </div>
    </StandalonePage>
  );
}
