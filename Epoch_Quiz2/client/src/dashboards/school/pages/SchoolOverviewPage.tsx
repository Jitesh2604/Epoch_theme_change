import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, Building2, ClipboardList, TrendingUp, Activity, Award,
  XCircle, GraduationCap, ArrowUpRight,
} from 'lucide-react';
import { useMyProfile } from '../../../hooks/useUsers';
import { useSchoolDashboard, useSchoolStudents, type SchoolDashboardActivity, type SchoolDashboardResult } from '../../../hooks/useSchoolPanel';
import { useMyBranches } from '../../../hooks/useBranchCodes';
import { groupByBranch } from '../schoolAggregates';
import { fmtDate } from '../../../lib/formatters';
import {
  SchoolCard, SchoolKpiCard, SchoolSkeleton, SchoolEmptyState, SchoolProgressRing, SchoolTrendBarRow, SchoolAvatar, SchoolSectionLabel,
} from '../schoolUI';

function ActivityRow({ activity }: { activity: SchoolDashboardActivity }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--sp-border)] last:border-0">
      <SchoolAvatar name={activity.studentName} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[var(--sp-text)] truncate">{activity.studentName}</p>
        <p className="text-[11.5px] text-[var(--sp-muted)] truncate">completed {activity.assessmentTitle}</p>
      </div>
      <span className="text-[11px] font-semibold text-[var(--sp-muted-2)] shrink-0">{fmtDate(activity.submittedAt)}</span>
    </div>
  );
}

function ResultRow({ result }: { result: SchoolDashboardResult }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--sp-border)] last:border-0">
      <SchoolAvatar name={result.studentName} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[var(--sp-text)] truncate">{result.studentName}</p>
        <p className="text-[11.5px] text-[var(--sp-muted)] truncate">{result.assessmentTitle}{result.subjectName ? ` · ${result.subjectName}` : ''}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-extrabold text-[var(--sp-navy)] tabular-nums">{result.score}/{result.totalMarks}</div>
        <div className="text-[11px] text-[var(--sp-muted)] tabular-nums">{result.percent}%</div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function SchoolOverviewPage() {
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const { data: dash, loading: dashLoading, error: dashError } = useSchoolDashboard();
  const { data: branches, loading: branchesLoading } = useMyBranches();
  const { data: roster, loading: rosterLoading } = useSchoolStudents({ page: 1, limit: 500 });

  const branchStats = useMemo(() => groupByBranch(roster?.items ?? []), [roster]);
  // SchoolStudentRow only carries branchName, not branchId (the id isn't
  // part of that endpoint's shape) — resolve name -> real id via the
  // branches already fetched above, so the "view branch" link filters
  // correctly instead of silently matching nothing.
  const branchIdByName = useMemo(() => new Map((branches ?? []).map(b => [b.name, b.id])), [branches]);
  const adminName = (profile?.name ?? 'School Admin').split(' ')[0];
  const reg = profile?.schoolRegistration;
  const overviewLoading = dashLoading || branchesLoading;
  const participation = dash && dash.totalStudents > 0 ? Math.round((dash.activeStudents / dash.totalStudents) * 100) : 0;

  return (
    <div>
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--sp-navy-950)] via-[var(--sp-navy-900)] to-[var(--sp-navy-800)] p-6 md:p-8 mb-6 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[var(--sp-teal)]/15 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <h1 className="font-body font-extrabold text-[24px] md:text-[28px] text-white tracking-tight">{greeting()}, {adminName}</h1>
            <p className="text-[13.5px] text-slate-300 mt-1.5">Here's your school's performance at a glance.</p>
          </div>
          {reg && (
            <div className="flex flex-wrap gap-4 md:gap-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">School</div>
                <div className="text-[13.5px] font-bold text-white mt-0.5">{reg.schoolName}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Branches</div>
                <div className="text-[13.5px] font-bold text-white mt-0.5">{branches?.length ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Students</div>
                <div className="text-[13.5px] font-bold text-white mt-0.5">{dash?.totalStudents ?? '—'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      {overviewLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-24" /></SchoolCard>)}
        </div>
      ) : dashError ? (
        <SchoolCard className="mb-8"><SchoolEmptyState icon={XCircle} title="Couldn't load school overview" desc={dashError} /></SchoolCard>
      ) : dash ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SchoolKpiCard icon={Users} iconTone="navy" value={dash.totalStudents} label="Students" trend={{ direction: 'flat', label: `${branches?.length ?? 0} branches` }} />
          <SchoolKpiCard icon={UserCheck} iconTone="teal" value={dash.activeStudents} label="Active Students" trend={{ direction: participation >= 50 ? 'up' : 'down', label: `${participation}% participation` }} />
          <SchoolKpiCard icon={ClipboardList} iconTone="warning" value={dash.assessmentsAttempted} label="Assessments" description="Attempted across your school" />
          <SchoolKpiCard icon={TrendingUp} iconTone="success" value={`${dash.averagePercentage}%`} label="Average Score" description={`Raw average ${dash.averageScore}`} />
        </div>
      ) : null}

      {/* Performance section — big chart + participation ring */}
      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <SchoolCard className="lg:col-span-2">
            <SchoolSectionLabel>School Performance</SchoolSectionLabel>
            <div className="flex items-center justify-center py-6">
              <div className="text-center">
                <div className="font-body font-extrabold text-[44px] text-[var(--sp-navy)] leading-none">{dash.averagePercentage}%</div>
                <p className="text-[12.5px] text-[var(--sp-muted)] mt-2">Average score across every published assessment result</p>
              </div>
            </div>
          </SchoolCard>
          <SchoolCard className="flex flex-col items-center justify-center">
            <SchoolSectionLabel>Participation</SchoolSectionLabel>
            <SchoolProgressRing value={participation} label="active students" />
          </SchoolCard>
        </div>
      )}

      {/* Branch Performance */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3.5">
          <SchoolSectionLabel>Branch Performance</SchoolSectionLabel>
          <button onClick={() => navigate('/school/branches')} className="text-[12px] font-bold text-[var(--sp-teal)] hover:text-[var(--sp-teal-600)] flex items-center gap-1">
            Manage <ArrowUpRight size={12} />
          </button>
        </div>
        {rosterLoading ? (
          <SchoolCard><SchoolSkeleton className="h-40" /></SchoolCard>
        ) : !branchStats.length ? (
          <SchoolCard><SchoolEmptyState icon={Building2} title="No branches yet" desc="Create a branch from the Branches page to start organizing students." /></SchoolCard>
        ) : (
          <SchoolCard noPad className="divide-y divide-[var(--sp-border)] px-5">
            {branchStats.map(b => (
              <SchoolTrendBarRow
                key={b.key}
                label={b.label}
                sublabel={`${b.studentCount} students · ${b.participationPercent}% participation${b.topPerformer ? ` · Top: ${b.topPerformer.name}` : ''}`}
                value={b.averagePercentage}
                onClick={() => { const id = branchIdByName.get(b.key); navigate(id ? `/school/students?branchId=${id}` : '/school/students'); }}
              />
            ))}
          </SchoolCard>
        )}
      </div>

      {/* Recent Activity */}
      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <SchoolSectionLabel>Recent Activity</SchoolSectionLabel>
            <SchoolCard noPad className="px-5">
              {dash.recentActivity.length ? (
                dash.recentActivity.map(a => <ActivityRow key={a.id} activity={a} />)
              ) : dash.totalStudents === 0 ? (
                <SchoolEmptyState icon={Activity} title="No students registered yet." desc="Activity will show up here once your students register with your school." />
              ) : (
                <SchoolEmptyState icon={Activity} title="No recent activity yet." desc="Submissions from your students will show up here." />
              )}
            </SchoolCard>
          </div>
          <div>
            <SchoolSectionLabel>Recent Results</SchoolSectionLabel>
            <SchoolCard noPad className="px-5">
              {dash.recentResults.length ? (
                dash.recentResults.map(r => <ResultRow key={r.id} result={r} />)
              ) : (
                <SchoolEmptyState icon={Award} title="No assessment results yet." desc="Published assessment results for your school will appear here." />
              )}
            </SchoolCard>
          </div>
        </div>
      )}

      {dash?.totalStudents === 0 && (
        <SchoolCard className="mt-6 flex items-center gap-3">
          <GraduationCap size={18} className="text-[var(--sp-teal)]" />
          <span className="text-[12.5px] text-[var(--sp-muted)]">Students who register with your school will appear here automatically.</span>
        </SchoolCard>
      )}
    </div>
  );
}
