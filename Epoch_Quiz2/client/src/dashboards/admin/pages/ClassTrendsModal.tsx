import { useEffect, useState } from 'react';
import { Modal, Button, Skeleton } from '../../shared/ui';
import { TimeSeriesChart } from '../components/DashboardCharts';
import { assessmentAnalyticsApi, type AssessmentTrends } from '../../../hooks/useAssessmentAnalytics';

/**
 * Admin Analytics — Feature 8: per-class Assessment trends detail.
 *
 * Lazily fetches on open (one class at a time), same Modal + TimeSeriesChart
 * + weekly/monthly/yearly toggle pattern as Feature 5's own trends view —
 * reuses getAssessmentTrends(granularity, { classExternalId }) unmodified,
 * just scoped to one class instead of the whole platform. Practice-side
 * trend has no equivalent bucketed endpoint (see classAnalyticsAggregation.
 * ts's header) — this modal is Assessment-only, and the table already shows
 * the free two-point practice trend next to it.
 */

interface Props {
  classId: string | null;
  className: string;
  onClose: () => void;
}

export function ClassTrendsModal({ classId, className, onClose }: Props) {
  const [granularity, setGranularity] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [trends, setTrends] = useState<AssessmentTrends | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) { setTrends(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    assessmentAnalyticsApi.getTrends(granularity, { classExternalId: classId })
      .then(data => { if (!cancelled) setTrends(data); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load trends'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [classId, granularity]);

  return (
    <Modal open={!!classId} onClose={onClose} title={classId ? `Assessment Trends — ${className}` : 'Assessment Trends'} size="lg">
      {classId && (
        <div>
          <div className="flex items-center justify-end mb-4">
            <div className="flex gap-1.5">
              <Button size="sm" variant={granularity === 'weekly' ? 'soft' : 'ghost'} onClick={() => setGranularity('weekly')}>Weekly</Button>
              <Button size="sm" variant={granularity === 'monthly' ? 'soft' : 'ghost'} onClick={() => setGranularity('monthly')}>Monthly</Button>
              <Button size="sm" variant={granularity === 'yearly' ? 'soft' : 'ghost'} onClick={() => setGranularity('yearly')}>Yearly</Button>
            </div>
          </div>

          {error && <p className="text-danger text-[13px] mb-3">{error}</p>}

          {loading || !trends ? (
            <Skeleton className="h-36 rounded-xl" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Attempts over time</p>
                <TimeSeriesChart data={trends.attemptsOverTime} colorVar="var(--brand)" />
              </div>
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Average score over time</p>
                <TimeSeriesChart data={trends.averageScoreOverTime} />
              </div>
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Participation over time</p>
                <TimeSeriesChart data={trends.participationOverTime} colorVar="var(--brand)" />
              </div>
              <div>
                <p className="text-[11px] text-fg3 mb-1.5">Pass rate over time</p>
                <TimeSeriesChart data={trends.passRateOverTime} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
