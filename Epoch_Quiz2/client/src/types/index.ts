export interface HeroSlide {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

export interface Tweaks {
  catCardStyle: string;
  sliderStyle: string;
}

export type NavigateFn = (path: string) => void;
