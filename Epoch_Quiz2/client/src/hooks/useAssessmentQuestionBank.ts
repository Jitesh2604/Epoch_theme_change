import { api } from '../lib/api';
import { useAsync } from './useApi';

// The Assessment Question Bank — physically separate from Practice/
// Olympiad's bank (useQuestions.ts). Hits /assessment-questions for the
// bank's own CRUD, and the nested /assessments/:id/questions... paths for
// attaching/detaching/reordering questions on a specific assessment.

export interface AssessmentBankQuestion {
  id: string;
  type: 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'FILL_IN_BLANK' | 'MATCH_THE_COLUMN' | 'DESCRIPTIVE';
  prompt: string;
  promptImageUrl: string | null;
  options: string[] | null;
  optionImageUrls: { A: string | null; B: string | null; C: string | null; D: string | null };
  correctOption: number | null;
  correctOptions: number[];
  correctBoolean: boolean | null;
  correctAnswer: string | null;
  modelAnswer: string | null;
  matchPairs: Array<{ left: string; right: string }> | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  marks: number;
  negativeMarks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  subject: { id: string; name: string; slug: string } | null;
  subjectExternalId: string | null;
  classExternalId: string | null;
  chapterExternalId: string | null;
  bookExternalId: string | null;
  educationBoard: string | null;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentBankQuestionsPage {
  items: AssessmentBankQuestion[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useAssessmentBankQuestions(params: {
  page?: number;
  limit?: number;
  type?: string;
  difficulty?: string;
  subjectExternalId?: string;
  search?: string;
  mine?: boolean;
  tag?: string;
  excludeAssessmentId?: string;
} = {}) {
  return useAsync<AssessmentBankQuestionsPage>(
    () => api.getWithQuery('/assessment-questions', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

interface QuestionImageFields {
  promptImageUrl?: string | null;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
  optionCImageUrl?: string | null;
  optionDImageUrl?: string | null;
  explanationImageUrl?: string | null;
}

export const assessmentQuestionApi = {
  create: (data: {
    type: string;
    prompt: string;
    options?: string[];
    correctOption?: number;
    correctOptions?: number[];
    correctBoolean?: boolean;
    correctAnswer?: string;
    modelAnswer?: string;
    explanation?: string;
    matchPairs?: Array<{ left: string; right: string }>;
    marks?: number;
    difficulty?: string;
    tags?: string[];
    subjectExternalId?: string | null;
    classExternalId?: string | null;
    chapterExternalId?: string | null;
    bookExternalId?: string | null;
  } & QuestionImageFields) => api.post<AssessmentBankQuestion>('/assessment-questions', data),

  update: (id: string, data: Partial<{
    prompt: string; options: string[]; correctOption: number;
    correctBoolean: boolean; modelAnswer: string; explanation: string;
    marks: number; difficulty: string; tags: string[]; subjectExternalId: string | null;
    classExternalId: string | null; chapterExternalId: string | null; bookExternalId: string | null;
  } & QuestionImageFields>) => api.patch<AssessmentBankQuestion>(`/assessment-questions/${id}`, data),

  remove: (id: string) => api.delete(`/assessment-questions/${id}`),
};

// ── Questions attached to a specific assessment ─────────────────

export function useAssessmentQuestions(assessmentId: string) {
  return useAsync<Array<{
    order: number;
    assessmentQuestionId: string;
    marksOverride: number | null;
    // Per-question override of the assessment's flat negativeMarksValue.
    // null = uses the assessment-level rate.
    negMarksOverride: number | null;
    effectiveMarks: number;
    question: AssessmentBankQuestion;
  }>>(
    () => api.get(`/assessments/${assessmentId}/questions`),
    [assessmentId],
  );
}

export const assessmentQuestionLinkApi = {
  attachToAssessment: (assessmentId: string, questionId: string, marks?: number, negMarks?: number) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionId, marks, negMarks }),

  bulkAttachToAssessment: (assessmentId: string, questionIds: string[]) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionIds }),

  detachFromAssessment: (assessmentId: string, questionId: string) =>
    api.delete(`/assessments/${assessmentId}/questions/${questionId}`),

  reorder: (assessmentId: string, order: Array<{ questionId: string; order: number }>) =>
    api.patch(`/assessments/${assessmentId}/questions/reorder`, { order }),
};
