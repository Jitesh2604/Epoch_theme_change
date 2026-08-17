import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  School as SchoolIcon, MapPin, Globe, Award, ChevronLeft, ChevronRight, HourglassIcon, Trophy, FlaskConical, PartyPopper,
} from 'lucide-react';
import {
  PageHeader, Card, Avatar, Badge, Button, Select, SearchInput, Skeleton, EmptyState,
} from '../../shared/ui';
import {
  useLeaderboardSessions, useAssessmentLeaderboard, useMyAssessmentRanking,
  type LeaderboardScope,
} from '../../../hooks/useLeaderboard';
import { useMyCertificates, type Certificate } from '../../../hooks/useCertificates';
import { CertificateCard } from './certificates/CertificateCard';
import { CertificateViewerModal } from './certificates/CertificateViewerModal';
import { CertificateVerifyModal } from './certificates/CertificateVerifyModal';
import { loadUser } from '../../../lib/authStore';

function StandalonePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg1 font-body">
      <main className="px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

const BADGE_META: Record<string, { label: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  SCHOOL_CHAMPION: { label: 'School Champion', tone: 'warning' },
  STATE_CHAMPION:  { label: 'State Champion',  tone: 'brand' },
  GLOBAL_CHAMPION: { label: 'Global Champion', tone: 'info' },
  GLOBAL_TOP_10:   { label: 'Global Top 10',   tone: 'success' },
  GLOBAL_TOP_100:  { label: 'Global Top 100',  tone: 'neutral' },
  STATE_TOP_10:    { label: 'State Top 10',    tone: 'info' },
};

const SCOPE_META: { id: LeaderboardScope; label: string; sub: string; icon: any; activeCls: string }[] = [
  { id: 'school', label: 'School Leaderboard', sub: 'Rank by school', icon: SchoolIcon, activeCls: 'ring-2 ring-sky-500 border-sky-500/40' },
  { id: 'state',  label: 'State Leaderboard',  sub: 'Rank by state',  icon: MapPin,     activeCls: 'ring-2 ring-fuchsia-500 border-fuchsia-500/40' },
  { id: 'global', label: 'Global Leaderboard', sub: 'Rank by global', icon: Globe,      activeCls: 'ring-2 ring-amber-500 border-amber-500/40' },
];

function RankTile({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | null | undefined; tone: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[11px] text-fg3">{label}</div>
        <div className="font-display font-semibold text-[19px] text-fg1">{value ? `#${value}` : '—'}</div>
      </div>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] text-fg3">{label}</div>
      <div className="font-display font-semibold text-[16px] text-fg1 mt-0.5">{value}</div>
    </Card>
  );
}

export function LeaderboardPage() {
  const navigate = useNavigate();
  const user = loadUser();

  // A student redirected here right after submitting an Assessment arrives
  // via ?session=<title>&subject=<id>&justSubmitted=1 (see
  // leaderboardLinkForResult in useSubmissionApi.ts) — read from the URL,
  // not router `state`, so a page refresh still resolves the same ranking
  // (state doesn't survive a reload; query params do). Read once on mount:
  // these only ever seed the initial filter values, the Session/Subject
  // dropdowns below remain freely changeable afterwards like before.
  const [searchParams] = useSearchParams();
  const [scope, setScope] = useState<LeaderboardScope>('school');
  const [session, setSession] = useState(() => searchParams.get('session') ?? '');
  const [subjectExternalId, setSubjectExternalId] = useState(() => searchParams.get('subject') ?? '');
  const [classExternalId, setClassExternalId] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [page, setPage] = useState(1);
  const justSubmitted = searchParams.get('justSubmitted') === '1';

  const { data: sessionsData, loading: sessionsLoading } = useLeaderboardSessions();

  // Default the Session filter to the most recently published session once
  // it loads — mirrors the server's own "no session given -> most recent"
  // fallback in resolveAssessments(), so the dropdown reflects reality.
  // Never overrides a session already seeded from the URL above.
  useEffect(() => {
    if (!session && sessionsData?.sessions.length) setSession(sessionsData.sessions[0].title);
  }, [sessionsData, session]);

  // Reset paging whenever a filter changes.
  useEffect(() => { setPage(1); }, [scope, session, subjectExternalId, classExternalId, schoolSearch]);

  const filters = useMemo(
    () => ({ session: session || undefined, subjectExternalId: subjectExternalId || undefined, classExternalId: classExternalId || undefined }),
    [session, subjectExternalId, classExternalId],
  );

  const rankingFilters = filters;
  const { data: ranking, loading: rankingLoading } = useMyAssessmentRanking(rankingFilters);

  const tableFilters = useMemo(
    () => ({ scope, ...filters, school: schoolSearch || undefined, page, limit: 20 }),
    [scope, filters, schoolSearch, page],
  );
  const { data: board, loading: boardLoading } = useAssessmentLeaderboard(tableFilters);

  // Your Certificates — reuses the exact same CertificateService.myCertificates
  // logic/data as the standalone CertificatesPage (GET /certificates/me,
  // scoped server-side to the logged-in student only, subject-wise, real
  // published-Assessment-results only) — no new backend endpoint, no second
  // certificate-generation path. Same CertificateCard/Viewer/Verify
  // components too, so View/Print/Download/Verify behave identically to the
  // rest of the app, not a reimplementation.
  const { data: certificates, loading: certificatesLoading } = useMyCertificates();
  const [viewingCert, setViewingCert] = useState<Certificate | null>(null);
  const [verifyingCertId, setVerifyingCertId] = useState<string | null>(null);

  const hasActiveFilters = !!(subjectExternalId || classExternalId || schoolSearch);

  // The server itself decides real vs. DEV-only dummy vs. empty (see
  // leaderboard.service.ts's hasAnyVisibleAssessments() gate) — the
  // frontend just reflects whatever it gets back. `sessionsData.sessions`
  // is non-empty for BOTH real data and the dev fallback, so this single
  // check is the whole "does the leaderboard have anything to show" gate;
  // no separate publish-state check needed here.
  const isDevPreview = !!(sessionsData?.devFallback || board?.devFallback || ranking?.devFallback || certificates?.some(c => c.devFallback));

  if (sessionsLoading) {
    return (
      <StandalonePage>
        <PageHeader eyebrow="Student · Leaderboard" title="Assessment Leaderboard" subtitle="Recognizing excellence through official Assessment results." />
        <Card className="p-6"><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div></Card>
      </StandalonePage>
    );
  }

  if (!sessionsData?.sessions.length) {
    return (
      <StandalonePage>
        <PageHeader eyebrow="Student · Leaderboard" title="Assessment Leaderboard" subtitle="Recognizing excellence through official Assessment results." />
        <Card>
          <EmptyState
            icon={HourglassIcon}
            title="No leaderboard results available yet"
            desc="The leaderboard unlocks once your Admin officially publishes Assessment results. Check back after results are out."
          />
        </Card>
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <PageHeader
        eyebrow="Student · Leaderboard"
        title="Assessment Leaderboard"
        subtitle="See the highest-performing students in your school, state, and across the platform, based on official published Assessment results."
      />

      {/* DEV-ONLY indicator — only ever true when the server's
          leaderboardDevFallback.ts kicked in (no real published-results
          Assessment exists yet). Never renders in production; see that
          file's module doc for the full gating story. */}
      {isDevPreview && (
        <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[12.5px] font-medium">
          <FlaskConical size={14} className="shrink-0" />
          Dev preview data — no real Assessment results published yet. This will disappear automatically once real results exist.
        </div>
      )}

      {/* School / State / Global mode switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {SCOPE_META.map(s => {
          const Icon = s.icon;
          const active = scope === s.id;
          return (
            <button key={s.id} onClick={() => setScope(s.id)} className="text-left">
              <Card className={`p-4 flex items-center gap-3 transition ${active ? s.activeCls : 'hover:border-line2'}`}>
                <div className="w-11 h-11 rounded-xl bg-surface2 border border-line grid place-items-center text-fg2 shrink-0">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-display font-semibold text-[14.5px] text-fg1">{s.label}</div>
                  <div className="text-[12px] text-fg3">{s.sub}</div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] font-semibold text-fg3 mb-1.5">Session</div>
            <Select
              value={session}
              onChange={setSession}
              options={(sessionsData?.sessions ?? []).map(s => ({ value: s.title, label: s.title }))}
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-fg3 mb-1.5">Subject</div>
            <Select
              value={subjectExternalId}
              onChange={setSubjectExternalId}
              options={[{ value: '', label: 'All Subjects' }, ...(sessionsData?.subjects ?? []).map(s => ({ value: s.id, label: s.name }))]}
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-fg3 mb-1.5">Class</div>
            <Select
              value={classExternalId}
              onChange={setClassExternalId}
              options={[{ value: '', label: 'All Classes' }, ...(sessionsData?.classes ?? []).map(c => ({ value: c.id, label: c.name }))]}
              className="w-full"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-fg3 mb-1.5">Search School</div>
            <SearchInput value={schoolSearch} onChange={setSchoolSearch} placeholder="Search by school..." />
          </div>
        </div>
      </Card>

      {/* Your Assessment Ranking */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Award size={18} className="text-brand" />
          <h3 className="font-display font-semibold text-[15px] text-fg1">Your Assessment Ranking</h3>
        </div>

        {justSubmitted && !rankingLoading && ranking?.hasResult && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-[12.5px] font-medium">
            <PartyPopper size={14} className="shrink-0" />
            Assessment submitted! Here's your ranking.
          </div>
        )}

        {rankingLoading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !ranking?.hasResult ? (
          <EmptyState
            icon={Trophy}
            title={justSubmitted ? 'Assessment submitted' : 'No ranking yet'}
            desc={
              justSubmitted
                ? "Your assessment has been submitted successfully. Your ranking will appear here once your Admin publishes the results for this Assessment."
                : 'Your assessment ranking will appear here after your result is published.'
            }
          />
        ) : (
          <>
            {/* Position, shown prominently — "#5 out of 120 students" */}
            <div className="mb-4">
              <div className="text-[12.5px] text-fg3 mb-1">
                {ranking.assessmentTitle}{ranking.subjectName ? ` · ${ranking.subjectName}` : ''}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-semibold text-[40px] text-fg1 leading-none tabular-nums">#{ranking.globalRank}</span>
                <span className="text-[13.5px] text-fg3">out of {ranking.totalStudents ?? '—'} students</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <RankTile icon={SchoolIcon} label="School Rank" value={ranking.schoolRank} tone="bg-sky-500/15 text-sky-500" />
              <RankTile icon={MapPin}     label="State Rank"  value={ranking.stateRank}  tone="bg-fuchsia-500/15 text-fuchsia-500" />
              <RankTile icon={Globe}      label="Global Rank" value={ranking.globalRank} tone="bg-amber-500/15 text-amber-500" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <InfoTile label="Assessment" value={ranking.assessmentTitle ?? '—'} />
              <InfoTile label="Subject" value={ranking.subjectName ?? '—'} />
              <InfoTile label="Class" value={ranking.className ?? '—'} />
              <InfoTile label="School" value={ranking.schoolName ?? '—'} />
              <InfoTile label="State" value={ranking.state ?? '—'} />
              <InfoTile label="Assessment Score" value={`${ranking.score}/${ranking.totalMarks}`} />
              <InfoTile label="Total Marks" value={String(ranking.totalMarks ?? '—')} />
              <InfoTile label="Percentage" value={`${Math.round(ranking.percent ?? 0)}%`} />
              <InfoTile label="Students Ranked" value={String(ranking.totalStudents ?? '—')} />
              <InfoTile label="Time Taken" value={fmtTime(ranking.timeTakenSec ?? 0)} />
            </div>

            {!!ranking.badges?.length && (
              <div className="flex flex-wrap gap-2 mb-4">
                {ranking.badges.map(b => (
                  <Badge key={b} tone={BADGE_META[b]?.tone ?? 'neutral'}>
                    <Award size={11} /> {BADGE_META[b]?.label ?? b}
                  </Badge>
                ))}
              </div>
            )}

            <Button variant="outline" onClick={() => navigate(`/assessment/result/${ranking.submissionId}`)}>
              View Assessment Result
            </Button>
          </>
        )}
      </Card>

      {/* Ranked leaderboard */}
      <Card className="overflow-hidden">
        {boardLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : board?.reason === 'NO_SCHOOL' ? (
          <EmptyState icon={SchoolIcon} title="Add your school to your profile" desc="We need your school on file to show the School Leaderboard — update it from your Profile page." />
        ) : board?.reason === 'NO_STATE' ? (
          <EmptyState icon={MapPin} title="Add your state to your profile" desc="We need your state on file to show the State Leaderboard — update it from your Profile page." />
        ) : !board?.items.length ? (
          <EmptyState
            icon={Trophy}
            title={hasActiveFilters ? 'No students found for the selected filters.' : 'No leaderboard results available yet.'}
            desc={hasActiveFilters ? 'Try a different subject, class, or school search.' : 'Check back once results for this session are in.'}
          />
        ) : (
          <>
            {board.items.map(row => {
              const isMe = row.studentId === user?.id;
              return (
                <div
                  key={row.studentId}
                  className={`flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-line/60 last:border-0 hover:bg-surface1/50 transition ${isMe ? 'bg-brand-soft/30' : ''}`}
                >
                  <span className="w-8 text-center font-mono text-[13px] text-fg3 shrink-0">#{row.rank}</span>
                  <Avatar name={row.studentName} hue={row.avatarHue} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-fg1 truncate">
                      {row.studentName}{isMe && <span className="ml-2 text-[11px] text-brand">(You)</span>}
                    </div>
                    <div className="text-[11px] text-fg3 truncate">
                      {row.schoolName ?? '—'}{row.state ? ` · ${row.state}` : ''}{row.className ? ` · ${row.className}` : ''}
                    </div>
                  </div>
                  <div className="hidden sm:block text-right shrink-0 mr-4">
                    <div className="font-mono text-[13px] text-fg1">{row.score}/{row.totalMarks}</div>
                    <div className="text-[11px] text-fg3">{Math.round(row.percent)}%</div>
                  </div>
                  <div className="text-right shrink-0 w-16">
                    <div className="text-[11px] text-fg3">{fmtTime(row.timeTakenSec)}</div>
                  </div>
                </div>
              );
            })}

            {board.meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-line">
                <span className="text-[12px] text-fg3">Page {board.meta.page} of {board.meta.totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
                  <Button size="sm" variant="outline" icon={ChevronRight} disabled={page >= board.meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Your Certificates */}
      <Card className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Award size={18} className="text-brand" />
          <h3 className="font-display font-semibold text-[15px] text-fg1">Your Certificates</h3>
        </div>

        {certificatesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
          </div>
        ) : !certificates?.length ? (
          <EmptyState
            icon={Award}
            title="No certificates earned yet."
            desc="Complete assessments and achieve the required performance to earn certificates."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {certificates.map(c => (
              <CertificateCard
                key={c.certificateId}
                certificate={c}
                onView={setViewingCert}
                onVerify={setVerifyingCertId}
              />
            ))}
          </div>
        )}
      </Card>

      <CertificateViewerModal
        certificate={viewingCert}
        onClose={() => setViewingCert(null)}
        onVerify={(id) => { setViewingCert(null); setVerifyingCertId(id); }}
      />
      <CertificateVerifyModal certificateId={verifyingCertId} onClose={() => setVerifyingCertId(null)} />
    </StandalonePage>
  );
}
