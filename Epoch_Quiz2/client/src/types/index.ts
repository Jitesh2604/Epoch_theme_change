export interface SubCategory {
  id: string;
  title: string;
  desc: string;
  count: number;
  badge?: string;
}

export interface Category {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  count: number;
  subs: SubCategory[];
}

export interface Level {
  id: string;
  title: string;
  desc: string;
  questions: number;
}

export interface HeroSlide {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  sub?: string;
}

export interface ApiResultAnswer {
  order: number;
  questionId: string;
  isCorrect: boolean | null;
  marksAwarded: number;
  yourAnswer: {
    selectedOption: string | null;
    selectedOptions: string[];
    textAnswer: string | null;
    isSkipped: boolean;
  };
  correct: {
    type: string;
    correctAnswer: string | null;
    correctOptions: string[];
    correctBoolean: boolean | null;
  };
  question: {
    prompt: string;
    options: { letter: string; text: string }[];
    marks: number;
    difficulty: string;
    explanation: string | null;
  };
}

export interface QuizResult {
  catId: string;
  subId: string;
  subjectName: string;
  level: string;
  attemptId: string;
  score: number;
  totalMarks: number;
  percent: number;
  correctAnswers: number;
  wrongAnswers: number;
  skipped: number;
  answers: ApiResultAnswer[];
}

export interface Tweaks {
  quizLayout: string;
  optionStyle: string;
  catCardStyle: string;
  sliderStyle: string;
}

export type NavigateFn = (path: string) => void;
export type SetTweakFn = (keyOrEdits: keyof Tweaks | Partial<Tweaks>, val?: string) => void;
