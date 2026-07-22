import { ReactNode, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export function Card({ children, className = '', as: As = 'div' as any, ...rest }: any) {
  return (
    <As
      className={`rounded-2xl bg-surface1 border border-line shadow-elev1 ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

export function PageHeader({
  eyebrow, title, subtitle, actions,
}: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
      <div>
        {eyebrow && (
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.11em] uppercase text-fg3 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-warm" />{eyebrow}
          </div>
        )}
        <h1 className="font-display font-semibold text-2xl md:text-[27px] tracking-tight text-fg1 leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-fg3 mt-1.5 max-w-xl font-body leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'outline';
type BtnSize = 'sm' | 'md' | 'lg';

export function Button({
  children, onClick, type = 'button', variant = 'primary', size = 'md', className = '', icon: Icon, disabled, title,
}: {
  children?: ReactNode; onClick?: (e: any) => void; type?: 'button' | 'submit'; variant?: BtnVariant; size?: BtnSize;
  className?: string; icon?: any; disabled?: boolean; title?: string;
}) {
  const sizes: Record<BtnSize, string> = {
    sm: 'h-8 px-3 text-[12px] rounded-lg',
    md: 'h-10 px-4 text-[13px] rounded-xl',
    lg: 'h-11 px-5 text-[14px] rounded-xl',
  };
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-brand text-brand-ink hover:bg-[#2A3319] dark:hover:bg-[#7A9A52] shadow-elev1',
    ghost:   'bg-transparent text-fg2 hover:bg-[rgba(53,64,36,0.06)] hover:text-fg1',
    soft:    'bg-brand-soft text-brand border border-[rgba(53,64,36,0.18)] hover:bg-[rgba(53,64,36,0.12)]',
    danger:  'bg-[rgba(185,28,28,0.06)] text-[#B91C1C] border border-[rgba(185,28,28,0.20)] hover:bg-[rgba(185,28,28,0.10)] dark:bg-[rgba(239,83,80,0.12)] dark:text-[#EF5350] dark:border-[rgba(239,83,80,0.25)]',
    outline: 'bg-transparent text-fg1 border border-line2 hover:bg-[rgba(53,64,36,0.04)] hover:border-[rgba(53,64,36,0.22)]',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 font-semibold font-body transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

export function Badge({
  children, tone = 'neutral', dot = true, className = '',
}: { children: ReactNode; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'; dot?: boolean; className?: string }) {
  const tones: Record<string, string> = {
    brand:   'bg-brand-soft text-brand border-[rgba(53,64,36,0.20)]',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25',
    danger:  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/25',
    info:    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/25',
    neutral: 'bg-surface2 text-fg3 border-line',
  };
  const dotColors: Record<string, string> = {
    brand:   'bg-brand',
    success: 'bg-emerald-500 dark:bg-emerald-400',
    warning: 'bg-amber-500 dark:bg-amber-400',
    danger:  'bg-rose-600 dark:bg-rose-400',
    info:    'bg-sky-600 dark:bg-sky-400',
    neutral: 'bg-fg4',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tones[tone]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[tone]}`} />}
      {children}
    </span>
  );
}

export function StatCard({
  label, value, change, icon: Icon, tone = 'brand', trend,
}: { label: string; value: string | number; change?: string; icon: any; tone?: 'brand' | 'violet' | 'emerald' | 'amber'; trend?: number[] }) {
  const iconBg: Record<string, string> = {
    brand:   'bg-[#EBF0E0] text-[#354024] dark:bg-[rgba(106,138,68,0.20)] dark:text-[#96A46A]',
    violet:  'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  };
  const blurBg: Record<string, string> = {
    brand:   'bg-[#D2DCB8]/60 dark:bg-[rgba(106,138,68,0.25)]',
    violet:  'bg-slate-200/50 dark:bg-slate-500/20',
    emerald: 'bg-emerald-100/50 dark:bg-emerald-500/20',
    amber:   'bg-amber-100/50 dark:bg-amber-500/20',
  };
  const changeTone: Record<string, string> = {
    brand:   'text-[#4A5A32] dark:text-[#96A46A]',
    violet:  'text-slate-600 dark:text-slate-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber:   'text-amber-700 dark:text-amber-300',
  };
  const max = trend ? Math.max(...trend, 1) : 1;
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full ${blurBg[tone]} blur-2xl`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl grid place-items-center border border-line ${iconBg[tone]}`}>
            <Icon size={18} />
          </div>
          {change && <span className={`text-[11px] font-semibold ${changeTone[tone]}`}>{change}</span>}
        </div>
        <div className="font-display text-[25px] font-semibold text-fg1 tracking-tight">{value}</div>
        <div className="text-[12px] text-fg3 mt-0.5 font-body">{label}</div>
        {trend && (
          <div className="flex items-end gap-1 mt-3 h-7">
            {trend.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all"
                style={{
                  height: `${(v / max) * 100}%`,
                  background: i === trend.length - 1 ? 'var(--brand)' : 'var(--border-2)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }: { icon: any; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-[#EBF0E0] border border-line grid place-items-center text-[#354024] mb-4 dark:bg-surface1 dark:text-fg3">
        <Icon size={28} />
      </div>
      <h3 className="font-display font-semibold text-lg text-fg1 mb-1.5">{title}</h3>
      <p className="text-[13px] text-fg3 max-w-sm font-body leading-relaxed">{desc}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-gradient-to-r from-surface2 via-surface1 to-surface2 bg-[length:200%_100%] animate-pulse-soft ${className}`} />;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? 'Search…'}
      className="h-10 px-3.5 w-full md:w-72 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 placeholder:text-fg4 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-[rgba(53,64,36,0.10)] font-body transition"
    />
  );
}

export function Select({
  value, onChange, options, className = '',
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 font-body ${className}`}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const widths: Record<string, string> = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[rgba(44,30,8,0.35)] backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto w-full ${widths[size]} max-h-[90vh] flex flex-col bg-surface1 border border-line2 rounded-2xl shadow-elev2 overflow-hidden`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface1 shrink-0">
                <h3 className="font-display font-semibold text-[16px] text-fg1">{title}</h3>
                <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-fg3 hover:text-fg1 hover:bg-surface2 transition">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto bg-surface1 min-h-0">{children}</div>
              {footer && <div className="px-5 py-3.5 border-t border-line flex justify-end gap-2 bg-surface2 shrink-0">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toast({ kind = 'success', title, sub, onClose }: { kind?: 'success' | 'danger' | 'info'; title: string; sub?: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  const borderColors: Record<string, string> = {
    success: 'border-emerald-200 dark:border-emerald-500/30',
    danger:  'border-rose-200 dark:border-rose-500/30',
    info:    'border-sky-200 dark:border-sky-500/30',
  };
  const dotColors: Record<string, string> = {
    success: 'bg-emerald-500',
    danger:  'bg-rose-600 dark:bg-rose-400',
    info:    'bg-sky-600 dark:bg-sky-400',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className={`bg-surface1 border ${borderColors[kind]} rounded-xl px-4 py-3 shadow-elev2 min-w-[260px] max-w-sm pointer-events-auto`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColors[kind]}`} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-fg1 font-body">{title}</div>
          {sub && <div className="text-[11.5px] text-fg3 mt-0.5 font-body">{sub}</div>}
        </div>
        <button onClick={onClose} className="text-fg3 hover:text-fg1 transition ml-1"><X size={14} /></button>
      </div>
    </motion.div>
  );
}

type ToastItem = { id: number; kind?: 'success' | 'danger' | 'info'; title: string; sub?: string };
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => setItems(s => [...s, { id: Date.now() + Math.random(), ...t }]), []);
  const remove = useCallback((id: number) => setItems(s => s.filter(t => t.id !== id)), []);
  const node = (
    <div className="fixed top-20 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {items.map(t => <Toast key={t.id} kind={t.kind} title={t.title} sub={t.sub} onClose={() => remove(t.id)} />)}
      </AnimatePresence>
    </div>
  );
  return { push, node };
}

export function Table({ columns, rows, empty }: { columns: { key: string; label: string; className?: string; render?: (row: any) => ReactNode }[]; rows: any[]; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="text-fg4 text-[11px] font-semibold uppercase tracking-[0.08em] bg-surface2">
            {columns.map(c => <th key={c.key} className={`px-4 py-3 border-b border-line font-body ${c.className ?? ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-[rgba(53,64,36,0.03)] transition group">
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3.5 border-b border-line/60 text-fg1 align-middle font-body ${c.className ?? ''}`}>
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

/**
 * Server-side pagination control — Prev/Next + "Page X of Y". For tables
 * backed by a paginated API (as opposed to the fixed-batch `limit: 100/200`
 * pattern most admin tables use today), so the client never has to hold more
 * than one page in memory regardless of how large the underlying table gets.
 */
export function Pagination({
  page, totalPages, onChange, disabled = false,
}: { page: number; totalPages: number; onChange: (page: number) => void; disabled?: boolean }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-line">
      <span className="text-[12px] text-fg3">Page {page} of {totalPages}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline" size="sm" icon={ChevronLeft}
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          Prev
        </Button>
        <Button
          variant="outline" size="sm" icon={ChevronRight}
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  const caramelHues = [32, 38, 44, 50, 26, 56];
  const mappedHue = caramelHues[Math.abs(Math.round(hue / 60)) % caramelHues.length];
  return (
    <span
      className="rounded-lg grid place-items-center font-body font-semibold text-white shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${mappedHue},55%,42%), hsl(${(mappedHue + 20) % 360},48%,36%))`,
      }}
    >
      {name.split(' ').map(p => p[0]).slice(0, 2).join('')}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = 'brand' }: { value: number; max?: number; tone?: 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colors: Record<string, string> = {
    brand:   'bg-brand',
    emerald: 'bg-emerald-500 dark:bg-emerald-400',
    amber:   'bg-amber-500 dark:bg-amber-400',
    rose:    'bg-rose-500 dark:bg-rose-400',
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-surface3 overflow-hidden border border-line/50">
      <div className={`h-full rounded-full ${colors[tone]} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}
