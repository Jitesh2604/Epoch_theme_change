import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Question {
  id: string;
  type: 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'FILL_IN_BLANK' | 'MATCH_THE_COLUMN' | 'DESCRIPTIVE';
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  correctOptions: number[];
  correctBoolean: boolean | null;
  correctAnswer: string | null;
  modelAnswer: string | null;
  matchPairs: Array<{ left: string; right: string }> | null;
  explanation: string | null;
  marks: number;
  negativeMarks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  subject: { id: string; name: string; slug: string } | null;
  classExternalId: string | null;
  chapterExternalId: string | null;
  bookExternalId: string | null;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface QuestionsPage {
  items: Question[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function useQuestions(params: {
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
  return useAsync<QuestionsPage>(
    () => api.getWithQuery('/questions', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export function useAssessmentQuestions(assessmentId: string) {
  return useAsync<Array<{
    order: number;
    assessmentQuestionId: string;
    marksOverride: number | null;
    effectiveMarks: number;
    question: Question;
  }>>(
    () => api.get(`/assessments/${assessmentId}/questions`),
    [assessmentId],
  );
}

export const questionApi = {
  create: (data: {
    type: string;
    prompt: string;
    options?: string[];
    correctOption?: number;
    correctOptions?: number[];
    correctBoolean?: boolean;
    correctAnswer?: string;
    modelAnswer?: string;
    matchPairs?: Array<{ left: string; right: string }>;
    marks?: number;
    difficulty?: string;
    tags?: string[];
    subjectExternalId?: string | null;
    classId?: string | null;
    chapterId?: string | null;
    bookId?: string | null;
  }) => api.post<Question>('/questions', data),

  update: (id: string, data: Partial<{
    prompt: string; options: string[]; correctOption: number;
    correctBoolean: boolean; modelAnswer: string;
    marks: number; difficulty: string; tags: string[]; subjectExternalId: string | null;
    classExternalId: string | null; chapterExternalId: string | null; bookExternalId: string | null;
  }>) => api.patch<Question>(`/questions/${id}`, data),

  remove: (id: string) => api.delete(`/questions/${id}`),

  attachToAssessment: (assessmentId: string, questionId: string, marks?: number) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionId, marks }),

  bulkAttachToAssessment: (assessmentId: string, questionIds: string[]) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionIds }),

  detachFromAssessment: (assessmentId: string, questionId: string) =>
    api.delete(`/assessments/${assessmentId}/questions/${questionId}`),

  reorder: (assessmentId: string, order: Array<{ questionId: string; order: number }>) =>
    api.patch(`/assessments/${assessmentId}/questions/reorder`, { order }),
};
