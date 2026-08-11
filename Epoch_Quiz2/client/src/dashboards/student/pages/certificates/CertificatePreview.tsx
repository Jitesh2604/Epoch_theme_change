import { forwardRef } from 'react';
import { Award, Crown, ShieldCheck, Sparkles } from 'lucide-react';
import type { Certificate } from '../../../../hooks/useCertificates';

// The certificate itself is deliberately NOT theme-aware (no `dark:`
// variants) — a real paper certificate doesn't change with the viewer's
// device theme, and this same DOM node is captured verbatim for Print and
// PDF download, where it must always render correctly against white paper.
// Only the surrounding page (CertificatesPage.tsx) uses the app's normal
// light/dark design system.

const SCOPE_THEME: Record<Certificate['scope'], {
  frame: string; ring: string; badgeBg: string; badgeText: string; icon: any; wordmark: string;
}> = {
  global: {
    frame: 'from-amber-50 via-white to-sky-50',
    ring: 'ring-amber-300/70',
    badgeBg: 'bg-gradient-to-br from-amber-400 to-sky-600',
    badgeText: 'text-white',
    icon: Crown,
    wordmark: 'text-sky-800',
  },
  state: {
    frame: 'from-emerald-50 via-white to-amber-50',
    ring: 'ring-emerald-300/70',
    badgeBg: 'bg-gradient-to-br from-emerald-500 to-amber-500',
    badgeText: 'text-white',
    icon: ShieldCheck,
    wordmark: 'text-emerald-800',
  },
  school: {
    frame: 'from-sky-50 via-white to-sky-100',
    ring: 'ring-sky-300/70',
    badgeBg: 'bg-gradient-to-br from-sky-500 to-sky-700',
    badgeText: 'text-white',
    icon: Award,
    wordmark: 'text-sky-800',
  },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const CertificatePreview = forwardRef<HTMLDivElement, { certificate: Certificate; compact?: boolean; printTarget?: boolean }>(
  function CertificatePreview({ certificate: c, compact, printTarget }, ref) {
    const theme = SCOPE_THEME[c.scope];
    const isChampion = c.type.endsWith('_CHAMPION');
    const Icon = theme.icon;

    return (
      <div
        ref={ref}
        // .certificate-print-area is only ever applied to the ONE
        // currently-open viewer instance (printTarget) — card thumbnails
        // never carry it, so window.print() can't accidentally pull in
        // every card on the page at once (see @media print in
        // styles/index.css, which shows every element carrying this class).
        className={`${printTarget ? 'certificate-print-area' : ''} relative w-full aspect-[1.42/1] rounded-2xl bg-gradient-to-br ${theme.frame} ring-1 ${theme.ring} ${
          isChampion ? 'ring-2 ring-amber-400/80' : ''
        } shadow-sm overflow-hidden text-[#2b2417]`}
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        {/* Decorative border */}
        <div className={`absolute inset-2.5 rounded-xl border-2 ${isChampion ? 'border-amber-400/60' : 'border-black/10'} pointer-events-none`} />
        {isChampion && (
          <Sparkles size={compact ? 14 : 18} className="absolute top-4 right-4 text-amber-500" />
        )}

        <div className={`relative h-full flex flex-col items-center text-center ${compact ? 'px-4 py-4' : 'px-8 py-7'}`}>
          {/* Header / wordmark */}
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-lg ${theme.badgeBg} grid place-items-center shrink-0`}>
              <Icon size={13} className={theme.badgeText} />
            </div>
            <span className={`font-semibold tracking-wide ${theme.wordmark} ${compact ? 'text-[11px]' : 'text-[14px]'}`}>
              Epoch Olympiad
            </span>
          </div>

          <div className={`uppercase tracking-[0.2em] text-black/50 ${compact ? 'text-[8px]' : 'text-[10px]'} mb-2`}>
            Certificate of Achievement
          </div>

          <div className={`font-bold ${compact ? 'text-[9px]' : 'text-[12px]'} text-black/60 mb-1`}>
            This certifies that
          </div>
          <div className={`font-bold ${compact ? 'text-[15px]' : 'text-[24px]'} leading-tight mb-1.5 truncate max-w-full`}>
            {c.studentName}
          </div>

          <div className={`${compact ? 'text-[9px]' : 'text-[12.5px]'} text-black/70 max-w-[85%] leading-snug mb-2.5`}>
            has been recognized as <span className="font-semibold">{c.title}</span> — {c.description}
          </div>

          {/* Rank / Score / Session */}
          <div className={`flex items-center justify-center flex-wrap gap-x-4 gap-y-1 ${compact ? 'text-[8px]' : 'text-[11px]'} font-semibold mb-2`}>
            <span>Rank #{c.rank}</span>
            <span className="opacity-40">•</span>
            <span>Score {c.score}/{c.totalMarks}</span>
            <span className="opacity-40">•</span>
            <span className="truncate max-w-[160px]">{c.sessionTitle}</span>
          </div>

          {(c.schoolName || c.state || c.className) && (
            <div className={`${compact ? 'text-[7.5px]' : 'text-[10px]'} text-black/50 mb-1`}>
              {[c.schoolName, c.state, c.className].filter(Boolean).join(' · ')}
            </div>
          )}

          <div className="flex-1" />

          {/* Footer */}
          <div className={`w-full flex items-end justify-between pt-2 border-t border-black/10 ${compact ? 'text-[7px]' : 'text-[9.5px]'} text-black/50`}>
            <div className="text-left">
              <div className="uppercase tracking-wide">Certificate ID</div>
              <div className="font-mono font-semibold text-black/70">{c.certificateId}</div>
            </div>
            <div className="text-right">
              <div className="uppercase tracking-wide">Issued</div>
              <div className="font-semibold text-black/70">{fmtDate(c.issuedAt)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
