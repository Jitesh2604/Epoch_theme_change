/*
  Removes the never-activated multi-tenancy scaffolding. Confirmed before
  writing this migration: zero rows exist in `publications`, and every
  `publicationId` column on users/assessments/quizzes is NULL for every
  existing row — nothing in the application ever set, read, or scoped by
  any of it (no tenant assignment on user/assessment/quiz creation, no
  tenant-scoped query anywhere, no client-side tenant management UI).

  Drops, in dependency order: the three publicationId foreign keys and
  indexes, the three publicationId columns, then the publications table
  itself.
*/

ALTER TABLE `users`       DROP FOREIGN KEY `users_publicationId_fkey`;
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_publicationId_fkey`;
ALTER TABLE `quizzes`     DROP FOREIGN KEY `quizzes_publicationId_fkey`;

DROP INDEX `users_publicationId_idx`       ON `users`;
DROP INDEX `assessments_publicationId_idx` ON `assessments`;
DROP INDEX `quizzes_publicationId_idx`     ON `quizzes`;

ALTER TABLE `users`       DROP COLUMN `publicationId`;
ALTER TABLE `assessments` DROP COLUMN `publicationId`;
ALTER TABLE `quizzes`     DROP COLUMN `publicationId`;

DROP TABLE `publications`;
