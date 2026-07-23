export interface HeroSlide {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  /** Hash-router target for the CTA button (passed to navigate()). Defaults to 'play'. */
  ctaRoute?: string;
  /** Real top-level path for the CTA button (hard navigation) — takes priority over ctaRoute. */
  ctaHref?: string;
}

export interface Tweaks {
  catCardStyle: string;
  sliderStyle: string;
}

export type NavigateFn = (path: string) => void;
