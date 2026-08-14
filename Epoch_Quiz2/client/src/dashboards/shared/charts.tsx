/**
 * Small, dependency-free chart primitives for Student Analytics — this
 * project has no charting library (checked package.json), so rather than
 * add one and fight its theming against the existing Tailwind token set
 * (text-brand, bg-surface1/2, border-line, ...), these use the same plain
 * div/SVG technique the page's existing hand-rolled meters already use
 * (see AnalyticsPage.tsx's accuracy meter / ConfidenceMeter). Every chart
 * here is purely presentational — it renders whatever data it's given and
 * invents nothing; callers own the empty-state decision.
 */

// ── Horizontal bar chart — one row per item, value against a shared max.
// Used for Subject comparison, Strong/Weak Topics, and Difficulty
// distribution — anywhere a ranked "who's bigger" comparison helps.
export interface HorizontalBarRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Defaults to this row's own value if omitted (i.e. a full bar) — pass
   *  a shared max across rows so bars are comparable to each other. */
  max?: number;
  valueLabel: string;
  colorClass: string; // Tailwind background class, e.g. 'bg-emerald-400'
}

export function HorizontalBarChart({ rows }: { rows: HorizontalBarRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const max = r.max ?? r.value ?? 1;
        const pct = max > 0 ? Math.min(100, Math.max(0, (r.value / max) * 100)) : 0;
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[12.5px] font-medium text-fg1 truncate flex items-center gap-1.5">
                <span className="text-[10px] text-fg3 font-mono shrink-0">#{i + 1}</span>
                {r.label}
                {r.sublabel && <span className="text-[11px] text-fg3 font-normal">· {r.sublabel}</span>}
              </span>
              <span className="text-[12px] font-semibold text-fg1 tabular-nums shrink-0">{r.valueLabel}</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
              <div className={`h-full rounded-full ${r.colorClass}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stacked bar chart — one row per category, split into named segments
// (e.g. Correct/Wrong/Skipped per difficulty). Segment order is preserved.
export interface StackedSegment {
  name: string;
  value: number;
  colorClass: string;
}

export interface StackedBarRow {
  key: string;
  label: string;
  segments: StackedSegment[];
  total: number;
  trailingLabel?: string;
}

export function StackedBarChart({ rows, legend }: { rows: StackedBarRow[]; legend?: StackedSegment[] }) {
  return (
    <div className="space-y-4">
      {rows.map(r => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[12.5px] font-medium text-fg1">{r.label}</span>
            {r.trailingLabel && <span className="text-[12px] text-fg3 tabular-nums shrink-0">{r.trailingLabel}</span>}
          </div>
          <div className="h-3 rounded-full bg-surface2 overflow-hidden flex">
            {r.segments.map(seg => {
              const pct = r.total > 0 ? (seg.value / r.total) * 100 : 0;
              if (pct <= 0) return null;
              return <div key={seg.name} className={seg.colorClass} style={{ width: `${pct}%` }} title={`${seg.name}: ${seg.value}`} />;
            })}
          </div>
        </div>
      ))}
      {!!legend?.length && (
        <div className="flex flex-wrap gap-3 pt-1">
          {legend.map(l => (
            <span key={l.name} className="flex items-center gap-1.5 text-[11px] text-fg3">
              <span className={`w-2.5 h-2.5 rounded-sm ${l.colorClass}`} />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Line chart — a small trend line over N chronological points.
// Percentage-based coordinates (viewBox 0-100 on both axes) make the SVG
// path responsive with no resize listeners; the dots are separate HTML
// elements (not SVG circles) positioned by percentage so they stay
// perfect circles even when the chart is stretched non-uniformly — an SVG
// circle inside a preserveAspectRatio="none" viewBox would distort into
// an ellipse instead.
export interface LineChartPoint {
  label: string;
  value: number;
}

export function LineChart({ points, height = 150 }: { points: LineChartPoint[]; height?: number }) {
  const values = points.map(p => p.value);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(0, ...values);
  const range = maxV - minV || 1;
  const n = points.length;

  const coords = points.map((p, i) => ({
    ...p,
    xPct: n > 1 ? (i / (n - 1)) * 100 : 50,
    yPct: 100 - ((p.value - minV) / range) * 100,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.xPct} ${c.yPct}`).join(' ');
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  return (
    <div>
      <div className="relative w-full text-brand" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <path d={areaD} fill="currentColor" opacity={0.08} />
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        </svg>
        {coords.map((c, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-brand ring-2 ring-surface1 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${c.xPct}%`, top: `${c.yPct}%` }}
            title={`${c.label}: ${c.value}%`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10.5px] text-fg3">
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span className="hidden sm:inline">{points[Math.floor((points.length - 1) / 2)]?.label}</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
