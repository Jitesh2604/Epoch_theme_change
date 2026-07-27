import { useId, useState } from 'react';

/**
 * Feature A1: Admin Dashboard — lightweight chart primitives.
 *
 * No charting library exists anywhere in this app yet, and pulling one in
 * for a handful of simple time-series/ranked-bar charts would add real
 * bundle weight for little gain — these are plain SVG/CSS, matching
 * dataviz guidance: single hue per non-comparative series (never a
 * rainbow), thin marks with rounded data-ends, a recessive baseline grid,
 * and a basic hover affordance (crosshair dot + native tooltip) rather than
 * a full custom tooltip layer, given the scope of this feature.
 */

export interface TimeSeriesPoint { date: string; count: number }

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Single-hue line/area chart for a daily time series — Student Growth,
 *  Practice Activity, Daily Active Students all share this one component. */
export function TimeSeriesChart({ data, colorVar = 'var(--brand)' }: { data: TimeSeriesPoint[]; colorVar?: string }) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 600, height = 140, padX = 8, padY = 12;
  const max = Math.max(1, ...data.map(d => d.count));
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const yFor = (v: number) => height - padY - (v / max) * (height - padY * 2);
  const xFor = (i: number) => padX + i * stepX;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.count)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(data.length - 1)} ${height - padY} L ${xFor(0)} ${height - padY} Z`;

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[140px]"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const idx = Math.round((relX - padX) / (stepX || 1));
          setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
        }}
      >
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="var(--border)" strokeWidth={1} />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorVar} stopOpacity={0.22} />
            <stop offset="100%" stopColor={colorVar} stopOpacity={0} />
          </linearGradient>
        </defs>
        {data.length > 0 && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        {data.length > 1 && <path d={linePath} fill="none" stroke={colorVar} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {hoverIdx !== null && (
          <>
            <line x1={xFor(hoverIdx)} y1={padY} x2={xFor(hoverIdx)} y2={height - padY} stroke="var(--border-2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xFor(hoverIdx)} cy={yFor(data[hoverIdx].count)} r={4} fill={colorVar} stroke="var(--surface1)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hovered && (
        <div className="absolute top-0 right-0 text-[11px] bg-surface1 border border-line rounded-lg px-2 py-1 shadow-elev1">
          <span className="font-semibold text-fg1">{hovered.count}</span>
          <span className="text-fg3"> · {fmtShortDate(hovered.date)}</span>
        </div>
      )}
      <div className="flex justify-between text-[10.5px] text-fg3 mt-1">
        <span>{data[0] ? fmtShortDate(data[0].date) : ''}</span>
        <span>{data[data.length - 1] ? fmtShortDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

/** Ranked horizontal bar list — single hue, position/label carry rank, not
 *  color (avoids the "rainbow chart" anti-pattern for an unbounded,
 *  dynamic category list like subjects). */
export function RankedBarList({ items, colorVar = 'var(--brand)' }: { items: { label: string; count: number }[]; colorVar?: string }) {
  const max = Math.max(1, ...items.map(i => i.count));
  return (
    <div className="space-y-2.5">
      {items.map(item => (
        <div key={item.label} title={`${item.label}: ${item.count}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12.5px] font-semibold text-fg1 truncate">{item.label}</span>
            <span className="text-[12px] text-fg3 tabular-nums shrink-0 ml-2">{item.count}</span>
          </div>
          <div className="h-2 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: colorVar }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Accuracy-quality banded bars — reuses the same emerald/sky/amber/rose
 *  "good → poor" convention already used across the student analytics
 *  performance bands (client/src/lib/performanceBand.ts), not a new palette. */
const ACCURACY_BAND_COLOR: Record<string, string> = {
  '90-100%': '#34d399',
  '80-89%': '#38bdf8',
  '70-79%': '#fbbf24',
  'Below 70%': '#fb7185',
};

export function AccuracyDistributionBars({ bands }: { bands: { band: string; count: number; percentage: number }[] }) {
  return (
    <div className="space-y-2.5">
      {bands.map(b => (
        <div key={b.band} className="flex items-center gap-3" title={`${b.band}: ${b.count} attempts (${b.percentage}%)`}>
          <span className="text-[12px] font-semibold text-fg1 w-20 shrink-0">{b.band}</span>
          <div className="flex-1 h-2.5 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, b.percentage)}%`, background: ACCURACY_BAND_COLOR[b.band] ?? 'var(--brand)' }} />
          </div>
          <span className="text-[12px] text-fg3 tabular-nums w-24 text-right shrink-0">{b.count} · {b.percentage}%</span>
        </div>
      ))}
    </div>
  );
}
