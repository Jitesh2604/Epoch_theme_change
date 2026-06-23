/**
 * Local enum constants — replaces all @prisma/client enum imports.
 * Each enum is a const object (value access) + inferred union type (type safety).
 */

export const Role = {
  SUPER_ADMIN:       'SUPER_ADMIN',
  PUBLICATION_ADMIN: 'PUBLICATION_ADMIN',
  CONTENT_MANAGER:   'CONTENT_MANAGER',
  TEACHER:           'TEACHER',
  STUDENT:           'STUDENT',
} as const;
export type Role = typeof Role[keyof typeof Role];

export const UserStatus = {
  ACTIVE:   'ACTIVE',
  PENDING:  'PENDING',
  INACTIVE: 'INACTIVE',
} as const;
export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

export const QuestionType = {
  MCQ_SINGLE:      'MCQ_SINGLE',
  MCQ_MULTIPLE:    'MCQ_MULTIPLE',
  TRUE_FALSE:      'TRUE_FALSE',
  FILL_IN_BLANK:   'FILL_IN_BLANK',
  MATCH_THE_COLUMN:'MATCH_THE_COLUMN',
  DESCRIPTIVE:     'DESCRIPTIVE',
} as const;
export type QuestionType = typeof QuestionType[keyof typeof QuestionType];

export const Difficulty = {
  EASY:   'EASY',
  MEDIUM: 'MEDIUM',
  HARD:   'HARD',
} as const;
export type Difficulty = typeof Difficulty[keyof typeof Difficulty];

export const AssessmentType = {
  OLYMPIAD:     'OLYMPIAD',
  CHAPTER_TEST: 'CHAPTER_TEST',
  MOCK_TEST:    'MOCK_TEST',
  PRACTICE:     'PRACTICE',
  ASSIGNMENT:   'ASSIGNMENT',
} as const;
export type AssessmentType = typeof AssessmentType[keyof typeof AssessmentType];

export const AssessmentStatus = {
  DRAFT:     'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED:  'ARCHIVED',
} as const;
export type AssessmentStatus = typeof AssessmentStatus[keyof typeof AssessmentStatus];

export const QuestionSelection = {
  MANUAL:       'MANUAL',
  AUTO_RANDOM:  'AUTO_RANDOM',
  AUTO_LEVEL:   'AUTO_LEVEL',
} as const;
export type QuestionSelection = typeof QuestionSelection[keyof typeof QuestionSelection];

export const ShowResultAfter = {
  IMMEDIATELY:   'IMMEDIATELY',
  AFTER_END_DATE:'AFTER_END_DATE',
  MANUALLY:      'MANUALLY',
} as const;
export type ShowResultAfter = typeof ShowResultAfter[keyof typeof ShowResultAfter];

export const QuizType = {
  PRACTICE:     'PRACTICE',
  OLYMPIAD:     'OLYMPIAD',
  CHAPTER_TEST: 'CHAPTER_TEST',
  MOCK_TEST:    'MOCK_TEST',
  LIVE_QUIZ:    'LIVE_QUIZ',
  ASSIGNMENT:   'ASSIGNMENT',
} as const;
export type QuizType = typeof QuizType[keyof typeof QuizType];

export const QuizStatus = {
  DRAFT:     'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED:  'ARCHIVED',
} as const;
export type QuizStatus = typeof QuizStatus[keyof typeof QuizStatus];

export const SubmissionStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED:   'SUBMITTED',
  GRADED:      'GRADED',
} as const;
export type SubmissionStatus = typeof SubmissionStatus[keyof typeof SubmissionStatus];

export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED:   'SUBMITTED',
  ABANDONED:   'ABANDONED',
} as const;
export type AttemptStatus = typeof AttemptStatus[keyof typeof AttemptStatus];

export const OtpType = {
  REGISTRATION:   'REGISTRATION',
  LOGIN:          'LOGIN',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PHONE_VERIFY:   'PHONE_VERIFY',
} as const;
export type OtpType = typeof OtpType[keyof typeof OtpType];

export const NotificationType = {
  GENERAL:     'GENERAL',
  QUIZ:        'QUIZ',
  RESULT:      'RESULT',
  CERTIFICATE: 'CERTIFICATE',
  REMINDER:    'REMINDER',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

export const NotificationTarget = {
  ALL:      'ALL',
  STUDENTS: 'STUDENTS',
  TEACHERS: 'TEACHERS',
  CLASS:    'CLASS',
  SPECIFIC: 'SPECIFIC',
} as const;
export type NotificationTarget = typeof NotificationTarget[keyof typeof NotificationTarget];

export const UploadStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED:  'FAILED',
} as const;
export type UploadStatus = typeof UploadStatus[keyof typeof UploadStatus];

export const BadgeType = {
  GOLD:          'GOLD',
  SILVER:        'SILVER',
  BRONZE:        'BRONZE',
  PARTICIPATION: 'PARTICIPATION',
} as const;
export type BadgeType = typeof BadgeType[keyof typeof BadgeType];
