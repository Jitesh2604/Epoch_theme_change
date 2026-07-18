/*
  Assessment.boardExternalId / bookExternalId are dropped: confirmed zero
  application code (services, validators, controllers) ever reads or
  writes either column, and every existing row has both as NULL. Chapter/
  book/board scoping for an assessment already flows through
  AssessmentChapter and Question's own academic taxonomy fields — these two
  columns on Assessment itself were dead weight from the catalog-external-id
  migration, never wired up to any create/update path.
*/

DROP INDEX `assessments_boardExternalId_idx` ON `assessments`;
DROP INDEX `assessments_bookExternalId_idx` ON `assessments`;

ALTER TABLE `assessments`
  DROP COLUMN `boardExternalId`,
  DROP COLUMN `bookExternalId`;
