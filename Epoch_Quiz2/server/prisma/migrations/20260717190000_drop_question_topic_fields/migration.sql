/*
  Question.topic / Question.subtopic are dropped: confirmed zero rows have
  either set (NULL for every existing question), and no application code
  — service, validator, sync process, Excel import, seed script, or client
  — ever creates, updates, queries, or displays either field. No categorization
  feature currently references them; the app's existing subject/class/
  chapter/board taxonomy (subjectExternalId, classExternalId,
  chapterExternalId, educationBoard) is what all filtering and scoping
  actually uses today.
*/

ALTER TABLE `questions` DROP COLUMN `topic`, DROP COLUMN `subtopic`;
