import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Question {
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

export interface UploadHistoryItem {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  totalRows: number;
  rowsImported: number;
  rowsFailed: number;
  errors: { row: number; field?: string; message: string }[];
  uploadedAt: string;
  uploadedBy: { id: string; name: string; email: string };
  assessment: { id: string; title: string } | null;
}

export interface UploadHistoryPage {
  items: UploadHistoryItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** A teacher sees only their own uploads; an admin sees everyone's — enforced server-side. */
export function useUploadHistory(params: { page?: number; limit?: number; status?: string } = {}) {
  return useAsync<UploadHistoryPage>(
    () => api.getWithQuery('/questions/upload/history', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export function useAssessmentQuestions(assessmentId: string) {
  return useAsync<Array<{
    order: number;
    assessmentQuestionId: string;
    marksOverride: number | null;
    effectiveMarks: number;
    // Per-question override of the assessment's flat negativeMarksValue.
    // null = uses the assessment-level rate.
    negMarksOverride: number | null;
    question: Question;
  }>>(
    () => api.get(`/assessments/${assessmentId}/questions`),
    [assessmentId],
  );
}

// Image fields hold a URL to an already-hosted image, not a file upload —
// the questions.*ImageUrl columns are VARCHAR(191), far too small for an
// inline/base64 data URL.
interface QuestionImageFields {
  promptImageUrl?: string | null;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
  optionCImageUrl?: string | null;
  optionDImageUrl?: string | null;
  explanationImageUrl?: string | null;
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
    explanation?: string;
    matchPairs?: Array<{ left: string; right: string }>;
    marks?: number;
    difficulty?: string;
    tags?: string[];
    subjectExternalId?: string | null;
    classId?: string | null;
    chapterId?: string | null;
    bookId?: string | null;
  } & QuestionImageFields) => api.post<Question>('/questions', data),

  update: (id: string, data: Partial<{
    prompt: string; options: string[]; correctOption: number;
    correctBoolean: boolean; modelAnswer: string; explanation: string;
    marks: number; difficulty: string; tags: string[]; subjectExternalId: string | null;
    classExternalId: string | null; chapterExternalId: string | null; bookExternalId: string | null;
  } & QuestionImageFields>) => api.patch<Question>(`/questions/${id}`, data),

  remove: (id: string) => api.delete(`/questions/${id}`),

  attachToAssessment: (assessmentId: string, questionId: string, marks?: number, negMarks?: number) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionId, marks, negMarks }),

  bulkAttachToAssessment: (assessmentId: string, questionIds: string[]) =>
    api.post(`/assessments/${assessmentId}/questions`, { questionIds }),

  detachFromAssessment: (assessmentId: string, questionId: string) =>
    api.delete(`/assessments/${assessmentId}/questions/${questionId}`),

  reorder: (assessmentId: string, order: Array<{ questionId: string; order: number }>) =>
    api.patch(`/assessments/${assessmentId}/questions/reorder`, { order }),
};
