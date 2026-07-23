import type { HeroSlide } from '../types';

export const HERO_SLIDES: HeroSlide[] = [
  {
    eyebrow: 'Olympiad Practice Platform',
    title: 'Practice smarter. <em>Prepare better.</em>',
    body: 'Subject-wise practice, Olympiad preparation, and official school assessments — one platform, every question tagged to your class and curriculum.',
    cta: 'Start practicing',
    ctaRoute: 'play',
  },
  {
    eyebrow: 'Practice anytime',
    title: 'Instant results, <em>every single time</em>.',
    body: 'Pick a subject and difficulty, or take on a self-paced mixed Practice Olympiad set. See your score, correct answers, and explanations the moment you submit — pause and resume whenever you need to.',
    cta: 'Start a Practice Olympiad',
    ctaRoute: 'play',
  },
  {
    eyebrow: 'Official assessments',
    title: 'One official assessment, <em>taken seriously</em>.',
    body: 'A single timed assessment per session, taken in a distraction-free, full-screen exam mode with no answer feedback until it’s over. Results are published by your school once grading is complete.',
    cta: 'View your assessment',
    ctaHref: '/assessment',
  },
];
