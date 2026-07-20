import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, FileText, Target, ListChecks, ArrowLeft, Play, Info, AlertTriangle,
} from 'lucide-react';
import { Card, Button, Badge, Skeleton, useToasts } from '../../shared/ui';
import { SessionOverScreen } from '../../shared/SessionOverScreen';
import { SESSION_END_DATE } from '../../../config/assessmentSession';
import { useAssessment } from '../../../hooks/useAssessments';
import { assessmentTakeApi, type TakeSubmission, type SubmissionResult } from '../../../hooks/useSubmissionApi';

const GENERIC_INSTRUCTIONS = [
  'Read each question carefully before answering.',
  'Do not refresh or close this tab once the test has started.',
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

  // Blocks direct/bookmarked links into the assessment flow once the
  // session is over — the listing page already stops linking here, but a
  // stale link shouldn't still work.
  if (Date.now() >= SESSION_END_DATE.getTime()) return <SessionOverScreen />;

  const handleStart = async () => {
    if (!assessmentId) return;
    setStarting(true);
    try {
      const resp = await assessmentTakeApi.start(assessmentId);

      if (resp.autoSubmitted) {
        const result = resp.submission as SubmissionResult;
        push({ kind: 'info', title: 'Time already expired', sub: 'Redirecting to your results…' });
        setTimeout(() => navigate(`/student/assessment-result/${result.id}`, { state: { result } }), 400);
        return;
      }

      const sub = resp.submission as TakeSubmission;
      navigate(`/student/take/${sub.id}`, { state: { submission: sub } });
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot start', sub: e.message });
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card className="p-6"><Skeleton className="h-28" /></Card>
        <Card className="p-6"><Skeleton className="h-40" /></Card>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center text-fg3 mb-4">
          <AlertTriangle size={22} />
        </div>
        <h2 className="font-display font-semibold text-[18px] text-fg1 mb-1.5">Assessment not found</h2>
        <p className="text-[13px] text-fg3 mb-5">{error || "This assessment isn't available or isn't assigned to you."}</p>
        <Button onClick={() => navigate('/student/assessments')}>Back to Assessments</Button>
      </div>
    );
  }

  const passPct = assessment.totalMarks > 0 ? Math.round((assessment.passingMarks / assessment.totalMarks) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto pb-10">
      {node}

      <button
        onClick={() => navigate('/student/assessments')}
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
          {assessment.subject && <Badge tone="brand">{assessment.subject.name}</Badge>}
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
        <ul className="space-y-2">
          {GENERIC_INSTRUCTIONS.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-fg2 leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
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
  );
}
