import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, Hash, CheckCircle2, XCircle, Target, BarChart3, Layers, BookOpen, TrendingUp, TrendingDown, Compass,
  GitCommitHorizontal, Building2, GraduationCap, Trophy, AlertTriangle, Activity,
} from 'lucide-react';
import {
  useSchoolAnalyticsOverview, useSchoolSubjectBreakdown, useSchoolDifficultyBreakdown,
  useSchoolImprovementTrend, useSchoolTopicInsights,
} from '../../../hooks/useSchoolAnalytics';
import { useSchoolFilterOptions, useSchoolStudents } from '../../../hooks/useSchoolPanel';
import { groupByBranch, groupByClass, topPerformers, studentsNeedingAttention } from '../schoolAggregates';
import { fmtDate } from '../../../lib/formatters';
import {
  SchoolCard, SchoolPageHeading, SchoolSelect, SchoolKpiCard, SchoolSkeleton, SchoolEmptyState, SchoolAvatar, SchoolPill,
  SchoolBarList, SchoolStackedBarList, SchoolLineChart, SchoolSectionLabel,
} from '../schoolUI';

const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

function toneFor(pct: number): 'success' | 'warning' | 'danger' {
  if (pct >= 75) return 'success';
  if (pct >= 50) return 'warning';
  return 'danger';
}

export function SchoolAnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [branchId, setBranchId] = useState(() => searchParams.get('branchId') ?? 'all');
  const b = branchId !== 'all' ? branchId : undefined;

  const { data: filters } = useSchoolFilterOptions();
  const { data: overview, loading: overviewLoading, error: overviewError } = useSchoolAnalyticsOverview(b);
  const { data: subjects, loading: subjectsLoading, error: subjectsError } = useSchoolSubjectBreakdown(b);
  const { data: difficulties, loading: difficultiesLoading, error: difficultiesError } = useSchoolDifficultyBreakdown(b);
  const { data: trend, loading: trendLoading, error: trendError } = useSchoolImprovementTrend(b);
  const { data: topics, loading: topicsLoading, error: topicsError } = useSchoolTopicInsights(b);
  const { data: roster, loading: rosterLoading } = useSchoolStudents({ page: 1, limit: 500, branchId: b });
  const students = roster?.items ?? [];
  const branchStats = useMemo(() => groupByBranch(students), [students]);
  const classStats = useMemo(() => groupByClass(students), [students]);
  const strong = useMemo(() => topPerformers(students, 5), [students]);
  const attention = useMemo(() => studentsNeedingAttention(students, 5), [students]);

  const totalQuestions = (difficulties ?? []).reduce((s, d) => s + d.totalQuestionsAttempted, 0);

  return (
    <div>
      <SchoolPageHeading
        title="Analytics"
        subtitle="Aggregate performance across every student in your school, built on official Assessment results."
        actions={
          <SchoolSelect
            value={branchId}
            onChange={setBranchId}
            options={[{ value: 'all', label: 'All branches' }, ...(filters?.branches ?? []).map(bb => ({ value: bb.id, label: bb.name }))]}
          />
        }
      />

      {/* School Performance */}
      <SchoolSectionLabel>School Performance</SchoolSectionLabel>
      {overviewLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <SchoolCard key={i}><SchoolSkeleton className="h-20" /></SchoolCard>)}
        </div>
      ) : overviewError ? (
        <SchoolCard className="mb-8"><SchoolEmptyState icon={XCircle} title="Couldn't load analytics" desc={overviewError} /></SchoolCard>
      ) : !overview?.hasData ? (
        <SchoolCard className="mb-8"><SchoolEmptyState icon={BarChart3} title="Not enough data to generate analytics yet." desc="Analytics will appear once your students submit assessments with published results." /></SchoolCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          <SchoolKpiCard icon={Hash} iconTone="navy" value={overview.assessmentsAttempted} label="Assessments Attempted" />
          <SchoolKpiCard icon={Users} iconTone="teal" value={`${overview.studentsAttempted} (${overview.participationPercent}%)`} label="Students Participated" />
          <SchoolKpiCard icon={Target} iconTone="warning" value={overview.averageScore} label="Average Score" />
          <SchoolKpiCard icon={TrendingUp} iconTone="success" value={`${overview.averagePercentage}%`} label="Average Percentage" />
          <SchoolKpiCard icon={CheckCircle2} iconTone="success" value={overview.totalCorrect} label="Correct Answers" />
          <SchoolKpiCard icon={XCircle} iconTone="warning" value={overview.totalWrong} label="Wrong Answers" />
          <SchoolKpiCard icon={Hash} iconTone="navy" value={overview.totalSkipped} label="Skipped" />
          <SchoolKpiCard icon={Target} iconTone="teal" value={`${overview.accuracyPercent}%`} label="Overall Accuracy" />
        </div>
      )}

      {trendLoading ? (
        <SchoolCard className="mb-8"><SchoolSkeleton className="h-40" /></SchoolCard>
      ) : trendError ? (
        <SchoolCard className="mb-8"><SchoolEmptyState icon={XCircle} title="Couldn't load performance over time" desc={trendError} /></SchoolCard>
      ) : !trend || trend.length < 2 ? (
        <SchoolCard className="mb-8"><SchoolEmptyState icon={GitCommitHorizontal} title="Not enough data for a trend yet." desc="A performance-over-time graph appears once your school has results across at least two assessment sessions." /></SchoolCard>
      ) : (
        <SchoolCard className="mb-8">
          <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Performance over time</h4>
          <SchoolLineChart points={trend.map(t => ({ label: fmtDate(t.date), value: t.averagePercentage }))} height={180} />
        </SchoolCard>
      )}

      {/* Subject Performance */}
      <SchoolSectionLabel>Subject Performance</SchoolSectionLabel>
      <div className="mb-8">
        {subjectsLoading ? (
          <SchoolCard><SchoolSkeleton className="h-40" /></SchoolCard>
        ) : subjectsError ? (
          <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load subject performance" desc={subjectsError} /></SchoolCard>
        ) : !subjects?.length ? (
          <SchoolCard><SchoolEmptyState icon={BookOpen} title="Not enough data yet." desc="Subject performance appears once your students attempt assessments." /></SchoolCard>
        ) : (
          <SchoolCard>
            <SchoolBarList rows={subjects.map(s => ({ key: s.subjectId, label: s.subjectName, sublabel: `${s.totalCorrect}/${s.totalQuestionsAttempted} correct`, value: s.accuracyPercent, max: 100, valueLabel: `${s.accuracyPercent}%`, tone: toneFor(s.accuracyPercent) }))} />
          </SchoolCard>
        )}
      </div>

      {/* Branch Comparison */}
      <SchoolSectionLabel>Branch Comparison</SchoolSectionLabel>
      <div className="mb-8">
        {rosterLoading ? (
          <SchoolCard><SchoolSkeleton className="h-32" /></SchoolCard>
        ) : !branchStats.length ? (
          <SchoolCard><SchoolEmptyState icon={Building2} title="No branch data yet." desc="Branch comparison appears once students are assigned to branches." /></SchoolCard>
        ) : (
          <SchoolCard>
            <SchoolBarList rows={branchStats.map(bs => ({ key: bs.key, label: bs.label, sublabel: `${bs.studentCount} students · ${bs.participationPercent}% participation`, value: bs.averagePercentage, max: 100, valueLabel: `${bs.averagePercentage}%`, tone: toneFor(bs.averagePercentage) }))} />
          </SchoolCard>
        )}
      </div>

      {/* Class Performance */}
      <SchoolSectionLabel>Class Performance</SchoolSectionLabel>
      <div className="mb-8">
        {rosterLoading ? (
          <SchoolCard><SchoolSkeleton className="h-32" /></SchoolCard>
        ) : !classStats.length ? (
          <SchoolCard><SchoolEmptyState icon={GraduationCap} title="No class data yet." desc="Class performance appears once students are assigned to a class." /></SchoolCard>
        ) : (
          <SchoolCard>
            <SchoolBarList rows={classStats.map(cs => ({ key: cs.key, label: cs.label, sublabel: `${cs.studentCount} students · ${cs.participationPercent}% participation`, value: cs.averagePercentage, max: 100, valueLabel: `${cs.averagePercentage}%`, tone: toneFor(cs.averagePercentage) }))} />
          </SchoolCard>
        )}
      </div>

      {/* Strong Students / Students Needing Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <div>
          <SchoolSectionLabel>Strong Students</SchoolSectionLabel>
          {rosterLoading ? (
            <SchoolCard><SchoolSkeleton className="h-40" /></SchoolCard>
          ) : !strong.length ? (
            <SchoolCard><SchoolEmptyState icon={Trophy} title="No data yet." desc="Top performers appear once students attempt assessments." /></SchoolCard>
          ) : (
            <SchoolCard noPad className="divide-y divide-[var(--sp-border)] overflow-hidden">
              {strong.map((s, i) => (
                <button key={s.id} onClick={() => navigate(`/school/students/${s.id}`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--sp-surface-alt)] transition text-left">
                  <span className="text-[11px] font-mono font-bold text-[var(--sp-muted-2)] w-4">#{i + 1}</span>
                  <SchoolAvatar name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-[var(--sp-text)] truncate">{s.name}</div>
                    <div className="text-[11px] text-[var(--sp-muted)] truncate">{s.className ?? '—'} · {s.branchName ?? '—'}</div>
                  </div>
                  <SchoolPill tone="success" dot={false}>{s.averagePercentage}%</SchoolPill>
                </button>
              ))}
            </SchoolCard>
          )}
        </div>
        <div>
          <SchoolSectionLabel>Students Needing Attention</SchoolSectionLabel>
          {rosterLoading ? (
            <SchoolCard><SchoolSkeleton className="h-40" /></SchoolCard>
          ) : !attention.length ? (
            <SchoolCard><SchoolEmptyState icon={AlertTriangle} title="Nobody flagged right now." desc="Students who've attempted 2+ assessments and average below 60% will appear here." /></SchoolCard>
          ) : (
            <SchoolCard noPad className="divide-y divide-[var(--sp-border)] overflow-hidden">
              {attention.map(s => (
                <button key={s.id} onClick={() => navigate(`/school/students/${s.id}`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--sp-surface-alt)] transition text-left">
                  <SchoolAvatar name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-[var(--sp-text)] truncate">{s.name}</div>
                    <div className="text-[11px] text-[var(--sp-muted)] truncate">{s.className ?? '—'} · {s.branchName ?? '—'} · {s.assessmentsAttempted} attempted</div>
                  </div>
                  <SchoolPill tone="danger" dot={false}>{s.averagePercentage}%</SchoolPill>
                </button>
              ))}
            </SchoolCard>
          )}
        </div>
      </div>

      {/* Participation */}
      <SchoolSectionLabel>Participation</SchoolSectionLabel>
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SchoolCard>
          <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Assessment Participation</h4>
          {overview?.hasData ? (
            <SchoolBarList rows={[{ key: 'p', label: 'Students who attempted an assessment', value: overview.participationPercent, max: 100, valueLabel: `${overview.studentsAttempted} students (${overview.participationPercent}%)`, tone: 'navy' }]} />
          ) : <p className="text-[12.5px] text-[var(--sp-muted)] py-6 text-center">Not enough data yet.</p>}
        </SchoolCard>
        <SchoolCard>
          <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Practice Participation</h4>
          <p className="text-[12px] text-[var(--sp-muted)] leading-relaxed py-2">
            Practice Olympiad participation isn't available at the school-wide level yet — the underlying data is per-student
            only (see a student's own Practice tab). School-wide Assessment participation above is real and complete.
          </p>
        </SchoolCard>
      </div>

      {/* Difficulty-wise Breakdown + Distribution */}
      <div className="mb-8">
        <SchoolSectionLabel>Difficulty Performance</SchoolSectionLabel>
        {difficultiesLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SchoolCard><SchoolSkeleton className="h-32" /></SchoolCard><SchoolCard><SchoolSkeleton className="h-32" /></SchoolCard></div>
        ) : difficultiesError ? (
          <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load difficulty breakdown" desc={difficultiesError} /></SchoolCard>
        ) : !difficulties?.length ? (
          <SchoolCard><SchoolEmptyState icon={Layers} title="Not enough data yet." desc="Difficulty breakdown appears once your students attempt assessments." /></SchoolCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Difficulty Distribution</h4>
              <SchoolBarList
                rows={difficulties.map(d => ({
                  key: d.difficulty, label: DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty,
                  value: d.totalQuestionsAttempted, max: Math.max(...difficulties.map(x => x.totalQuestionsAttempted), 1),
                  valueLabel: `${d.totalQuestionsAttempted} (${totalQuestions > 0 ? Math.round((d.totalQuestionsAttempted / totalQuestions) * 100) : 0}%)`,
                  tone: 'navy',
                }))}
              />
            </SchoolCard>
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3">Answer Distribution</h4>
              <SchoolStackedBarList
                rows={difficulties.map(d => ({
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
        )}
      </div>

      {/* Strong / Weak Topics */}
      <div>
        <SchoolSectionLabel>Topic Performance</SchoolSectionLabel>
        {topicsLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SchoolCard><SchoolSkeleton className="h-48" /></SchoolCard><SchoolCard><SchoolSkeleton className="h-48" /></SchoolCard></div>
        ) : topicsError ? (
          <SchoolCard><SchoolEmptyState icon={XCircle} title="Couldn't load topic performance" desc={topicsError} /></SchoolCard>
        ) : !topics || (!topics.strongest.length && !topics.weakest.length) ? (
          <SchoolCard><SchoolEmptyState icon={Compass} title="Not enough data yet." desc="Topic performance needs at least 2 answered questions per topic across your school." /></SchoolCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3 flex items-center gap-1.5"><TrendingUp size={14} className="text-[var(--sp-success)]" /> Strong Topics</h4>
              {topics.strongest.length ? (
                <SchoolBarList rows={topics.strongest.map(t => ({ key: t.topicId, label: t.topicName, value: t.accuracyPercent, max: 100, valueLabel: `${t.accuracyPercent}%`, tone: 'success' }))} />
              ) : <p className="text-[12.5px] text-[var(--sp-muted)] py-6 text-center">No strong topics identified yet.</p>}
            </SchoolCard>
            <SchoolCard>
              <h4 className="text-[12.5px] font-bold text-[var(--sp-muted)] mb-3 flex items-center gap-1.5"><TrendingDown size={14} className="text-[var(--sp-danger)]" /> Weak Topics</h4>
              {topics.weakest.length ? (
                <SchoolBarList rows={topics.weakest.map(t => ({ key: t.topicId, label: t.topicName, value: t.accuracyPercent, max: 100, valueLabel: `${t.accuracyPercent}%`, tone: 'danger' }))} />
              ) : <p className="text-[12.5px] text-[var(--sp-muted)] py-6 text-center">No weak topics identified yet.</p>}
            </SchoolCard>
          </div>
        )}
      </div>
    </div>
  );
}
