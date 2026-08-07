import { useEffect, useState } from 'react';
import { Modal, Button, Skeleton } from '../../shared/ui';
import { TimeSeriesChart } from '../components/DashboardCharts';
import { questionAnalyticsApi, type QuestionOverviewRow, type QuestionTrends } from '../../../hooks/useQuestionAnalytics';

/**
 * Admin Analytics — Feature 4: per-question trends detail.
 *
 * Lazily fetches on open (one question at a time), same Modal +
 * TimeSeriesChart + weekly/monthly toggle pattern as Feature 3's expanded
 * subject trends — reused components, no new chart primitive.
 */

interface Props {
  question: QuestionOverviewRow | null;
  onClose: () => void;
}

export function QuestionTrendsModal({ question, onClose }: Props) {
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly');
  const [trends, setTrends] = useState<QuestionTrends | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!question) { setTrends(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    questionAnalyticsApi.getTrends(question.questionId, granularity, {})
      .then(data => { if (!cancelled) setTrends(data); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load trends'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [question, granularity]);

  return (
    <Modal open={!!question} onClose={onClose} title={question ? `Trends — ${question.promptPreview}` : 'Trends'} size="lg">
      {question && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11.5px] text-fg3">{question.subjectName} · {question.chapterName ?? 'No chapter'} · {question.difficulty}</p>
            <div className="flex gap-1.5">
              <Button size="sm" variant={granularity === 'weekly' ? 'soft' : 'ghost'} onClick={() => setGranularity('weekly')}>Weekly</Button>
              <Button size="sm" variant={granularity === 'monthly' ? 'soft' : 'ghost'} onClick={() => setGranularity('monthly')}>Monthly</Button>
            </div>
          </div>

          {error && <p className="text-danger text-[13px] mb-3">{error}</p>}

          {loading || !trends ? (
            <Skeleton className="h-36 rounded-xl" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Attempts over time</p>
                <TimeSeriesChart data={trends.attemptsOverTime} colorVar="var(--brand)" />
              </div>
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Success rate over time</p>
                <TimeSeriesChart data={trends.successRateOverTime} />
              </div>
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Skip rate over time</p>
                <TimeSeriesChart data={trends.skipRateOverTime} colorVar="var(--brand)" />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
