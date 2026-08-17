import { useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp, ClipboardList, Award,
  Layers, TrendingUp, TrendingDown, Compass, GitCommitHorizontal, Trophy,
  School as SchoolIcon, MapPin, Globe, Mail, KeyRound,
} from 'lucide-react';
import {
  useSchoolStudentSubmission, useSchoolStudentPractice, useSchoolStudentAnalytics,
  useSchoolStudentCertificates, useSchoolStudentRanking, schoolPanelApi,
  type SchoolStudentHistoryEntry, type SchoolStudentProfile, type SchoolUpdateStudentProfilePayload,
} from '../../../hooks/useSchoolPanel';
import type { ResultQuestion } from '../../../hooks/useSubmissionApi';
import type { Certificate } from '../../../hooks/useCertificates';
import { CertificateCard } from '../../student/pages/certificates/CertificateCard';
import { CertificateViewerModal } from '../../student/pages/certificates/CertificateViewerModal';
import { CertificateVerifyModal } from '../../student/pages/certificates/CertificateVerifyModal';
import { getStrengthStatus } from '../../../lib/performanceBand';
import { deriveTopicInsights } from '../../../lib/topicInsights';
import { fmtDate, fmtSeconds, fmtDurationHMS } from '../../../lib/formatters';
import { useClasses } from '../../../hooks/useCatalog';
import { useMyBranches } from '../../../hooks/useBranchCodes';
import { forgotPassword } from '../../../lib/authStore';
import { EDUCATION_BOARD_OPTIONS } from '../../../lib/educationBoards';
import {
  SchoolCard, SchoolPill, SchoolSkeleton, SchoolEmptyState, SchoolTable, SchoolModal, SchoolKpiCard,
  SchoolSelect, SchoolButton, SchoolLabel, SchoolFieldError, SchoolInput, SchoolTextarea,
  SchoolBarList, SchoolStackedBarList, SchoolLineChart, SchoolSectionLabel,
} from '../schoolUI';

const LETTERS = ['A', 'B', 'C', 'D'];
const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const DIFFICULTY_COLOR: Record<string, string> = { EASY: 'bg-emerald-400', MEDIUM: 'bg-amber-400', HARD: 'bg-rose-400' };

function isUnanswered(q: ResultQuestion): boolean {
  return !q.yourAnswer || (
    q.yourAnswer.selectedOption === null &&
    q.yourAnswer.selectedBoolean === null &&
    !q.yourAnswer.textAnswer
  );
}

// ── Edit Profile — same real logic as before (schoolPanelApi.
// updateStudentProfile, class/branch scoped, password never shown, reset
// via the existing forgotPassword flow), fully re-skinned. ─────────────────

export function EditStudentProfileModal({
  studentId, profile, open, onClose, onSaved, push,
}: {
  studentId: string;
  profile: SchoolStudentProfile;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  push: (t: { kind: 'success' | 'danger' | 'info'; title: string; sub?: string }) => void;
}) {
  const { data: classes } = useClasses();
  const { data: branches } = useMyBranches();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [dob, setDob] = useState(profile.dob ? profile.dob.slice(0, 10) : '');
  const [classExternalId, setClassExternalId] = useState(profile.classExternalId ?? '');
  const [branchId, setBranchId] = useState(profile.branchId ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [state, setState] = useState(profile.state ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [zip, setZip] = useState(profile.zip ?? '');
  const [educationBoard, setEducationBoard] = useState(profile.educationBoard ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const close = () => { if (!saving) onClose(); };

  const handleSendResetEmail = async () => {
    setSendingReset(true);
    try {
      await forgotPassword(profile.email);
      push({ kind: 'success', title: 'Password reset email sent', sub: `An email was sent to ${profile.email}.` });
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not send reset email', sub: e?.message });
    } finally {
      setSendingReset(false);
    }
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload: SchoolUpdateStudentProfilePayload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      dob: dob || null,
      classExternalId: classExternalId || null,
      branchId: branchId || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      country: country.trim() || null,
      zip: zip.trim() || null,
      educationBoard: educationBoard || null,
    };

    setSaving(true);
    try {
      await schoolPanelApi.updateStudentProfile(studentId, payload);
      push({ kind: 'success', title: 'Profile updated', sub: `${name.trim()}'s profile has been saved.` });
      onSaved();
      onClose();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not save changes', sub: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SchoolModal
      open={open}
      onClose={close}
      title="Edit Profile"
      size="lg"
      footer={
        <>
          <SchoolButton variant="secondary" onClick={close} disabled={saving}>Cancel</SchoolButton>
          <SchoolButton onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</SchoolButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <SchoolLabel required>Name</SchoolLabel>
            <SchoolInput value={name} onChange={e => setName(e.target.value)} />
            <SchoolFieldError>{errors.name}</SchoolFieldError>
          </div>
          <div>
            <SchoolLabel required>Email</SchoolLabel>
            <SchoolInput value={email} onChange={e => setEmail(e.target.value)} type="email" />
            <SchoolFieldError>{errors.email}</SchoolFieldError>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <SchoolLabel>Phone</SchoolLabel>
            <SchoolInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <SchoolLabel>Date of Birth</SchoolLabel>
            <SchoolInput value={dob} onChange={e => setDob(e.target.value)} type="date" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <SchoolLabel>Class</SchoolLabel>
            <SchoolSelect value={classExternalId} onChange={setClassExternalId} options={[{ value: '', label: 'Not set' }, ...(classes ?? []).map(c => ({ value: c.id, label: c.name }))]} className="w-full" />
          </div>
          <div>
            <SchoolLabel>Branch</SchoolLabel>
            <SchoolSelect value={branchId} onChange={setBranchId} options={[{ value: '', label: 'Not set' }, ...(branches ?? []).map(b => ({ value: b.id, label: b.name }))]} className="w-full" />
            <p className="text-[11px] text-[var(--sp-muted)] mt-1">Only branches of your own school are listed.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><SchoolLabel>City</SchoolLabel><SchoolInput value={city} onChange={e => setCity(e.target.value)} /></div>
          <div><SchoolLabel>State</SchoolLabel><SchoolInput value={state} onChange={e => setState(e.target.value)} /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><SchoolLabel>Country</SchoolLabel><SchoolInput value={country} onChange={e => setCountry(e.target.value)} /></div>
          <div><SchoolLabel>Zip / Postal Code</SchoolLabel><SchoolInput value={zip} onChange={e => setZip(e.target.value)} /></div>
        </div>

        <div>
          <SchoolLabel>Address</SchoolLabel>
          <SchoolTextarea value={address} onChange={e => setAddress(e.target.value)} rows={2} />
        </div>

        <div>
          <SchoolLabel>Education Board</SchoolLabel>
          <SchoolSelect value={educationBoard} onChange={setEducationBoard} options={[{ value: '', label: 'Not set' }, ...EDUCATION_BOARD_OPTIONS]} className="w-full" />
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--sp-surface-alt)] border border-[var(--sp-border)]">
          <Mail size={15} className="text-[var(--sp-muted)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[12.5px] text-[var(--sp-text)]">Need to reset this student's password? Send them a password reset email — their current password is never shown here.</p>
          </div>
          <SchoolButton size="sm" variant="secondary" icon={KeyRound} onClick={handleSendResetEmail} disabled={sendingReset}>
            {sendingReset ? 'Sending…' : 'Send Reset Email'}
          </SchoolButton>
        </div>
      </div>
    </SchoolModal>
  );
}

// ── Results tab ─────────────────────────────────────────────────────────

export function ResultsTab({ studentId, history }: { studentId: string; history: SchoolStudentHistoryEntry[] }) {
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  return (
    <div>
      <SchoolCard noPad className="overflow-hidden">
        <SchoolTable
          columns={[
            { key: 'assessmentTitle', label: 'Assessment', render: (r: SchoolStudentHistoryEntry) => <span className="font-bold text-[var(--sp-text)]">{r.assessmentTitle}</span> },
            { key: 'subjectName', label: 'Subject', render: (r: SchoolStudentHistoryEntry) => <span className="text-[var(--sp-text)]">{r.subjectName}</span> },
            { key: 'score', label: 'Score', render: (r: SchoolStudentHistoryEntry) => <span className="font-mono font-bold text-[var(--sp-navy)]">{r.score}/{r.totalMarks}</span> },
            { key: 'percent', label: 'Percentage', render: (r: SchoolStudentHistoryEntry) => <span className="font-mono font-bold">{r.percent}%</span> },
            { key: 'rank', label: 'Rank', render: (r: SchoolStudentHistoryEntry) => <span className="font-mono text-[var(--sp-muted)]">{r.rank ? `#${r.rank}` : '—'}</span> },
            {
              key: 'answers', label: 'Correct / Wrong / Skipped',
              render: (r: SchoolStudentHistoryEntry) => (
                <span className="text-[12px]">
                  <span className="text-[var(--sp-success)] font-bold">{r.correctAnswers}</span> /{' '}
                  <span className="text-[var(--sp-danger)] font-bold">{r.wrongAnswers}</span> /{' '}
                  <span className="text-[var(--sp-muted)] font-bold">{r.skippedAnswers}</span>
                </span>
              ),
            },
            {
              key: 'status', label: 'Status',
              render: (r: SchoolStudentHistoryEntry) => <SchoolPill tone={r.status === 'GRADED' ? 'success' : 'info'}>{r.status.toLowerCase()}</SchoolPill>,
            },
            { key: 'submittedAt', label: 'Date', render: (r: SchoolStudentHistoryEntry) => <span className="text-[var(--sp-muted)]">{fmtDate(r.submittedAt)}</span> },
            {
              key: 'actions', label: '', className: 'text-right',
              render: (r: SchoolStudentHistoryEntry) => (
                <button className="text-[12px] font-bold text-[var(--sp-teal)] hover:text-[var(--sp-teal-600)]" onClick={() => setOpenSubmissionId(r.submissionId)}>
                  View Answer Sheet
                </button>
              ),
            },
          ]}
          rows={history}
          empty={
            <SchoolEmptyState
              icon={ClipboardList}
              title="No assessment results available yet."
              desc="This student's assessment history will appear here once they submit and results are published."
            />
          }
        />
      </SchoolCard>

      {openSubmissionId && (
        <AnswerSheetModal studentId={studentId} submissionId={openSubmissionId} onClose={() => setOpenSubmissionId(null)} />
      )}
    </div>
  );
}

// ── Answer Sheet ──────────────────────────────────────────────────────────

function AnswerSheetItem({ q, idx }: { q: ResultQuestion; idx: number }) {
  const [open, setOpen] = useState(false);
  const marksAwarded = q.marksAwarded ?? 0;
  const statusProps = q.isCorrect === true
    ? { icon: CheckCircle2, cls: 'text-[var(--sp-success)] bg-[var(--sp-success-bg)]', border: 'border-[var(--sp-success)]/25' }
    : q.isCorrect === false && !isUnanswered(q)
      ? { icon: XCircle, cls: 'text-[var(--sp-danger)] bg-[var(--sp-danger-bg)]', border: 'border-[var(--sp-danger)]/25' }
      : { icon: MinusCircle, cls: 'text-[var(--sp-muted)] bg-[var(--sp-surface-alt)]', border: 'border-[var(--sp-border)]' };
  const StatusIcon = statusProps.icon;
  const yourOptLetter = q.yourAnswer?.selectedOption != null ? (LETTERS[q.yourAnswer.selectedOption] ?? null) : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${statusProps.border}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--sp-surface-alt)] transition" onClick={() => setOpen(o => !o)}>
        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${statusProps.cls}`}><StatusIcon size={14} /></span>
        <span className="flex-1 text-[13px] font-semibold text-[var(--sp-text)] line-clamp-1">Q{idx + 1}. {q.prompt}</span>
        <SchoolPill tone="neutral" dot={false} className="shrink-0 text-[10px]">{DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}</SchoolPill>
        <span className="text-[11px] text-[var(--sp-muted)] tabular-nums shrink-0 font-mono">{marksAwarded}/{q.marks}</span>
        {open ? <ChevronUp size={14} className="text-[var(--sp-muted)] shrink-0" /> : <ChevronDown size={14} className="text-[var(--sp-muted)] shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--sp-border)] space-y-3">
          <p className="text-[13px] text-[var(--sp-text)] leading-relaxed">{q.prompt}</p>
          {q.promptImageUrl && <img src={q.promptImageUrl} alt="" className="max-w-full rounded-lg border border-[var(--sp-border)]" />}

          {(q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') && (q.options ?? []).map((opt, i) => {
            const letter = LETTERS[i] ?? String(i);
            const isCorrectOpt = (q.correctOptions?.length ?? 0) > 0 ? (q.correctOptions ?? []).includes(letter) : q.correctAnswer === letter;
            const isYours = yourOptLetter === letter;
            let cls = 'border-[var(--sp-border)] text-[var(--sp-muted)]';
            if (isCorrectOpt) cls = 'border-[var(--sp-success)]/40 bg-[var(--sp-success-bg)] text-[var(--sp-success)]';
            else if (isYours) cls = 'border-[var(--sp-danger)]/40 bg-[var(--sp-danger-bg)] text-[var(--sp-danger)]';
            return (
              <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12.5px] ${cls}`}>
                <span className="font-bold w-5 shrink-0">{letter}.</span>
                <span className="flex-1">{opt.text}</span>
                {opt.imageUrl && <img src={opt.imageUrl} alt="" className="h-10 rounded border border-[var(--sp-border)]" />}
                {isCorrectOpt && <CheckCircle2 size={13} className="text-[var(--sp-success)] shrink-0" />}
                {isYours && !isCorrectOpt && <XCircle size={13} className="text-[var(--sp-danger)] shrink-0" />}
              </div>
            );
          })}

          {q.type === 'TRUE_FALSE' && (
            <div className="text-[12.5px] text-[var(--sp-text)] space-y-1">
              <p><strong>Correct answer: </strong><span className="text-[var(--sp-success)]">{q.correctBoolean ? 'True' : 'False'}</span></p>
              {q.yourAnswer?.selectedBoolean != null && (
                <p><strong>Student's answer: </strong><span className={q.isCorrect ? 'text-[var(--sp-success)]' : 'text-[var(--sp-danger)]'}>{q.yourAnswer.selectedBoolean ? 'True' : 'False'}</span></p>
              )}
            </div>
          )}

          {q.type === 'FILL_IN_BLANK' && (
            <div className="text-[12.5px] text-[var(--sp-text)] space-y-1">
              <p><strong>Correct answer: </strong><span className="text-[var(--sp-success)]">{q.correctAnswer}</span></p>
              {q.yourAnswer?.textAnswer && (
                <p><strong>Student's answer: </strong><span className={q.isCorrect ? 'text-[var(--sp-success)]' : 'text-[var(--sp-danger)]'}>{q.yourAnswer.textAnswer}</span></p>
              )}
            </div>
          )}

          {q.type === 'DESCRIPTIVE' && (
            <div className="space-y-2">
              {q.yourAnswer?.textAnswer ? (
                <div className="p-3 rounded-lg bg-[var(--sp-surface-alt)] border border-[var(--sp-border)] text-[12.5px] text-[var(--sp-text)]">
                  <span className="font-bold text-[var(--sp-muted)] block mb-1">Student's answer:</span>{q.yourAnswer.textAnswer}
                </div>
              ) : <p className="text-[12px] text-[var(--sp-muted)] italic">Not answered.</p>}
              {q.modelAnswer && (
                <div className="p-3 rounded-lg bg-[var(--sp-success-bg)] border border-[var(--sp-success)]/25 text-[12.5px] text-[var(--sp-text)]">
                  <span className="font-bold text-[var(--sp-success)] block mb-1">Model answer:</span>{q.modelAnswer}
                </div>
              )}
            </div>
          )}

          {isUnanswered(q) && q.type !== 'DESCRIPTIVE' && <p className="text-[12px] text-[var(--sp-muted)] italic">Student did not answer this question.</p>}
        </div>
      )}
    </div>
  );
}

export function AnswerSheetModal({ studentId, submissionId, onClose }: { studentId: string; submissionId: string; onClose: () => void }) {
  const { data, loading, error } = useSchoolStudentSubmission(studentId, submissionId);

  return (
    <SchoolModal open onClose={onClose} title={data?.assessment.title ?? 'Answer Sheet'} size="lg">
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <SchoolSkeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : error ? (
        <SchoolEmptyState icon={XCircle} title="Couldn't load answer sheet" desc={error} />
      ) : !data?.questions?.length ? (
        <SchoolEmptyState icon={ClipboardList} title="No answer sheet available." desc="This submission has no recorded questions." />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4 text-[12.5px] text-[var(--sp-muted)]">
            <span>Score: <strong className="text-[var(--sp-text)]">{data.score}/{data.totalMarks}</strong></span>
            <span>·</span>
            <span>Percentage: <strong className="text-[var(--sp-text)]">{data.percent}%</strong></span>
          </div>
          <div className="space-y-2">
            {data.questions.map((q, i) => <AnswerSheetItem key={q.questionId} q={q} idx={i} />)}
          </div>
        </>
      )}
    </SchoolModal>
  );
}

// ── Practice tab ────────────────────────────────────────────────────────

export function PracticeTab({ studentId }: { studentId: string }) {
  const { data, loading, error } = useSchoolStudentPractice(studentId);

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-16" /></SchoolCard>)}</div>;
  if (error) return <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load practice history" desc={error} /></SchoolCard>;
  if (!data?.length) return <SchoolCard><SchoolEmptyState icon={ClipboardList} title="No practice attempts yet." desc="This student's Practice/Olympiad attempts will appear here once they complete one." /></SchoolCard>;

  return (
    <SchoolCard noPad className="overflow-hidden">
      <SchoolTable
        columns={[
          { key: 'quizTitle', label: 'Practice', render: (a: typeof data[number]) => <span className="font-bold text-[var(--sp-text)]">{a.quizTitle}</span> },
          { key: 'subject', label: 'Subject', render: (a: typeof data[number]) => <span className="text-[var(--sp-text)]">{a.subject?.name ?? 'Mixed'}</span> },
          { key: 'difficulty', label: 'Difficulty', render: (a: typeof data[number]) => <span className="text-[var(--sp-text)]">{a.difficulty ? (DIFFICULTY_LABEL[a.difficulty] ?? a.difficulty) : '—'}</span> },
          { key: 'score', label: 'Score', render: (a: typeof data[number]) => <span className="font-mono font-bold text-[var(--sp-navy)]">{a.score}</span> },
          { key: 'percentage', label: 'Accuracy', render: (a: typeof data[number]) => <span className="font-mono font-bold">{Math.round(a.percentage)}%</span> },
          { key: 'questionCount', label: 'Questions', render: (a: typeof data[number]) => <span className="font-mono">{a.questionCount}</span> },
          { key: 'timeTakenSec', label: 'Time Taken', render: (a: typeof data[number]) => <span className="text-[var(--sp-muted)]">{a.timeTakenSec ? fmtDurationHMS(a.timeTakenSec) : '—'}</span> },
          { key: 'startTime', label: 'Date', render: (a: typeof data[number]) => <span className="text-[var(--sp-muted)]">{fmtDate(a.startTime)}</span> },
        ]}
        rows={data}
      />
    </SchoolCard>
  );
}

// ── Analytics tab ────────────────────────────────────────────────────────

export function AnalyticsTab({ studentId }: { studentId: string }) {
  const { data, loading, error } = useSchoolStudentAnalytics(studentId);
  const topicInsights = useMemo(() => (data?.topics ? deriveTopicInsights(data.topics) : null), [data?.topics]);

  if (loading) return <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-20" /></SchoolCard>)}</div>;
  if (error) return <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load analytics" desc={error} /></SchoolCard>;
  if (!data?.overview.hasData) return <SchoolCard><SchoolEmptyState icon={Layers} title="Not enough data to generate analytics yet." desc="Analytics appear once this student completes Practice Olympiad attempts." /></SchoolCard>;

  const overview = data.overview;
  const totalQuestionsByDifficulty = data.difficulties.reduce((s, d) => s + d.totalQuestionsAttempted, 0);

  return (
    <div className="space-y-8">
      <div>
        <SchoolSectionLabel>Overall Performance</SchoolSectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SchoolKpiCard icon={ClipboardList} iconTone="navy" value={overview.totalAttempts} label="Practice Attempts" />
          <SchoolKpiCard icon={Layers} iconTone="teal" value={overview.totalQuestionsAttempted} label="Questions Attempted" />
          <SchoolKpiCard icon={TrendingUp} iconTone="success" value={`${overview.accuracyPercent}%`} label="Overall Accuracy" />
        </div>
      </div>

      {overview.accuracyTrend.history.length >= 2 && (
        <div>
          <SchoolSectionLabel>Improvement Trend</SchoolSectionLabel>
          <SchoolCard>
            <SchoolLineChart points={overview.accuracyTrend.history.map(h => ({ label: fmtDate(h.date), value: h.accuracy }))} />
          </SchoolCard>
        </div>
      )}

      <div>
        <SchoolSectionLabel>Subject-wise Performance</SchoolSectionLabel>
        {data.subjects.length ? (
          <SchoolCard>
            <SchoolBarList rows={data.subjects.map(s => ({ key: s.subjectId, label: s.subjectName, value: s.accuracyPercent, max: 100, valueLabel: `${s.accuracyPercent}%`, tone: s.accuracyPercent >= 75 ? 'success' : s.accuracyPercent >= 50 ? 'warning' : 'danger' }))} />
          </SchoolCard>
        ) : <SchoolCard><SchoolEmptyState icon={Layers} title="No subject data yet." desc="Subject-wise performance appears once this student practices." /></SchoolCard>}
      </div>

      {data.difficulties.length > 0 && (
        <div>
          <SchoolSectionLabel>Difficulty-wise Performance</SchoolSectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Difficulty Distribution</h4>
              <SchoolBarList
                rows={data.difficulties.map(d => ({
                  key: d.difficulty, label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty,
                  value: d.totalQuestionsAttempted, max: Math.max(...data.difficulties.map(x => x.totalQuestionsAttempted), 1),
                  valueLabel: `${d.totalQuestionsAttempted} (${totalQuestionsByDifficulty > 0 ? Math.round((d.totalQuestionsAttempted / totalQuestionsByDifficulty) * 100) : 0}%)`,
                  tone: 'navy',
                }))}
              />
            </SchoolCard>
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Answer Distribution</h4>
              <SchoolStackedBarList
                rows={data.difficulties.map(d => ({
                  key: d.difficulty, label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty, total: d.totalQuestionsAttempted,
                  trailingLabel: `${d.accuracyPercent}% accuracy`,
                  segments: [
                    { name: 'Correct', value: d.totalCorrect, colorClass: 'bg-emerald-400' },
                    { name: 'Wrong', value: d.totalWrong, colorClass: 'bg-rose-400' },
                    { name: 'Skipped', value: d.totalSkipped, colorClass: 'bg-slate-300' },
                  ],
                }))}
                legend={[
                  { name: 'Correct', value: 0, colorClass: 'bg-emerald-400' },
                  { name: 'Wrong', value: 0, colorClass: 'bg-rose-400' },
                  { name: 'Skipped', value: 0, colorClass: 'bg-slate-300' },
                ]}
              />
            </SchoolCard>
          </div>
        </div>
      )}

      <div>
        <SchoolSectionLabel>Topic Performance</SchoolSectionLabel>
        {!topicInsights || (!topicInsights.strongestTopics.length && !topicInsights.weakestTopics.length) ? (
          <SchoolCard><SchoolEmptyState icon={Compass} title="Not enough data to generate analytics yet." desc="Topic performance needs at least 2 answered questions per topic." /></SchoolCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3 flex items-center gap-1.5"><TrendingUp size={14} className="text-[var(--sp-success)]" /> Strong Topics</h4>
              {topicInsights.strongestTopics.length ? (
                <SchoolBarList rows={topicInsights.strongestTopics.map(t => ({ key: t.topicId, label: t.topicName, sublabel: t.subjectName, value: t.accuracyPercent, max: 100, valueLabel: `${t.accuracyPercent}%`, tone: 'success' }))} />
              ) : <p className="text-[12.5px] text-[var(--sp-muted)] py-6 text-center">No strong topics identified yet.</p>}
            </SchoolCard>
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3 flex items-center gap-1.5"><TrendingDown size={14} className="text-[var(--sp-danger)]" /> Weak Topics</h4>
              {topicInsights.weakestTopics.length ? (
                <SchoolBarList rows={topicInsights.weakestTopics.map(t => ({ key: t.topicId, label: t.topicName, sublabel: t.subjectName, value: t.accuracyPercent, max: 100, valueLabel: `${t.accuracyPercent}%`, tone: 'danger' }))} />
              ) : <p className="text-[12.5px] text-[var(--sp-muted)] py-6 text-center">No weak topics identified yet.</p>}
            </SchoolCard>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Certificates tab ────────────────────────────────────────────────────

export function CertificatesTab({ studentId }: { studentId: string }) {
  const { data, loading, error } = useSchoolStudentCertificates(studentId);
  const [viewingCert, setViewingCert] = useState<Certificate | null>(null);
  const [verifyingCertId, setVerifyingCertId] = useState<string | null>(null);

  if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <SchoolSkeleton key={i} className="h-72 rounded-2xl" />)}</div>;
  if (error) return <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load certificates" desc={error} /></SchoolCard>;
  if (!data?.length) return <SchoolCard><SchoolEmptyState icon={Award} title="No certificates earned yet." desc="Certificates appear here once this student earns a School/State/Global ranking badge on a published Assessment." /></SchoolCard>;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map(c => <CertificateCard key={c.certificateId} certificate={c} onView={setViewingCert} onVerify={setVerifyingCertId} />)}
      </div>
      <CertificateViewerModal certificate={viewingCert} onClose={() => setViewingCert(null)} onVerify={id => { setViewingCert(null); setVerifyingCertId(id); }} />
      <CertificateVerifyModal certificateId={verifyingCertId} onClose={() => setVerifyingCertId(null)} />
    </>
  );
}

// ── Leaderboard tab ─────────────────────────────────────────────────────

export function LeaderboardTab({ studentId, sessions }: { studentId: string; sessions: string[] }) {
  const [session, setSession] = useState(sessions[0] ?? '');
  const { data, loading, error } = useSchoolStudentRanking(studentId, { session: session || undefined });

  if (!sessions.length) {
    return <SchoolCard><SchoolEmptyState icon={Trophy} title="No assessment results available yet." desc="Ranking appears once this student has a published Assessment result." /></SchoolCard>;
  }

  return (
    <div>
      <SchoolCard className="mb-5">
        <div className="max-w-xs">
          <SchoolLabel>Session</SchoolLabel>
          <SchoolSelect value={session} onChange={setSession} options={sessions.map(s => ({ value: s, label: s }))} className="w-full" />
        </div>
      </SchoolCard>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-16" /></SchoolCard>)}</div>
      ) : error ? (
        <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load ranking" desc={error} /></SchoolCard>
      ) : !data?.hasResult ? (
        <SchoolCard><SchoolEmptyState icon={Trophy} title="No ranking yet." desc="This student has no ranked result for the selected session." /></SchoolCard>
      ) : (
        <>
          <SchoolCard className="mb-4">
            <div className="text-[12.5px] text-[var(--sp-muted)] mb-1">{data.assessmentTitle}{data.subjectName ? ` · ${data.subjectName}` : ''}</div>
            <div className="flex items-baseline gap-2">
              <span className="font-body font-extrabold text-[36px] text-[var(--sp-navy)] leading-none tabular-nums">#{data.globalRank}</span>
              <span className="text-[13px] text-[var(--sp-muted)]">out of {data.totalStudents ?? '—'} students</span>
            </div>
          </SchoolCard>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <SchoolCard className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-[var(--sp-navy-100)] text-[var(--sp-navy)]"><SchoolIcon size={18} /></div>
              <div><div className="text-[11px] text-[var(--sp-muted)]">School Rank</div><div className="font-body font-extrabold text-[19px] text-[var(--sp-text)]">{data.schoolRank ? `#${data.schoolRank}` : '—'}</div></div>
            </SchoolCard>
            <SchoolCard className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-[var(--sp-teal-100)] text-[var(--sp-teal-600)]"><MapPin size={18} /></div>
              <div><div className="text-[11px] text-[var(--sp-muted)]">State Rank</div><div className="font-body font-extrabold text-[19px] text-[var(--sp-text)]">{data.stateRank ? `#${data.stateRank}` : '—'}</div></div>
            </SchoolCard>
            <SchoolCard className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-[var(--sp-warning-bg)] text-[var(--sp-warning)]"><Globe size={18} /></div>
              <div><div className="text-[11px] text-[var(--sp-muted)]">Global Rank</div><div className="font-body font-extrabold text-[19px] text-[var(--sp-text)]">{data.globalRank ? `#${data.globalRank}` : '—'}</div></div>
            </SchoolCard>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SchoolCard><div className="text-[11px] text-[var(--sp-muted)]">Score</div><div className="font-body font-extrabold text-[16px] text-[var(--sp-text)] mt-0.5">{data.score}/{data.totalMarks}</div></SchoolCard>
            <SchoolCard><div className="text-[11px] text-[var(--sp-muted)]">Percentage</div><div className="font-body font-extrabold text-[16px] text-[var(--sp-text)] mt-0.5">{Math.round(data.percent ?? 0)}%</div></SchoolCard>
            <SchoolCard><div className="text-[11px] text-[var(--sp-muted)]">Class</div><div className="font-body font-extrabold text-[16px] text-[var(--sp-text)] mt-0.5">{data.className ?? '—'}</div></SchoolCard>
            <SchoolCard><div className="text-[11px] text-[var(--sp-muted)]">Time Taken</div><div className="font-body font-extrabold text-[16px] text-[var(--sp-text)] mt-0.5">{fmtSeconds(data.timeTakenSec ?? 0)}</div></SchoolCard>
          </div>
          {!!data.badges?.length && (
            <div className="flex flex-wrap gap-2 mt-4">
              {data.badges.map(b => <SchoolPill key={b} tone="navy"><Award size={11} /> {b.replace(/_/g, ' ')}</SchoolPill>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
