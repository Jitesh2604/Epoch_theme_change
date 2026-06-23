export type Role = 'admin' | 'teacher' | 'student';

export type QuestionType = 'mcq' | 'truefalse' | 'descriptive';

export interface BankQuestion {
  id: string;
  type: QuestionType;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;
  options?: string[];
  correct?: number | boolean;
  answer?: string;
  marks: number;
  createdBy: string;
  createdAt: string;
  tags: string[];
}

export interface Assessment {
  id: string;
  name: string;
  description: string;
  subject: string;
  duration: number;
  questionCount: number;
  status: 'draft' | 'published' | 'archived';
  createdBy: string;
  createdAt: string;
  attempts: number;
  avgScore: number;
}

export interface TeacherRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  assessments: number;
  students: number;
  status: 'active' | 'pending' | 'inactive';
  joinedAt: string;
  avatarHue: number;
}

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  grade: string;
  section: string;
  attempted: number;
  avgScore: number;
  rank: number;
  status: 'active' | 'inactive';
  joinedAt: string;
  avatarHue: number;
}

export interface ResultRow {
  id: string;
  studentName: string;
  assessmentName: string;
  subject: string;
  score: number;
  total: number;
  percent: number;
  timeTaken: number;
  date: string;
  status: 'passed' | 'failed';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  time: string;
  read: boolean;
}

export interface SidebarItem {
  to: string;
  label: string;
  icon: any;
  badge?: string | number;
  href?: string;  // external / cross-SPA link — overrides NavLink behaviour
}
