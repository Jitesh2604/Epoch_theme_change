import type { Category, Level, HeroSlide } from '../types';

export const QUIZ_CATEGORIES: Category[] = [
  {
    id: 'practice-olympaid',
    title: 'Practice Olympaid',
    blurb: 'Self-paced practice sessions with questions drawn live from the database. No time pressure.',
    icon: 'target',
    count: 0,
    subs: [],
  },
  {
    id: 'attempt-olympaid',
    title: 'Attempt Olympaid',
    blurb: 'Graded quiz attempts with instant results and leaderboard ranking. Work at your own pace.',
    icon: 'trophy',
    count: 0,
    subs: [],
  },
];

export const LEVELS: Level[] = [
  { id: 'easy',   title: 'Easy',   desc: 'Accessible questions, work at your own pace.',       questions: 5  },
  { id: 'medium', title: 'Medium', desc: 'Standard difficulty. The default mode.',              questions: 8  },
  { id: 'hard',   title: 'Hard',   desc: 'Challenging questions with trickier distractors.',    questions: 10 },
];

export const HERO_SLIDES: HeroSlide[] = [
  {
    eyebrow: 'New · Olympaid Quiz',
    title: 'Turn idle minutes into <em>sharper minds</em>.',
    body: 'Practice and attempt quizzes drawn live from the question database. No time pressure — just learning.',
    cta: 'Start a quiz',
  },
  {
    eyebrow: 'Built for educators',
    title: 'Question banks at <em>publication scale</em>.',
    body: 'Practice, test paper, and answer-key flows that hold up to the way real classrooms run. No filler. No fluff.',
    cta: 'Browse all quizzes',
  },
  {
    eyebrow: 'Earn your streak',
    title: 'Compete with the people <em>around your level</em>.',
    body: 'The leaderboard updates the second a quiz ends. Climb your house, your school, or the global ranks.',
    cta: 'Start a quiz',
  },
];
