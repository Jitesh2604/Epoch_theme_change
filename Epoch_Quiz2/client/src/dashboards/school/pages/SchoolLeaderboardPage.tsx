import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trophy, Globe, MapPin } from 'lucide-react';
import { useSchoolLeaderboard, useSchoolFilterOptions, type SchoolLeaderboardRow } from '../../../hooks/useSchoolPanel';
import {
  SchoolCard, SchoolPageHeading, SchoolSelect, SchoolAvatar, SchoolSkeleton, SchoolEmptyState,
  SchoolPagination, SchoolSegmentedControl,
} from '../schoolUI';

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

type Scope = 'school' | 'state' | 'global';

function PodiumStep({ row, place }: { row: SchoolLeaderboardRow; place: 1 | 2 | 3 }) {
  const cfg = {
    1: { medal: '🥇', h: 'h-32', order: 'order-2', ring: 'ring-4 ring-amber-300', avatarSize: 56, top: '-mt-4' },
    2: { medal: '🥈', h: 'h-24', order: 'order-1', ring: 'ring-4 ring-slate-300', avatarSize: 46, top: 'mt-4' },
    3: { medal: '🥉', h: 'h-20', order: 'order-3', ring: 'ring-4 ring-orange-300', avatarSize: 46, top: 'mt-6' },
  }[place];
  return (
    <div className={`flex flex-col items-center ${cfg.order}`}>
      <div className={`text-[26px] leading-none mb-1.5 ${cfg.top}`}>{cfg.medal}</div>
      <div className={`rounded-full ${cfg.ring}`}><SchoolAvatar name={row.studentName} size={cfg.avatarSize} /></div>
      <div className="text-[13px] font-extrabold text-white mt-2 text-center max-w-[110px] truncate">{row.studentName}</div>
      <div className="text-[11px] text-slate-300 text-center truncate max-w-[110px]">{row.className ?? '—'}</div>
      <div className="font-body font-extrabold text-[18px] text-[var(--sp-teal)] mt-1">{Math.round(row.percent)}%</div>
      <div className={`w-24 ${cfg.h} rounded-t-xl bg-gradient-to-b from-white/15 to-white/[0.03] border border-white/10 mt-3`} />
    </div>
  );
}

export function SchoolLeaderboardPage() {
  const { data: filters } = useSchoolFilterOptions();
  const [searchParams] = useSearchParams();
  const [scope, setScope] = useState<Scope>('school');
  const [session, setSession] = useState(() => searchParams.get('session') ?? '');
  const [subjectExternalId, setSubjectExternalId] = useState('all');
  const [classExternalId, setClassExternalId] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!session && filters?.sessions.length) setSession(filters.sessions[0]);
  }, [filters, session]);

  useEffect(() => { setPage(1); }, [session, subjectExternalId, classExternalId, branchId]);

  const { data, loading } = useSchoolLeaderboard({
    page,
    session: session || undefined,
    subjectExternalId: subjectExternalId !== 'all' ? subjectExternalId : undefined,
    classExternalId: classExternalId !== 'all' ? classExternalId : undefined,
    branchId: branchId !== 'all' ? branchId : undefined,
  });

  const items = data?.items ?? [];
  const podium = page === 1 ? [items.find(r => r.rank === 2), items.find(r => r.rank === 1), items.find(r => r.rank === 3)].filter(Boolean) as SchoolLeaderboardRow[] : [];
  const rest = page === 1 ? items.filter(r => r.rank > 3) : items;

  return (
    <div>
      <SchoolPageHeading
        eyebrow="🏆 Performance"
        title="School Rankings"
        subtitle="See who's leading across your school."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <SchoolSegmentedControl
          value={scope}
          onChange={setScope}
          options={[{ value: 'school', label: 'SCHOOL' }, { value: 'state', label: 'STATE' }, { value: 'global', label: 'GLOBAL' }]}
        />
      </div>

      {scope !== 'school' ? (
        <SchoolCard>
          <SchoolEmptyState
            icon={scope === 'state' ? MapPin : Globe}
            title={`${scope === 'state' ? 'State' : 'Global'} ranking isn't available in School Panel`}
            desc="The School Panel's ranking API is scoped to your own school only — showing other schools' students by name here would be a new data-exposure capability. Students see the full Global/State/School view on their own Leaderboard page."
          />
        </SchoolCard>
      ) : (
        <>
          <SchoolCard className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--sp-muted)] mb-1.5">Assessment / Session</div>
                <SchoolSelect value={session} onChange={setSession} options={(filters?.sessions ?? []).map(s => ({ value: s, label: s }))} className="w-full" />
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--sp-muted)] mb-1.5">Subject</div>
                <SchoolSelect value={subjectExternalId} onChange={setSubjectExternalId} options={[{ value: 'all', label: 'All Subjects' }, ...(filters?.subjects ?? []).map(s => ({ value: s.id, label: s.name }))]} className="w-full" />
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--sp-muted)] mb-1.5">Class</div>
                <SchoolSelect value={classExternalId} onChange={setClassExternalId} options={[{ value: 'all', label: 'All Classes' }, ...(filters?.classes ?? []).map(c => ({ value: c.id, label: c.name }))]} className="w-full" />
              </div>
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--sp-muted)] mb-1.5">Branch</div>
                <SchoolSelect value={branchId} onChange={setBranchId} options={[{ value: 'all', label: 'All Branches' }, ...(filters?.branches ?? []).map(b => ({ value: b.id, label: b.name }))]} className="w-full" />
              </div>
            </div>
          </SchoolCard>

          {loading ? (
            <SchoolCard noPad className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <SchoolSkeleton key={i} className="h-14 rounded-xl" />)}</SchoolCard>
          ) : data?.reason === 'NO_SESSION' || !items.length ? (
            <SchoolCard><SchoolEmptyState icon={Trophy} title="No assessment results available yet." desc="The leaderboard unlocks once results are published for this session." /></SchoolCard>
          ) : (
            <>
              {podium.length > 0 && (
                <div className="rounded-2xl bg-gradient-to-br from-[var(--sp-navy-950)] to-[var(--sp-navy-800)] px-6 pt-8 pb-0 mb-6 overflow-hidden">
                  <div className="flex items-end justify-center gap-4">
                    {podium.map(row => <PodiumStep key={row.submissionId} row={row} place={row.rank as 1 | 2 | 3} />)}
                  </div>
                </div>
              )}

              <SchoolCard noPad className="overflow-hidden">
                {rest.map(row => (
                  <div key={row.submissionId} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--sp-border)] last:border-0 hover:bg-[var(--sp-surface-alt)] transition">
                    <span className="w-8 text-center font-mono font-bold text-[13px] text-[var(--sp-muted)] shrink-0">#{row.rank}</span>
                    <SchoolAvatar name={row.studentName} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-bold text-[var(--sp-text)] truncate">{row.studentName}</div>
                      <div className="text-[11px] text-[var(--sp-muted)] truncate">{row.className ?? '—'}{row.branchName ? ` · ${row.branchName}` : ''} · {row.subjectName}</div>
                    </div>
                    <div className="hidden sm:block text-right shrink-0 mr-4">
                      <div className="font-mono font-bold text-[13px] text-[var(--sp-navy)]">{row.score}/{row.totalMarks}</div>
                      <div className="text-[11px] text-[var(--sp-muted)]">{Math.round(row.percent)}%</div>
                    </div>
                    <div className="text-right shrink-0 w-16">
                      <div className="text-[11px] text-[var(--sp-muted)]">{fmtTime(row.timeTakenSec)}</div>
                    </div>
                  </div>
                ))}
                {data?.meta && <SchoolPagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} disabled={loading} />}
              </SchoolCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
