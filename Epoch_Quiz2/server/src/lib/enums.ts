/**
 * Enum constants + types, re-exported from the generated Prisma Client so the
 * app has a single source of truth for enum values. Prisma generates each enum
 * as a value object (for runtime access) and a matching type (for type safety);
 * we alias both under the same name, mirroring `import { Role } from '...'`.
 */
import {
  Role as PRole,
  UserStatus as PUserStatus,
  QuestionType as PQuestionType,
  Difficulty as PDifficulty,
  AssessmentType as PAssessmentType,
  AssessmentStatus as PAssessmentStatus,
  QuestionSelection as PQuestionSelection,
  ShowResultAfter as PShowResultAfter,
  QuizType as PQuizType,
  QuizStatus as PQuizStatus,
  SubmissionStatus as PSubmissionStatus,
  AttemptStatus as PAttemptStatus,
  OtpType as POtpType,
  UploadStatus as PUploadStatus,
} from '@prisma/client';

export const Role = PRole;
export type Role = PRole;
export const UserStatus = PUserStatus;
export type UserStatus = PUserStatus;
export const QuestionType = PQuestionType;
export type QuestionType = PQuestionType;
export const Difficulty = PDifficulty;
export type Difficulty = PDifficulty;
export const AssessmentType = PAssessmentType;
export type AssessmentType = PAssessmentType;
export const AssessmentStatus = PAssessmentStatus;
export type AssessmentStatus = PAssessmentStatus;
export const QuestionSelection = PQuestionSelection;
export type QuestionSelection = PQuestionSelection;
export const ShowResultAfter = PShowResultAfter;
export type ShowResultAfter = PShowResultAfter;
export const QuizType = PQuizType;
export type QuizType = PQuizType;
export const QuizStatus = PQuizStatus;
export type QuizStatus = PQuizStatus;
export const SubmissionStatus = PSubmissionStatus;
export type SubmissionStatus = PSubmissionStatus;
export const AttemptStatus = PAttemptStatus;
export type AttemptStatus = PAttemptStatus;
export const OtpType = POtpType;
export type OtpType = POtpType;
export const UploadStatus = PUploadStatus;
export type UploadStatus = PUploadStatus;

/**
 * Canonical `language` value for Question/Assessment/Quiz rows. The column
 * is free-text (not a DB enum) so a future release can add real languages
 * without a migration, but every code path that writes it must use this
 * constant rather than a literal — a manual-create path once used 'ENGLISH'
 * while sync/seed used 'English', producing inconsistent stored values.
 */
export const DEFAULT_LANGUAGE = 'English';
