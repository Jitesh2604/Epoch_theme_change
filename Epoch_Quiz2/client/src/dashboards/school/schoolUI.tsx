import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';

/**
 * School Panel's OWN component library — deliberately independent of
 * dashboards/shared/ui.tsx and dashboards/shared/charts.tsx. Every color
 * here comes from a CSS-variable theme scoped to `.school-theme` (injected
 * by <SchoolThemeStyles/>, mounted once by SchoolPanelShell) — never the
 * app's global --surface-1/--fg-1/--brand tokens, and never Tailwind config
 * changes, so this is 100% isolated to School Panel: Admin/Student are
 * untouched, and nothing here can leak into them. Typography also
 * deliberately breaks from the rest of the app: every other dashboard uses
 * the serif `font-display` (Lora) for headings — School Panel uses bold
 * Inter (`font-body`) throughout instead, on purpose, so it reads as a
 * distinct "management software" product rather than another editorial-
 * styled screen.
 */

// ── Theme — scoped CSS variables, injected once by SchoolPanelShell ───────
export function SchoolThemeStyles() {
  return (
    <style>{`
      .school-theme {
        --sp-bg: #EEF3FB;
        --sp-surface: #FFFFFF;
        --sp-surface-alt: #F5F8FD;
        --sp-navy-950: #071228;
        --sp-navy-900: #0B1F3F;
        --sp-navy-800: #102B57;
        --sp-navy: #1E3A8A;
        --sp-navy-600: #2C4E9B;
        --sp-navy-100: #E4EBFA;
        --sp-teal: #0D9488;
        --sp-teal-600: #0B7F74;
        --sp-teal-100: #CCFBF1;
        --sp-text: #0B1B34;
        --sp-muted: #5B6B85;
        --sp-muted-2: #94A3B8;
        --sp-border: #DCE6F5;
        --sp-border-strong: #C3D5F0;
        --sp-success: #16A34A;
        --sp-success-bg: #E8F8ED;
        --sp-warning: #D97706;
        --sp-warning-bg: #FEF6E7;
        --sp-danger: #DC2626;
        --sp-danger-bg: #FDECEC;
        --sp-shadow-sm: 0 1px 2px rgba(11,27,52,0.05);
        --sp-shadow: 0 1px 2px rgba(11,27,52,0.04), 0 10px 28px -10px rgba(11,27,52,0.14);
      }
    `}</style>
  );
}

// ── Card ────────────────────────────────────────────────────────────────
export function SchoolCard({ children, className = '', noPad = false, as: As = 'div' as any, ...rest }: any) {
  return (
    <As
      className={`rounded-[14px] bg-[var(--sp-surface)] border border-[var(--sp-border)] [box-shadow:var(--sp-shadow-sm)] ${noPad ? '' : 'p-5'} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

// ── Section heading — small uppercase label + large bold Inter title ──────
export function SchoolPageHeading({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--sp-teal)] mb-1.5">{eyebrow}</div>}
        <h1 className="font-body font-extrabold text-[24px] md:text-[27px] tracking-tight text-[var(--sp-text)] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-[var(--sp-muted)] mt-1.5 max-w-xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function SchoolSectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="font-body font-bold text-[11px] uppercase tracking-[0.12em] text-[var(--sp-navy)] mb-3.5">{children}</h3>;
}

// ── Button ──────────────────────────────────────────────────────────────
type SPBtnVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
type SPBtnSize = 'sm' | 'md' | 'lg';

export function SchoolButton({
  children, onClick, type = 'button', variant = 'primary', size = 'md', className = '', icon: Icon, disabled, title,
}: {
  children?: ReactNode; onClick?: (e: any) => void; type?: 'button' | 'submit'; variant?: SPBtnVariant; size?: SPBtnSize;
  className?: string; icon?: any; disabled?: boolean; title?: string;
}) {
  const sizes: Record<SPBtnSize, string> = {
    sm: 'h-8 px-3 text-[12px] rounded-md',
    md: 'h-10 px-4 text-[13px] rounded-lg',
    lg: 'h-11 px-5 text-[14px] rounded-lg',
  };
  const variants: Record<SPBtnVariant, string> = {
    primary:   'bg-[var(--sp-navy)] text-white hover:bg-[var(--sp-navy-800)] [box-shadow:var(--sp-shadow-sm)]',
    secondary: 'bg-white text-[var(--sp-navy)] border border-[var(--sp-navy-100)] hover:bg-[var(--sp-navy-100)]',
    accent:    'bg-[var(--sp-teal)] text-white hover:bg-[var(--sp-teal-600)] [box-shadow:var(--sp-shadow-sm)]',
    danger:    'bg-[var(--sp-danger-bg)] text-[var(--sp-danger)] border border-[var(--sp-danger)]/25 hover:bg-[var(--sp-danger)]/10',
    ghost:     'bg-transparent text-[var(--sp-navy)] hover:bg-[var(--sp-navy-100)]',
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center justify-center gap-2 font-bold font-body transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

// ── Pill (badge / status) ──────────────────────────────────────────────
type SPPillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'navy';
export function SchoolPill({ children, tone = 'neutral', dot = true, className = '' }: { children: ReactNode; tone?: SPPillTone; dot?: boolean; className?: string }) {
  const tones: Record<SPPillTone, string> = {
    success: 'bg-[var(--sp-success-bg)] text-[var(--sp-success)]',
    warning: 'bg-[var(--sp-warning-bg)] text-[var(--sp-warning)]',
    danger:  'bg-[var(--sp-danger-bg)] text-[var(--sp-danger)]',
    info:    'bg-[var(--sp-teal-100)] text-[var(--sp-teal-600)]',
    neutral: 'bg-[var(--sp-surface-alt)] text-[var(--sp-muted)] border border-[var(--sp-border)]',
    navy:    'bg-[var(--sp-navy-100)] text-[var(--sp-navy)]',
  };
  const dots: Record<SPPillTone, string> = {
    success: 'bg-[var(--sp-success)]', warning: 'bg-[var(--sp-warning)]', danger: 'bg-[var(--sp-danger)]',
    info: 'bg-[var(--sp-teal)]', neutral: 'bg-[var(--sp-muted-2)]', navy: 'bg-[var(--sp-navy)]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${tones[tone]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  );
}

// ── KPI card — distinct icon color per metric, big number, trend, blurb ──
export function SchoolKpiCard({
  icon: Icon, iconTone = 'navy', value, label, description, trend,
}: {
  icon: any; iconTone?: 'navy' | 'teal' | 'success' | 'warning'; value: string | number; label: string; description?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
}) {
  const iconBg: Record<string, string> = {
    navy: 'bg-[var(--sp-navy-100)] text-[var(--sp-navy)]',
    teal: 'bg-[var(--sp-teal-100)] text-[var(--sp-teal-600)]',
    success: 'bg-[var(--sp-success-bg)] text-[var(--sp-success)]',
    warning: 'bg-[var(--sp-warning-bg)] text-[var(--sp-warning)]',
  };
  const trendColor = trend?.direction === 'up' ? 'text-[var(--sp-success)]' : trend?.direction === 'down' ? 'text-[var(--sp-danger)]' : 'text-[var(--sp-muted)]';
  const trendArrow = trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '→';
  return (
    <SchoolCard className="relative overflow-hidden">
      <div className={`w-11 h-11 rounded-xl grid place-items-center mb-4 ${iconBg[iconTone]}`}>
        <Icon size={19} />
      </div>
      <div className="font-body font-extrabold text-[30px] leading-none text-[var(--sp-text)] tracking-tight">{value}</div>
      <div className="text-[12.5px] font-semibold text-[var(--sp-muted)] mt-1.5">{label}</div>
      {(trend || description) && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--sp-border)]">
          {trend && <span className={`text-[11.5px] font-bold ${trendColor}`}>{trendArrow} {trend.label}</span>}
          {description && !trend && <span className="text-[11px] text-[var(--sp-muted-2)]">{description}</span>}
        </div>
      )}
    </SchoolCard>
  );
}

// ── Progress ring — circular %, used for Participation ─────────────────
export function SchoolProgressRing({ value, size = 132, label }: { value: number; size?: number; label?: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--sp-border)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke="var(--sp-teal)" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeLinecap="round"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center flex-col text-center">
        <div className="font-body font-extrabold text-[26px] text-[var(--sp-text)] leading-none">{pct}%</div>
        {label && <div className="text-[10.5px] text-[var(--sp-muted)] font-semibold mt-1">{label}</div>}
      </div>
    </div>
  );
}

// ── Bar list — "Mathematics ████░░ 88%" style comparison rows ──────────
export interface SchoolBarRow { key: string; label: string; sublabel?: string; value: number; max?: number; valueLabel: string; tone?: 'navy' | 'teal' | 'success' | 'warning' | 'danger' }
export function SchoolBarList({ rows }: { rows: SchoolBarRow[] }) {
  const toneColor: Record<string, string> = {
    navy: 'bg-[var(--sp-navy)]', teal: 'bg-[var(--sp-teal)]', success: 'bg-[var(--sp-success)]', warning: 'bg-[var(--sp-warning)]', danger: 'bg-[var(--sp-danger)]',
  };
  return (
    <div className="space-y-4">
      {rows.map(r => {
        const max = r.max ?? r.value ?? 1;
        const pct = max > 0 ? Math.min(100, Math.max(0, (r.value / max) * 100)) : 0;
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[13px] font-bold text-[var(--sp-text)] truncate">{r.label}{r.sublabel && <span className="text-[11px] font-medium text-[var(--sp-muted)] ml-1.5">· {r.sublabel}</span>}</span>
              <span className="text-[12.5px] font-bold text-[var(--sp-navy)] tabular-nums shrink-0">{r.valueLabel}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--sp-bg)] border border-[var(--sp-border)] overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${toneColor[r.tone ?? 'navy']}`}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stacked bar list — Correct/Wrong/Skipped segments per row ───────────
export interface SchoolStackedSegment { name: string; value: number; colorClass: string }
export interface SchoolStackedRow { key: string; label: string; segments: SchoolStackedSegment[]; total: number; trailingLabel?: string }
export function SchoolStackedBarList({ rows, legend }: { rows: SchoolStackedRow[]; legend?: SchoolStackedSegment[] }) {
  return (
    <div className="space-y-4">
      {rows.map(r => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[13px] font-bold text-[var(--sp-text)]">{r.label}</span>
            {r.trailingLabel && <span className="text-[12px] font-bold text-[var(--sp-navy)] tabular-nums shrink-0">{r.trailingLabel}</span>}
          </div>
          <div className="h-3 rounded-full bg-[var(--sp-bg)] border border-[var(--sp-border)] overflow-hidden flex">
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
            <span key={l.name} className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--sp-muted)]">
              <span className={`w-2.5 h-2.5 rounded-sm ${l.colorClass}`} />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Branch/trend performance row — bar + trend arrow, matches the ASCII
// mock in the spec ("Main Campus  87%  ↑4.2%" + a thick bar underneath). ──
export function SchoolTrendBarRow({ label, sublabel, value, trend, onClick }: { label: string; sublabel?: string; value: number; trend?: number; onClick?: () => void }) {
  const trendUp = (trend ?? 0) >= 0;
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`w-full text-left py-3.5 ${onClick ? 'hover:bg-[var(--sp-surface-alt)] transition rounded-lg px-2 -mx-2' : ''}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[13.5px] font-bold text-[var(--sp-text)]">{label}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[13.5px] font-extrabold text-[var(--sp-navy)] tabular-nums">{value}%</span>
          {trend !== undefined && (
            <span className={`text-[11px] font-bold ${trendUp ? 'text-[var(--sp-success)]' : 'text-[var(--sp-danger)]'}`}>
              {trendUp ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
        </span>
      </div>
      {sublabel && <div className="text-[11px] text-[var(--sp-muted)] mb-1.5">{sublabel}</div>}
      <div className="h-2 rounded-full bg-[var(--sp-bg)] border border-[var(--sp-border)] overflow-hidden">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-[var(--sp-navy)] to-[var(--sp-teal)]" initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
    </Comp>
  );
}

// ── Line chart — school-themed trend line ───────────────────────────────
export function SchoolLineChart({ points, height = 180 }: { points: { label: string; value: number }[]; height?: number }) {
  const values = points.map(p => p.value);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(0, ...values);
  const range = maxV - minV || 1;
  const n = points.length;
  const coords = points.map((p, i) => ({ ...p, xPct: n > 1 ? (i / (n - 1)) * 100 : 50, yPct: 100 - ((p.value - minV) / range) * 100 }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.xPct} ${c.yPct}`).join(' ');
  const areaD = `${pathD} L 100 100 L 0 100 Z`;
  return (
    <div>
      <div className="relative w-full" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id="sp-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sp-teal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--sp-teal)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#sp-area)" />
          <motion.path
            d={pathD} fill="none" stroke="var(--sp-navy)" strokeWidth={1.4} vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </svg>
        {coords.map((c, i) => (
          <div
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full bg-[var(--sp-teal)] ring-2 ring-white -translate-x-1/2 -translate-y-1/2 [box-shadow:var(--sp-shadow-sm)]"
            style={{ left: `${c.xPct}%`, top: `${c.yPct}%` }}
            title={`${c.label}: ${c.value}%`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2.5 text-[10.5px] font-semibold text-[var(--sp-muted)]">
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span className="hidden sm:inline">{points[Math.floor((points.length - 1) / 2)]?.label}</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────
export function SchoolEmptyState({ icon: Icon, title, desc, action }: { icon: any; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-[var(--sp-navy-100)] grid place-items-center text-[var(--sp-navy)] mb-4">
        <Icon size={28} />
      </div>
      <h3 className="font-body font-extrabold text-[16px] text-[var(--sp-text)] mb-1.5">{title}</h3>
      <p className="text-[13px] text-[var(--sp-muted)] max-w-sm leading-relaxed">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────
export function SchoolSkeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-gradient-to-r from-[var(--sp-surface-alt)] via-[var(--sp-navy-100)] to-[var(--sp-surface-alt)] bg-[length:200%_100%] animate-pulse-soft ${className}`} />;
}

// ── Inputs ──────────────────────────────────────────────────────────────
const spInputBase = 'bg-[var(--sp-surface)] border border-[var(--sp-border-strong)] text-[var(--sp-text)] placeholder:text-[var(--sp-muted-2)] focus:outline-none focus:border-[var(--sp-teal)] focus:ring-2 focus:ring-[var(--sp-teal)]/15 transition font-body';

export function SchoolSearchInput({ value, onChange, placeholder, onKeyDown }: { value: string; onChange: (v: string) => void; placeholder?: string; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
      placeholder={placeholder ?? 'Search…'}
      className={`h-10 px-3.5 w-full md:w-72 rounded-lg text-[13px] ${spInputBase}`}
    />
  );
}

export function SchoolSelect({ value, onChange, options, className = '' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`h-10 px-3 rounded-lg text-[13px] ${spInputBase} ${className}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function SchoolInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`h-10 px-3.5 rounded-lg text-[13px] w-full ${spInputBase} ${className}`} />;
}

export function SchoolTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`px-3.5 py-2.5 rounded-lg text-[13px] w-full ${spInputBase} ${className}`} />;
}

export function SchoolLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return <label className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-[var(--sp-muted)] block mb-1.5">{children}{required && <span className="text-[var(--sp-danger)] ml-0.5">*</span>}</label>;
}

export function SchoolFieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <div className="text-[11.5px] font-semibold text-[var(--sp-danger)] mt-1">{children}</div>;
}

// ── Segmented control — [ SCHOOL ] [ STATE ] [ GLOBAL ] ─────────────────
export function SchoolSegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex p-1 rounded-lg bg-[var(--sp-navy-100)] gap-0.5">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative px-4 h-8 rounded-md text-[12px] font-bold transition-colors ${value === o.value ? 'text-white' : 'text-[var(--sp-navy)] hover:bg-white/50'}`}
        >
          {value === o.value && (
            <motion.span layoutId="sp-segmented" className="absolute inset-0 rounded-md bg-[var(--sp-navy)]" transition={{ duration: 0.2 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────
export function SchoolTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: any }[] }) {
  return (
    <div className="flex flex-wrap gap-1 mb-6 border-b border-[var(--sp-border)] overflow-x-auto">
      {items.map(t => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center gap-1.5 px-4 h-10 text-[12.5px] font-bold whitespace-nowrap transition-colors ${active ? 'text-[var(--sp-navy)]' : 'text-[var(--sp-muted)] hover:text-[var(--sp-text)]'}`}
          >
            {Icon && <Icon size={14} />} {t.label}
            {active && <motion.span layoutId="sp-tabs" className="absolute left-2 right-2 -bottom-px h-[2.5px] rounded-full bg-[var(--sp-teal)]" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────
export interface SchoolTableColumn { key: string; label: string; className?: string; render?: (row: any) => ReactNode }
export function SchoolTable({ columns, rows, empty, sticky = false }: { columns: SchoolTableColumn[]; rows: any[]; empty?: ReactNode; sticky?: boolean }) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className={`text-[var(--sp-navy)] text-[10.5px] font-bold uppercase tracking-[0.07em] bg-[var(--sp-surface-alt)] ${sticky ? 'sticky top-0 z-10' : ''}`}>
            {columns.map(c => <th key={c.key} className={`px-4 py-3 border-b border-[var(--sp-border)] font-body ${c.className ?? ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-[var(--sp-surface-alt)] transition-colors group">
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3.5 border-b border-[var(--sp-border)]/70 text-[var(--sp-text)] align-middle font-body ${c.className ?? ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SchoolPagination({ page, totalPages, onChange, disabled = false }: { page: number; totalPages: number; onChange: (page: number) => void; disabled?: boolean }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--sp-border)]">
      <span className="text-[12px] font-semibold text-[var(--sp-muted)]">Page {page} of {totalPages}</span>
      <div className="flex items-center gap-2">
        <SchoolButton variant="secondary" size="sm" icon={ChevronLeft} onClick={() => onChange(page - 1)} disabled={disabled || page <= 1}>Prev</SchoolButton>
        <SchoolButton variant="secondary" size="sm" icon={ChevronRight} onClick={() => onChange(page + 1)} disabled={disabled || page >= totalPages}>Next</SchoolButton>
      </div>
    </div>
  );
}

// ── Compact row-action menu — replaces a row of icon buttons ────────────
export function SchoolActionMenu({ items }: { items: { label: string; icon?: any; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div ref={ref} className="relative inline-block text-left">
      <button onClick={() => setOpen(o => !o)} className="w-8 h-8 grid place-items-center rounded-lg text-[var(--sp-muted)] hover:text-[var(--sp-navy)] hover:bg-[var(--sp-navy-100)] transition">
        <MoreVertical size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-9 w-44 bg-[var(--sp-surface)] border border-[var(--sp-border)] rounded-xl [box-shadow:var(--sp-shadow)] z-50 p-1.5"
          >
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => { it.onClick(); setOpen(false); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold transition ${it.danger ? 'text-[var(--sp-danger)] hover:bg-[var(--sp-danger-bg)]' : 'text-[var(--sp-text)] hover:bg-[var(--sp-surface-alt)]'}`}
              >
                {it.icon && <it.icon size={14} />} {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────
export function SchoolModal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const widths: Record<string, string> = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[var(--sp-navy-950)]/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto w-full ${widths[size]} max-h-[90vh] flex flex-col bg-[var(--sp-surface)] border border-[var(--sp-border)] rounded-2xl [box-shadow:var(--sp-shadow)] overflow-hidden`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sp-border)] bg-[var(--sp-surface-alt)] shrink-0">
                <h3 className="font-body font-extrabold text-[16px] text-[var(--sp-text)]">{title}</h3>
                <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-[var(--sp-muted)] hover:text-[var(--sp-text)] hover:bg-white transition">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto bg-[var(--sp-surface)] min-h-0">{children}</div>
              {footer && <div className="px-5 py-3.5 border-t border-[var(--sp-border)] flex justify-end gap-2 bg-[var(--sp-surface-alt)] shrink-0">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────
export function SchoolToast({ kind = 'success', title, sub, onClose }: { kind?: 'success' | 'danger' | 'info'; title: string; sub?: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  const dot: Record<string, string> = { success: 'bg-[var(--sp-success)]', danger: 'bg-[var(--sp-danger)]', info: 'bg-[var(--sp-teal)]' };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="bg-[var(--sp-surface)] border border-[var(--sp-border)] rounded-xl px-4 py-3 [box-shadow:var(--sp-shadow)] min-w-[260px] max-w-sm pointer-events-auto"
    >
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot[kind]}`} />
        <div className="flex-1">
          <div className="text-[13px] font-bold text-[var(--sp-text)]">{title}</div>
          {sub && <div className="text-[11.5px] text-[var(--sp-muted)] mt-0.5">{sub}</div>}
        </div>
        <button onClick={onClose} className="text-[var(--sp-muted)] hover:text-[var(--sp-text)] transition ml-1"><X size={14} /></button>
      </div>
    </motion.div>
  );
}

type SPToastItem = { id: number; kind?: 'success' | 'danger' | 'info'; title: string; sub?: string };
export function useSchoolToasts() {
  const [items, setItems] = useState<SPToastItem[]>([]);
  const push = useCallback((t: Omit<SPToastItem, 'id'>) => setItems(s => [...s, { id: Date.now() + Math.random(), ...t }]), []);
  const remove = useCallback((id: number) => setItems(s => s.filter(t => t.id !== id)), []);
  const node = (
    <div className="fixed top-20 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>{items.map(t => <SchoolToast key={t.id} kind={t.kind} title={t.title} sub={t.sub} onClose={() => remove(t.id)} />)}</AnimatePresence>
    </div>
  );
  return { push, node };
}

// ── Avatar — navy/teal gradient instead of the app's caramel hues ───────
export function SchoolAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className="rounded-lg grid place-items-center font-body font-extrabold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(135deg, var(--sp-navy), var(--sp-teal))' }}
    >
      {name.split(' ').map(p => p[0]).slice(0, 2).join('')}
    </span>
  );
}
