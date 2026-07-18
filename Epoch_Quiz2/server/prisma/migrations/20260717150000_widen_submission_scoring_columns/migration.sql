/*
  Widen Submission.score/totalMarks and Answer.marksAwarded from INT to
  DOUBLE. Needed to implement negative marking correctly (a deduction can
  be negative and fractional) and fixes a pre-existing precision loss:
  AssessmentQuestion.marksOverride is already Float, so a fractional
  override's awarded marks were being truncated when stored as an INT.
  Matches the already-DOUBLE QuizAttempt.score / AttemptAnswer.marksAwarded
  columns on the Practice/Olympiad side. Existing integer values convert
  losslessly.
*/

ALTER TABLE `submissions` MODIFY COLUMN `score` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `submissions` MODIFY COLUMN `totalMarks` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `answers` MODIFY COLUMN `marksAwarded` DOUBLE NOT NULL DEFAULT 0;
