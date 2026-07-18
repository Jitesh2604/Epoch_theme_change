/*
  Quiz.marksPerQuestion is dropped: it's superseded by the per-question
  Question.marks field (with QuizQuestion.marksOverride available for a
  per-quiz override), which is the mechanism actually used for grading
  everywhere in the app. marksPerQuestion was never read or written by any
  code path — every existing row is still at its schema default (1),
  confirmed before writing this migration — so no data is lost.
*/

ALTER TABLE `quizzes` DROP COLUMN `marksPerQuestion`;
