import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Sparkles, Search as SearchIcon, Clock, FileText, ArrowRight } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, useToasts } from '../../shared/ui';
import { useAssessments } from '../../../hooks/useAssessments';
import { submissionApi } from '../../../hooks/useSubmissions';

export function JoinAssessmentPage() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const { push, node } = useToasts();
  const navigate = useNavigate();

  const { data: liveData, loading, error: liveError } = useAssessments({ status: 'PUBLISHED', limit: 4 });
  const live = liveData?.items ?? [];

  const setDigit = (idx: number, v: string) => {
    if (!/^[a-z0-9]?$/i.test(v)) return;
    const next = [...code];
    next[idx] = v.toUpperCase();
    setCode(next);
    if (v && idx < 5) document.getElementById(`code-${idx + 1}`)?.focus();
  };

  const handleStartAssessment = async (assessmentId: string) => {
    try {
      const attempt = await submissionApi.start(assessmentId) as any;
      const submissionId = attempt?.submission?.id;
      if (submissionId) navigate(`/student/take/${submissionId}`);
      else push({ kind: 'success', title: 'Started', sub: 'Find it in My Assessments.' });
    } catch (e: any) {
      push({ kind: 'danger', title: 'Cannot start', sub: e.message });
    }
  };

  const tryJoin = () => {
    const value = code.join('');
    if (value.length < 6) {
      push({ kind: 'danger', title: 'Code incomplete', sub: 'Please enter all 6 characters.' });
      return;
    }
    push({ kind: 'info', title: 'Looking up code…', sub: `Code: ${value}` });
  };

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Student · Join"
        title="Join an Assessment"
        subtitle="Enter the 6-character code your teacher shared, or pick from a live assessment below."
      />

      {liveError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Could not load live assessments — {liveError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
        <Card className="p-7 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-brand/15 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand grid place-items-center mb-4">
              <KeyRound size={22} />
            </div>
            <h3 className="font-display font-semibold text-[20px] text-fg1 mb-1">Enter assessment code</h3>
            <p className="text-[12.5px] text-fg3 mb-5">Your teacher will share this 6-character code with you.</p>
            <div className="flex gap-2 mb-4 justify-center">
              {code.map((d, i) => (
                <input
                  key={i}
                  id={`code-${i}`}
                  value={d}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && !d && i > 0) document.getElementById(`code-${i - 1}`)?.focus();
                  }}
                  maxLength={1}
                  className="w-11 h-12 md:w-12 md:h-14 text-center text-[20px] font-mono font-semibold uppercase rounded-xl bg-surface1 border-2 border-line text-fg1 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              ))}
            </div>
            <Button className="w-full" icon={ArrowRight} onClick={tryJoin}>Join assessment</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-brand" />
              <h3 className="font-display font-semibold text-[15px] text-fg1">Live assessments for you</h3>
            </div>
            <p className="text-[12px] text-fg3 mb-4">Published assessments you can start right now.</p>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : live.length === 0 ? (
              <div className="text-center py-6 text-fg3 text-[13px]">No live assessments right now</div>
            ) : (
              <div className="space-y-2.5">
                {live.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-brand/30 hover:bg-brand-soft/20 transition group">
                    <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center"><FileText size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-fg1 truncate">{a.title}</div>
                      <div className="text-[11px] text-fg3 mt-0.5 flex items-center gap-2">
                        <Clock size={10} />{a.duration} min · {a.questionCount} questions
                        {a.subject && ` · ${a.subject.name}`}
                      </div>
                    </div>
                    <Badge tone="success">Live</Badge>
                    <Button size="sm" variant="soft" onClick={() => handleStartAssessment(a.id)}>Open</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <SearchIcon size={16} className="text-fg2" />
              <h3 className="font-display font-semibold text-[15px] text-fg1">Browse public quizzes</h3>
            </div>
            <p className="text-[12px] text-fg3 mb-4">Explore self-paced practice quizzes across subjects.</p>
            <Button variant="outline" className="w-full" onClick={() => window.location.hash = '#/play'}>Open public catalog →</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
