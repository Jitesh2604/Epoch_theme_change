import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardX, FileText, CheckCircle2, HourglassIcon, Award } from 'lucide-react';
import { Card, Button, Badge, Skeleton } from '../../shared/ui';
import { StandaloneHeader } from '../../shared/StandaloneHeader';
import { SessionOverScreen } from '../../shared/SessionOverScreen';
import { SESSION_END_DATE } from '../../../config/assessmentSession';
import { useAssessments } from '../../../hooks/useAssessments';
import { useMySubmissions } from '../../../hooks/useSubmissions';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <StandaloneHeader />
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Entry point for the Assessment flow — reached from the main navbar's
 * "Assessment" link (/assessment). This product has exactly one assessment
 * per session, so there is nothing to browse or pick: this page resolves
 * that single assessment and either redirects straight into the existing
 * Details (AssessmentOverviewPage) or Exam (AssessmentTakePage) flow, shows
 * a lightweight "already completed" landing with a View Result button, or
 * shows a friendly empty state if nothing is assigned. It replaces the old
 * multi-assessment "My Assessments" list page, which this product's single-
 * assessment design has no use for.
 */
export function AssessmentEntryPage() {
  const navigate = useNavigate();
  const sessionOver = Date.now() >= SESSION_END_DATE.getTime();

  const { data: available, loading: aLoading, error: aError } = useAssessments({ status: 'PUBLISHED', limit: 20 });
  const { data: mySubmissions, loading: sLoading, error: sError } = useMySubmissions({ limit: 50 });

  // The one assessment for this session — first (and, by product design,
  // only) published assessment assigned to this student.
  const assessment = available?.items?.[0] ?? null;
  const submission = assessment
    ? mySubmissions?.items?.find((s) => s.assessment.id === assessment.id) ?? null
    : null;

  const loading = aLoading || sLoading;
  const loadError = aError || sError;

  // Fresh (no submission yet): skip straight to the Details page — no list,
  // no picking, nothing to choose between. In-progress: resume straight
  // into the exam, matching how the rest of the app already treats a
  // resumable attempt. Both are navigations, not renders, so they run once
  // the data is in, via effect rather than mid-render.
  useEffect(() => {
    if (loading || !assessment) return;
    if (!submission) {
      navigate(`/assessment/${assessment.id}`, { replace: true });
    } else if (submission.status === 'IN_PROGRESS') {
      navigate(`/assessment/take/${submission.id}`, { replace: true });
    }
  }, [loading, assessment, submission, navigate]);

  if (sessionOver) return <StandalonePage><SessionOverScreen /></StandalonePage>;

  if (loading) return <StandalonePage><CenteredSpinner /></StandalonePage>;

  if (loadError) {
    return (
      <StandalonePage>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center text-fg3 mb-4">
            <ClipboardX size={22} />
          </div>
          <h2 className="font-display font-semibold text-[18px] text-fg1 mb-1.5">Couldn't load your assessment</h2>
          <p className="text-[13px] text-fg3">{loadError}</p>
        </div>
      </StandalonePage>
    );
  }

  // No assessment assigned for this session at all.
  if (!assessment) {
    return (
      <StandalonePage>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center text-fg3 mb-5">
            <ClipboardX size={28} />
          </div>
          <h2 className="font-display font-semibold text-[20px] text-fg1 mb-2">No Assessment Available</h2>
          <p className="text-[13.5px] text-fg3 max-w-sm mx-auto">
            There's no assessment assigned to you for this session right now. Check back later, or
            reach out to your admin if you were expecting one.
          </p>
        </div>
      </StandalonePage>
    );
  }

  // In-progress redirects via the effect above; nothing to render in the
  // meantime beyond the spinner.
  if (submission?.status === 'IN_PROGRESS' || !submission) {
    return <StandalonePage><CenteredSpinner /></StandalonePage>;
  }

  // Completed (SUBMITTED still awaiting manual grading, or fully GRADED) —
  // a lightweight landing instead of the Details page, since Start
  // Assessment no longer applies. Explicit "View Result" click rather than
  // an automatic redirect, so the student gets a clear completed-state
  // moment first.
  //
  // resultsVisible (admin-controlled publication) is checked separately
  // from — and takes priority over — the manual-grading "pending" state:
  // a student must never see a score or a View Result button until the
  // admin has actually published results, regardless of grading status.
  const resultsVisible = submission.resultsVisible ?? false;
  const pending = submission.status === 'SUBMITTED';
  return (
    <StandalonePage>
      <div className="max-w-2xl mx-auto">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
              <FileText size={20} />
            </div>
            <Badge tone={!resultsVisible || pending ? 'warning' : 'success'}>
              {!resultsVisible ? 'Results Pending' : pending ? 'Grading in Progress' : 'Completed'}
            </Badge>
          </div>
          <h1 className="font-display font-semibold text-[20px] md:text-[22px] text-fg1 mt-3 mb-1.5">
            {assessment.title}
          </h1>
          {assessment.description && (
            <p className="text-[13.5px] text-fg3 leading-relaxed mb-4">{assessment.description}</p>
          )}

          <div className="p-4 rounded-xl bg-surface1 border border-line mb-5">
            {!resultsVisible ? (
              <>
                <p className="text-[13px] text-fg2">
                  Your assessment has been submitted successfully. Your results will be available
                  once they are officially published.
                </p>
                {submission.resultPublishAt && (
                  <p className="text-[12px] text-fg3 mt-1.5">
                    Expected on <strong className="text-fg1">{new Date(submission.resultPublishAt).toLocaleString()}</strong>.
                  </p>
                )}
              </>
            ) : pending ? (
              <p className="text-[13px] text-fg2">
                You've already submitted this assessment. One or more answers still need manual
                grading — your final score will be ready once your admin grades them.
              </p>
            ) : (
              <p className="text-[13px] text-fg2">
                You scored{' '}
                <span className="font-mono font-semibold text-fg1">{submission.score}/{submission.totalMarks}</span>
                {' '}({submission.percent}%). This assessment has already been completed and can't be retaken.
              </p>
            )}
          </div>

          {resultsVisible && (
            <Button
              icon={pending ? HourglassIcon : Award}
              size="lg"
              className="w-full"
              onClick={() => navigate(`/assessment/result/${submission.id}`)}
            >
              {pending ? 'View Attempt' : 'View Result'}
            </Button>
          )}
        </Card>
      </div>
    </StandalonePage>
  );
}
