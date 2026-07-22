const EpochMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="var(--brand)" />
    <rect x="9"  y="9"  width="4.5" height="22" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
    <rect x="13.5" y="9"  width="16" height="4.5" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
    <rect x="13.5" y="17.5" width="11" height="4"   rx="2"    fill="var(--brand-ink)" opacity="0.70"/>
    <rect x="13.5" y="26.5" width="13.5" height="4.5" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
  </svg>
);

/**
 * Minimal, brand-only header for every standalone student page (Assessment
 * flow, Results, Leaderboard, Profile) — deliberately NOT a navigation bar.
 * No links except the brand itself, no sidebar toggle, no profile menu:
 * just identity, so these pages read as dedicated areas of the app rather
 * than a page inside a dashboard (there is no Student Dashboard). The
 * brand links back to Home — since these pages render in the DashboardApp
 * router tree, not the marketing site, that's the only way back to the
 * main navbar. (The exam-taking page itself uses no header at all beyond
 * its own in-content title/timer — see AssessmentTakePage.tsx.)
 */
export function StandaloneHeader({ subtitle = 'Assessment' }: { subtitle?: string }) {
  return (
    <header className="h-16 border-b border-line bg-bg/90 backdrop-blur-xl">
      <div className="h-full max-w-[1480px] w-full mx-auto px-5 md:px-8 lg:px-10 flex items-center gap-2.5">
        <a href="/#/home" className="flex items-center gap-2.5">
          <EpochMark size={28} />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-semibold text-[14px] text-fg1 tracking-[-0.01em]">Epoch Quiz</span>
            <span className="text-[9px] tracking-[0.14em] text-fg4 uppercase font-body">{subtitle}</span>
          </div>
        </a>
      </div>
    </header>
  );
}
