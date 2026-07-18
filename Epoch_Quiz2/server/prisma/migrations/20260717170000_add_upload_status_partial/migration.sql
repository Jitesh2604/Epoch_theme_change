/*
  Adds PARTIAL to QuestionUpload.uploadStatus, needed now that
  ExcelService.importQuestions actually writes a QuestionUpload row per
  import: a run where some rows imported and others failed validation is
  neither a clean SUCCESS nor a total FAILED.
*/

ALTER TABLE `question_uploads`
  MODIFY COLUMN `uploadStatus` ENUM('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'PENDING';
