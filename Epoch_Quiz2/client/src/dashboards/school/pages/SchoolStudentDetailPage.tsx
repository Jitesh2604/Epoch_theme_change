import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, School, Building2, GraduationCap, MapPin, Calendar,
  Target, Percent, ClipboardList, Trophy, XCircle, Pencil, FileCheck2,
  LayoutGrid, Award, BookOpen, Hash,
} from 'lucide-react';
import {
  ResultsTab, AnswerSheetModal, PracticeTab, AnalyticsTab, CertificatesTab, LeaderboardTab, EditStudentProfileModal,
} from './SchoolStudentDetailTabs';
import { fmtDate } from '../../../lib/formatters';
import { useSchoolStudentDetail, type SchoolStudentHistoryEntry } from '../../../hooks/useSchoolPanel';
import {
  SchoolCard, SchoolButton, SchoolPill, SchoolAvatar, SchoolSkeleton, SchoolEmptyState, SchoolKpiCard, SchoolTabs, useSchoolToasts,
} from '../schoolUI';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'results', label: 'Results', icon: ClipboardList },
  { id: 'answersheets', label: 'Answer Sheets', icon: FileCheck2 },
  { id: 'practice', label: 'Practice', icon: BookOpen },
  { id: 'analytics', label: 'Analytics', icon: Target },
  { id: 'certificates', label: 'Certificates', icon: Award },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
] as const;
type TabId = typeof TABS[number]['id'];

function ProfileRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[var(--sp-border)] last:border-0">
      <div className="w-9 h-9 rounded-xl bg-[var(--sp-surface-alt)] border border-[var(--sp-border)] grid place-items-center text-[var(--sp-muted)] shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sp-muted)]">{label}</div>
        <div className="text-[14px] font-semibold text-[var(--sp-text)] mt-0.5 break-words">{value}</div>
      </div>
    </div>
  );
}

/** A dedicated "open the answer sheet" list — same real assessmentHistory
 *  data the Results tab already has (no new fetch), reusing the existing
 *  AnswerSheetModal component, just surfaced as its own tab. */
function AnswerSheetsTab({ studentId, history }: { studentId: string; history: SchoolStudentHistoryEntry[] }) {
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);
  if (!history.length) {
    return <SchoolCard><SchoolEmptyState icon={FileCheck2} title="No answer sheets yet." desc="Once this student submits an assessment, their answer sheet will be available here." /></SchoolCard>;
  }
  return (
    <SchoolCard noPad className="overflow-hidden">
      <div className="divide-y divide-[var(--sp-border)]">
        {history.map(h => (
          <div key={h.submissionId} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--sp-surface-alt)] transition">
            <div className="w-9 h-9 rounded-lg bg-[var(--sp-navy-100)] text-[var(--sp-navy)] grid place-items-center shrink-0">
              <FileCheck2 size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-[var(--sp-text)] truncate">{h.assessmentTitle}</div>
              <div className="text-[11.5px] text-[var(--sp-muted)] truncate">{h.subjectName} · {fmtDate(h.submittedAt)}</div>
            </div>
            <div className="text-right shrink-0 mr-2">
              <div className="text-[12.5px] font-bold text-[var(--sp-navy)] tabular-nums">{h.score}/{h.totalMarks}</div>
              <div className="text-[11px] text-[var(--sp-muted)] tabular-nums">{h.percent}%</div>
            </div>
            <SchoolButton size="sm" variant="secondary" onClick={() => setOpenSubmissionId(h.submissionId)}>Open</SchoolButton>
          </div>
        ))}
      </div>
      {openSubmissionId && (
        <AnswerSheetModal studentId={studentId} submissionId={openSubmissionId} onClose={() => setOpenSubmissionId(null)} />
      )}
    </SchoolCard>
  );
}

export function SchoolStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data, loading, error, refetch } = useSchoolStudentDetail(id);
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get('tab');
    return (TABS.some(x => x.id === t) ? t : 'overview') as TabId;
  });
  const [editOpen, setEditOpen] = useState(() => searchParams.get('edit') === '1');
  const { push, node } = useSchoolToasts();

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some(x => x.id === t)) setTab(t as TabId);
    if (searchParams.get('edit') === '1') setEditOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      {node}
      <button onClick={() => navigate('/school/students')} className="flex items-center gap-1.5 mb-4 -ml-1 text-[12.5px] font-bold text-[var(--sp-muted)] hover:text-[var(--sp-navy)] transition">
        <ArrowLeft size={15} /> Back to Students
      </button>

      {loading ? (
        <div className="space-y-4">
          <SchoolCard><SchoolSkeleton className="h-24" /></SchoolCard>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-20" /></SchoolCard>)}
          </div>
        </div>
      ) : error ? (
        <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load student details" desc={error} /></SchoolCard>
      ) : !data || !id ? null : (
        <>
          <EditStudentProfileModal
            studentId={id}
            profile={data.profile}
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={refetch}
            push={push}
          />

          {/* Student management profile header */}
          <div className="rounded-2xl bg-gradient-to-br from-[var(--sp-navy-950)] to-[var(--sp-navy-800)] p-6 mb-6 relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[var(--sp-teal)]/15 blur-3xl" />
            <div className="relative flex flex-col md:flex-row md:items-center gap-5">
              <SchoolAvatar name={data.profile.name} size={68} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-body font-extrabold text-[20px] md:text-[22px] text-white truncate">{data.profile.name}</h1>
                  <SchoolPill tone={data.profile.status === 'ACTIVE' ? 'success' : 'neutral'}>{data.profile.status.toLowerCase()}</SchoolPill>
                  {!data.profile.verified && <SchoolPill tone="warning" dot={false}>branch unverified</SchoolPill>}
                </div>
                <p className="text-[13px] text-slate-300 mt-1">{data.profile.className ?? 'No class'} • {data.profile.branchName ?? 'No branch'}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-[11.5px] text-slate-400">
                  <span className="flex items-center gap-1.5"><Hash size={12} /> {data.profile.id.slice(-8).toUpperCase()}</span>
                  <span className="flex items-center gap-1.5"><Mail size={12} /> {data.profile.email}</span>
                </div>
              </div>
              <SchoolButton size="sm" variant="accent" icon={Pencil} onClick={() => setEditOpen(true)} className="shrink-0">Edit Profile</SchoolButton>
            </div>
          </div>

          <SchoolTabs value={tab} onChange={setTab} items={TABS as unknown as { id: TabId; label: string; icon: any }[]} />

          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SchoolKpiCard icon={Target} iconTone="navy" value={`${data.performance.overallScore}/${data.performance.overallTotalMarks}`} label="Overall Score" />
                <SchoolKpiCard icon={Percent} iconTone="teal" value={`${data.performance.averagePercentage}%`} label="Average Percentage" />
                <SchoolKpiCard icon={ClipboardList} iconTone="warning" value={data.performance.assessmentsAttempted} label="Assessments Attempted" />
                <SchoolKpiCard icon={Trophy} iconTone="success" value={`${data.performance.bestPercent}%`} label="Best Score" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SchoolCard>
                  <h3 className="font-body font-extrabold text-[14px] text-[var(--sp-text)] mb-1">Academic</h3>
                  <div>
                    <ProfileRow icon={GraduationCap} label="Class" value={data.profile.className ?? 'Not set'} />
                    <ProfileRow icon={School} label="School" value={data.profile.schoolName ?? 'Not set'} />
                    <ProfileRow icon={Building2} label="Branch" value={data.profile.branchName ?? 'Not set'} />
                    {data.profile.educationBoard && <ProfileRow icon={BookOpen} label="Education Board" value={data.profile.educationBoard} />}
                  </div>
                </SchoolCard>

                <SchoolCard>
                  <h3 className="font-body font-extrabold text-[14px] text-[var(--sp-text)] mb-1">Contact & Account</h3>
                  <div>
                    <ProfileRow icon={Mail} label="Email" value={data.profile.email} />
                    {data.profile.phone && <ProfileRow icon={Phone} label="Phone" value={data.profile.phone} />}
                    {(data.profile.address || data.profile.city || data.profile.state) && (
                      <ProfileRow icon={MapPin} label="Address" value={[data.profile.address, data.profile.city, data.profile.state, data.profile.country, data.profile.zip].filter(Boolean).join(', ')} />
                    )}
                    <ProfileRow icon={Calendar} label="Registration Date" value={fmtDate(data.profile.joinedAt)} />
                    <ProfileRow icon={Calendar} label="Last Login" value={data.profile.lastLoginAt ? fmtDate(data.profile.lastLoginAt) : 'Never logged in'} />
                  </div>
                </SchoolCard>
              </div>

              <div>
                <h3 className="font-body font-extrabold text-[15px] text-[var(--sp-text)] mb-4 flex items-center gap-2"><BookOpen size={16} className="text-[var(--sp-teal)]" /> Subject-wise Performance</h3>
                {data.subjectWise.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.subjectWise.map(s => (
                      <SchoolCard key={s.subjectId} className="p-4">
                        <h4 className="font-bold text-[13.5px] text-[var(--sp-text)] mb-2 truncate">{s.subjectName}</h4>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div><div className="font-body font-extrabold text-[15px] text-[var(--sp-navy)]">{s.attempted}</div><div className="text-[10.5px] text-[var(--sp-muted)]">Attempted</div></div>
                          <div><div className="font-body font-extrabold text-[15px] text-[var(--sp-navy)]">{s.averageScore}</div><div className="text-[10.5px] text-[var(--sp-muted)]">Avg Score</div></div>
                          <div><div className="font-body font-extrabold text-[15px] text-[var(--sp-navy)]">{s.averagePercentage}%</div><div className="text-[10.5px] text-[var(--sp-muted)]">Avg %</div></div>
                        </div>
                      </SchoolCard>
                    ))}
                  </div>
                ) : (
                  <SchoolCard><SchoolEmptyState icon={BookOpen} title="No assessment results available yet." desc="Subject-wise performance appears once this student submits an assessment." /></SchoolCard>
                )}
              </div>
            </div>
          )}

          {tab === 'results' && <ResultsTab studentId={id} history={data.assessmentHistory} />}
          {tab === 'answersheets' && <AnswerSheetsTab studentId={id} history={data.assessmentHistory} />}
          {tab === 'practice' && <PracticeTab studentId={id} />}
          {tab === 'analytics' && <AnalyticsTab studentId={id} />}
          {tab === 'certificates' && <CertificatesTab studentId={id} />}
          {tab === 'leaderboard' && (
            <LeaderboardTab studentId={id} sessions={[...new Set(data.assessmentHistory.map(h => h.assessmentTitle))]} />
          )}
        </>
      )}
    </div>
  );
}
