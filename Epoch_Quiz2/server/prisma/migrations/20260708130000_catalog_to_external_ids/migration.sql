-- =====================================================================
-- Catalog → external-ID migration (DATA-PRESERVING)
--
-- The Content API becomes the single source of truth for catalog data
-- (boards / classes / subjects / series / books / chapters). This migration
-- converts every local catalog foreign key into the Content API external ID,
-- removes the catalog tables and the content-sync bookkeeping table, and moves
-- the app-owned Olympiad "mode" rows into their own table.
--
-- Order of operations (so NO data is lost):
--   1. report table + olympiad_modes (copy non-SUBJECT rows out of subjects)
--   2. add new nullable external-id columns
--   3. backfill them from the catalog tables (local id -> catalog.externalId)
--   4. log every unmappable row (catalog row had no externalId)
--   5. delete only the unmappable JOIN-table rows (their external id is a
--      NOT NULL part of the primary key); main-table columns keep NULL
--   6. drop foreign keys + stale indexes
--   7. finalize join tables (drop old col, make new col NOT NULL, rebuild PK)
--   8. drop old main-table columns
--   9. drop catalog + content_sync tables
--  10. create the new external-id indexes
-- =====================================================================

-- 1) Migration report + Olympiad modes ---------------------------------------
CREATE TABLE `_catalog_migration_report` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity` VARCHAR(64) NOT NULL,
    `dimension` VARCHAR(32) NOT NULL,
    `rowKey` VARCHAR(255) NULL,
    `localId` VARCHAR(191) NULL,
    `reason` VARCHAR(255) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `olympiad_modes` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `serial` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'OLYMPIAD',
    `status` ENUM('ACTIVE', 'PENDING', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `olympiad_modes_name_key`(`name`),
    UNIQUE INDEX `olympiad_modes_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Any subject row that was actually an Olympiad "mode" (kind != SUBJECT) moves
-- to the app-owned table before `subjects` is dropped.
INSERT INTO `olympiad_modes` (`id`, `name`, `slug`, `serial`, `kind`, `status`, `createdAt`, `updatedAt`)
SELECT `id`, `name`, `slug`, `serial`, `kind`, `status`, `createdAt`, `updatedAt`
FROM `subjects` WHERE `kind` <> 'SUBJECT';

-- 2) Add new nullable external-id columns -------------------------------------
ALTER TABLE `questions`
    ADD COLUMN `subjectExternalId` VARCHAR(191) NULL,
    ADD COLUMN `classExternalId`   VARCHAR(191) NULL,
    ADD COLUMN `bookExternalId`    VARCHAR(191) NULL,
    ADD COLUMN `chapterExternalId` VARCHAR(191) NULL;

ALTER TABLE `assessments`
    ADD COLUMN `boardExternalId`   VARCHAR(191) NULL,
    ADD COLUMN `bookExternalId`    VARCHAR(191) NULL,
    ADD COLUMN `classExternalId`   VARCHAR(191) NULL,
    ADD COLUMN `subjectExternalId` VARCHAR(191) NULL;

ALTER TABLE `quizzes`
    ADD COLUMN `boardExternalId`   VARCHAR(191) NULL,
    ADD COLUMN `bookExternalId`    VARCHAR(191) NULL,
    ADD COLUMN `classExternalId`   VARCHAR(191) NULL,
    ADD COLUMN `seriesExternalId`  VARCHAR(191) NULL,
    ADD COLUMN `subjectExternalId` VARCHAR(191) NULL;

ALTER TABLE `student_profiles`
    ADD COLUMN `boardExternalId`  VARCHAR(191) NULL,
    ADD COLUMN `classExternalId`  VARCHAR(191) NULL,
    ADD COLUMN `seriesExternalId` VARCHAR(191) NULL;

ALTER TABLE `teacher_profiles`
    ADD COLUMN `boardExternalId` VARCHAR(191) NULL;

ALTER TABLE `student_books`               ADD COLUMN `bookExternalId`    VARCHAR(191) NULL;
ALTER TABLE `teacher_books`               ADD COLUMN `bookExternalId`    VARCHAR(191) NULL;
ALTER TABLE `teacher_classes`             ADD COLUMN `classExternalId`   VARCHAR(191) NULL;
ALTER TABLE `teacher_series`              ADD COLUMN `seriesExternalId`  VARCHAR(191) NULL;
ALTER TABLE `teacher_subjects`            ADD COLUMN `subjectExternalId` VARCHAR(191) NULL;
ALTER TABLE `student_subjects`            ADD COLUMN `subjectExternalId` VARCHAR(191) NULL;
ALTER TABLE `assessment_chapters`         ADD COLUMN `chapterExternalId` VARCHAR(191) NULL;
ALTER TABLE `quiz_chapters`               ADD COLUMN `chapterExternalId` VARCHAR(191) NULL;
ALTER TABLE `assessment_assigned_classes` ADD COLUMN `classExternalId`   VARCHAR(191) NULL;
ALTER TABLE `quiz_assigned_classes`       ADD COLUMN `classExternalId`   VARCHAR(191) NULL;

-- 3) Backfill from catalog tables (local id -> catalog.externalId) ------------
UPDATE `questions` q JOIN `subjects` s ON s.`id` = q.`subjectId` SET q.`subjectExternalId` = s.`externalId`;
UPDATE `questions` q JOIN `classes`  c ON c.`id` = q.`classId`   SET q.`classExternalId`   = c.`externalId`;
UPDATE `questions` q JOIN `books`    b ON b.`id` = q.`bookId`    SET q.`bookExternalId`    = b.`externalId`;
UPDATE `questions` q JOIN `chapters` h ON h.`id` = q.`chapterId` SET q.`chapterExternalId` = h.`externalId`;

UPDATE `assessments` a JOIN `boards`   b ON b.`id` = a.`boardId`   SET a.`boardExternalId`   = b.`externalId`;
UPDATE `assessments` a JOIN `classes`  c ON c.`id` = a.`classId`   SET a.`classExternalId`   = c.`externalId`;
UPDATE `assessments` a JOIN `subjects` s ON s.`id` = a.`subjectId` SET a.`subjectExternalId` = s.`externalId`;
UPDATE `assessments` a JOIN `books`    k ON k.`id` = a.`bookId`    SET a.`bookExternalId`    = k.`externalId`;

UPDATE `quizzes` z JOIN `boards`   b ON b.`id` = z.`boardId`   SET z.`boardExternalId`   = b.`externalId`;
UPDATE `quizzes` z JOIN `series`   e ON e.`id` = z.`seriesId`  SET z.`seriesExternalId`  = e.`externalId`;
UPDATE `quizzes` z JOIN `classes`  c ON c.`id` = z.`classId`   SET z.`classExternalId`   = c.`externalId`;
UPDATE `quizzes` z JOIN `subjects` s ON s.`id` = z.`subjectId` SET z.`subjectExternalId` = s.`externalId`;
UPDATE `quizzes` z JOIN `books`    k ON k.`id` = z.`bookId`    SET z.`bookExternalId`    = k.`externalId`;

UPDATE `student_profiles` p JOIN `boards`  b ON b.`id` = p.`boardId`  SET p.`boardExternalId`  = b.`externalId`;
UPDATE `student_profiles` p JOIN `classes` c ON c.`id` = p.`classId`  SET p.`classExternalId`  = c.`externalId`;
UPDATE `student_profiles` p JOIN `series`  e ON e.`id` = p.`seriesId` SET p.`seriesExternalId` = e.`externalId`;

UPDATE `teacher_profiles` t JOIN `boards` b ON b.`id` = t.`boardId` SET t.`boardExternalId` = b.`externalId`;

UPDATE `student_books`   x JOIN `books`    b ON b.`id` = x.`bookId`    SET x.`bookExternalId`    = b.`externalId`;
UPDATE `teacher_books`   x JOIN `books`    b ON b.`id` = x.`bookId`    SET x.`bookExternalId`    = b.`externalId`;
UPDATE `teacher_classes` x JOIN `classes`  c ON c.`id` = x.`classId`   SET x.`classExternalId`   = c.`externalId`;
UPDATE `teacher_series`  x JOIN `series`   e ON e.`id` = x.`seriesId`  SET x.`seriesExternalId`  = e.`externalId`;
UPDATE `teacher_subjects` x JOIN `subjects` s ON s.`id` = x.`subjectId` SET x.`subjectExternalId` = s.`externalId`;
UPDATE `student_subjects` x JOIN `subjects` s ON s.`id` = x.`subjectId` SET x.`subjectExternalId` = s.`externalId`;
UPDATE `assessment_chapters` x JOIN `chapters` h ON h.`id` = x.`chapterId` SET x.`chapterExternalId` = h.`externalId`;
UPDATE `quiz_chapters`       x JOIN `chapters` h ON h.`id` = x.`chapterId` SET x.`chapterExternalId` = h.`externalId`;
UPDATE `assessment_assigned_classes` x JOIN `classes` c ON c.`id` = x.`classId` SET x.`classExternalId` = c.`externalId`;
UPDATE `quiz_assigned_classes`       x JOIN `classes` c ON c.`id` = x.`classId` SET x.`classExternalId` = c.`externalId`;

-- 4) Log unmappable rows (old FK set, but catalog row had no externalId) ------
-- Main tables: the external id is nullable, so we keep the row and NULL it.
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'questions','subject',`id`,`subjectId`,'catalog subject has no externalId','set NULL' FROM `questions` WHERE `subjectId` IS NOT NULL AND `subjectExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'questions','class',`id`,`classId`,'catalog class has no externalId','set NULL' FROM `questions` WHERE `classId` IS NOT NULL AND `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'questions','book',`id`,`bookId`,'catalog book has no externalId','set NULL' FROM `questions` WHERE `bookId` IS NOT NULL AND `bookExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'questions','chapter',`id`,`chapterId`,'catalog chapter has no externalId','set NULL' FROM `questions` WHERE `chapterId` IS NOT NULL AND `chapterExternalId` IS NULL;

INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessments','board',`id`,`boardId`,'catalog board has no externalId','set NULL' FROM `assessments` WHERE `boardId` IS NOT NULL AND `boardExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessments','class',`id`,`classId`,'catalog class has no externalId','set NULL' FROM `assessments` WHERE `classId` IS NOT NULL AND `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessments','subject',`id`,`subjectId`,'catalog subject has no externalId','set NULL' FROM `assessments` WHERE `subjectId` IS NOT NULL AND `subjectExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessments','book',`id`,`bookId`,'catalog book has no externalId','set NULL' FROM `assessments` WHERE `bookId` IS NOT NULL AND `bookExternalId` IS NULL;

INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quizzes','board',`id`,`boardId`,'catalog board has no externalId','set NULL' FROM `quizzes` WHERE `boardId` IS NOT NULL AND `boardExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quizzes','series',`id`,`seriesId`,'catalog series has no externalId','set NULL' FROM `quizzes` WHERE `seriesId` IS NOT NULL AND `seriesExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quizzes','class',`id`,`classId`,'catalog class has no externalId','set NULL' FROM `quizzes` WHERE `classId` IS NOT NULL AND `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quizzes','subject',`id`,`subjectId`,'catalog subject has no externalId','set NULL' FROM `quizzes` WHERE `subjectId` IS NOT NULL AND `subjectExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quizzes','book',`id`,`bookId`,'catalog book has no externalId','set NULL' FROM `quizzes` WHERE `bookId` IS NOT NULL AND `bookExternalId` IS NULL;

INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'student_profiles','board',`id`,`boardId`,'catalog board has no externalId','set NULL' FROM `student_profiles` WHERE `boardId` IS NOT NULL AND `boardExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'student_profiles','class',`id`,`classId`,'catalog class has no externalId','set NULL' FROM `student_profiles` WHERE `classId` IS NOT NULL AND `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'student_profiles','series',`id`,`seriesId`,'catalog series has no externalId','set NULL' FROM `student_profiles` WHERE `seriesId` IS NOT NULL AND `seriesExternalId` IS NULL;

INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'teacher_profiles','board',`id`,`boardId`,'catalog board has no externalId','set NULL' FROM `teacher_profiles` WHERE `boardId` IS NOT NULL AND `boardExternalId` IS NULL;

-- Join tables: the external id is a NOT NULL part of the PK, so unmappable
-- rows must be deleted (logged first).
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'student_books','book',CONCAT(`studentProfileId`,':',`bookId`),`bookId`,'catalog book has no externalId','delete row' FROM `student_books` WHERE `bookExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'teacher_books','book',CONCAT(`teacherProfileId`,':',`bookId`),`bookId`,'catalog book has no externalId','delete row' FROM `teacher_books` WHERE `bookExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'teacher_classes','class',CONCAT(`teacherProfileId`,':',`classId`),`classId`,'catalog class has no externalId','delete row' FROM `teacher_classes` WHERE `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'teacher_series','series',CONCAT(`teacherProfileId`,':',`seriesId`),`seriesId`,'catalog series has no externalId','delete row' FROM `teacher_series` WHERE `seriesExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'teacher_subjects','subject',CONCAT(`teacherProfileId`,':',`subjectId`),`subjectId`,'catalog subject has no externalId','delete row' FROM `teacher_subjects` WHERE `subjectExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'student_subjects','subject',CONCAT(`studentProfileId`,':',`subjectId`),`subjectId`,'catalog subject has no externalId','delete row' FROM `student_subjects` WHERE `subjectExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessment_chapters','chapter',CONCAT(`assessmentId`,':',`chapterId`),`chapterId`,'catalog chapter has no externalId','delete row' FROM `assessment_chapters` WHERE `chapterExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quiz_chapters','chapter',CONCAT(`quizId`,':',`chapterId`),`chapterId`,'catalog chapter has no externalId','delete row' FROM `quiz_chapters` WHERE `chapterExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'assessment_assigned_classes','class',CONCAT(`assessmentId`,':',`classId`),`classId`,'catalog class has no externalId','delete row' FROM `assessment_assigned_classes` WHERE `classExternalId` IS NULL;
INSERT INTO `_catalog_migration_report` (`entity`,`dimension`,`rowKey`,`localId`,`reason`,`action`)
  SELECT 'quiz_assigned_classes','class',CONCAT(`quizId`,':',`classId`),`classId`,'catalog class has no externalId','delete row' FROM `quiz_assigned_classes` WHERE `classExternalId` IS NULL;

-- 5) Delete unmappable join rows (already logged above) -----------------------
DELETE FROM `student_books`               WHERE `bookExternalId`    IS NULL;
DELETE FROM `teacher_books`               WHERE `bookExternalId`    IS NULL;
DELETE FROM `teacher_classes`             WHERE `classExternalId`   IS NULL;
DELETE FROM `teacher_series`              WHERE `seriesExternalId`  IS NULL;
DELETE FROM `teacher_subjects`            WHERE `subjectExternalId` IS NULL;
DELETE FROM `student_subjects`            WHERE `subjectExternalId` IS NULL;
DELETE FROM `assessment_chapters`         WHERE `chapterExternalId` IS NULL;
DELETE FROM `quiz_chapters`               WHERE `chapterExternalId` IS NULL;
DELETE FROM `assessment_assigned_classes` WHERE `classExternalId`   IS NULL;
DELETE FROM `quiz_assigned_classes`       WHERE `classExternalId`   IS NULL;

-- 6) Drop foreign keys --------------------------------------------------------
ALTER TABLE `assessment_assigned_classes` DROP FOREIGN KEY `assessment_assigned_classes_classId_fkey`;
ALTER TABLE `assessment_chapters` DROP FOREIGN KEY `assessment_chapters_chapterId_fkey`;
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_boardId_fkey`;
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_bookId_fkey`;
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_classId_fkey`;
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_subjectId_fkey`;
ALTER TABLE `boards` DROP FOREIGN KEY `boards_publicationId_fkey`;
ALTER TABLE `books` DROP FOREIGN KEY `books_boardId_fkey`;
ALTER TABLE `books` DROP FOREIGN KEY `books_classId_fkey`;
ALTER TABLE `books` DROP FOREIGN KEY `books_publicationId_fkey`;
ALTER TABLE `books` DROP FOREIGN KEY `books_seriesId_fkey`;
ALTER TABLE `books` DROP FOREIGN KEY `books_subjectId_fkey`;
ALTER TABLE `chapters` DROP FOREIGN KEY `chapters_bookId_fkey`;
ALTER TABLE `questions` DROP FOREIGN KEY `questions_bookId_fkey`;
ALTER TABLE `questions` DROP FOREIGN KEY `questions_chapterId_fkey`;
ALTER TABLE `questions` DROP FOREIGN KEY `questions_classId_fkey`;
ALTER TABLE `questions` DROP FOREIGN KEY `questions_subjectId_fkey`;
ALTER TABLE `quiz_assigned_classes` DROP FOREIGN KEY `quiz_assigned_classes_classId_fkey`;
ALTER TABLE `quiz_chapters` DROP FOREIGN KEY `quiz_chapters_chapterId_fkey`;
ALTER TABLE `quizzes` DROP FOREIGN KEY `quizzes_boardId_fkey`;
ALTER TABLE `quizzes` DROP FOREIGN KEY `quizzes_bookId_fkey`;
ALTER TABLE `quizzes` DROP FOREIGN KEY `quizzes_classId_fkey`;
ALTER TABLE `quizzes` DROP FOREIGN KEY `quizzes_seriesId_fkey`;
ALTER TABLE `quizzes` DROP FOREIGN KEY `quizzes_subjectId_fkey`;
ALTER TABLE `series` DROP FOREIGN KEY `series_publicationId_fkey`;
ALTER TABLE `student_books` DROP FOREIGN KEY `student_books_bookId_fkey`;
ALTER TABLE `student_profiles` DROP FOREIGN KEY `student_profiles_boardId_fkey`;
ALTER TABLE `student_profiles` DROP FOREIGN KEY `student_profiles_classId_fkey`;
ALTER TABLE `student_profiles` DROP FOREIGN KEY `student_profiles_seriesId_fkey`;
ALTER TABLE `student_subjects` DROP FOREIGN KEY `student_subjects_subjectId_fkey`;
ALTER TABLE `teacher_books` DROP FOREIGN KEY `teacher_books_bookId_fkey`;
ALTER TABLE `teacher_classes` DROP FOREIGN KEY `teacher_classes_classId_fkey`;
ALTER TABLE `teacher_profiles` DROP FOREIGN KEY `teacher_profiles_boardId_fkey`;
ALTER TABLE `teacher_series` DROP FOREIGN KEY `teacher_series_seriesId_fkey`;
ALTER TABLE `teacher_subjects` DROP FOREIGN KEY `teacher_subjects_subjectId_fkey`;

-- 7) Drop stale indexes -------------------------------------------------------
DROP INDEX `assessment_assigned_classes_classId_fkey` ON `assessment_assigned_classes`;
DROP INDEX `assessment_chapters_chapterId_fkey` ON `assessment_chapters`;
DROP INDEX `assessments_boardId_idx` ON `assessments`;
DROP INDEX `assessments_bookId_fkey` ON `assessments`;
DROP INDEX `assessments_classId_idx` ON `assessments`;
DROP INDEX `assessments_subjectId_idx` ON `assessments`;
DROP INDEX `questions_bookId_idx` ON `questions`;
DROP INDEX `questions_chapterId_idx` ON `questions`;
DROP INDEX `questions_classId_idx` ON `questions`;
DROP INDEX `questions_externalId_key` ON `questions`;
DROP INDEX `questions_subjectId_idx` ON `questions`;
DROP INDEX `quiz_assigned_classes_classId_fkey` ON `quiz_assigned_classes`;
DROP INDEX `quiz_chapters_chapterId_fkey` ON `quiz_chapters`;
DROP INDEX `quizzes_boardId_fkey` ON `quizzes`;
DROP INDEX `quizzes_bookId_fkey` ON `quizzes`;
DROP INDEX `quizzes_classId_idx` ON `quizzes`;
DROP INDEX `quizzes_seriesId_fkey` ON `quizzes`;
DROP INDEX `quizzes_subjectId_fkey` ON `quizzes`;
DROP INDEX `student_books_bookId_fkey` ON `student_books`;
DROP INDEX `student_profiles_boardId_idx` ON `student_profiles`;
DROP INDEX `student_profiles_classId_idx` ON `student_profiles`;
DROP INDEX `student_profiles_seriesId_fkey` ON `student_profiles`;
DROP INDEX `student_subjects_subjectId_fkey` ON `student_subjects`;
DROP INDEX `teacher_books_bookId_fkey` ON `teacher_books`;
DROP INDEX `teacher_classes_classId_fkey` ON `teacher_classes`;
DROP INDEX `teacher_profiles_boardId_idx` ON `teacher_profiles`;
DROP INDEX `teacher_series_seriesId_fkey` ON `teacher_series`;
DROP INDEX `teacher_subjects_subjectId_fkey` ON `teacher_subjects`;

-- 8) Finalize join tables (drop old col, make new col NOT NULL, rebuild PK) ---
ALTER TABLE `assessment_assigned_classes` DROP PRIMARY KEY, DROP COLUMN `classId`,
    MODIFY `classExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`assessmentId`, `classExternalId`);
ALTER TABLE `assessment_chapters` DROP PRIMARY KEY, DROP COLUMN `chapterId`,
    MODIFY `chapterExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`assessmentId`, `chapterExternalId`);
ALTER TABLE `quiz_assigned_classes` DROP PRIMARY KEY, DROP COLUMN `classId`,
    MODIFY `classExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`quizId`, `classExternalId`);
ALTER TABLE `quiz_chapters` DROP PRIMARY KEY, DROP COLUMN `chapterId`,
    MODIFY `chapterExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`quizId`, `chapterExternalId`);
ALTER TABLE `student_books` DROP PRIMARY KEY, DROP COLUMN `bookId`,
    MODIFY `bookExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`studentProfileId`, `bookExternalId`);
ALTER TABLE `student_subjects` DROP PRIMARY KEY, DROP COLUMN `subjectId`,
    MODIFY `subjectExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`studentProfileId`, `subjectExternalId`);
ALTER TABLE `teacher_books` DROP PRIMARY KEY, DROP COLUMN `bookId`,
    MODIFY `bookExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`teacherProfileId`, `bookExternalId`);
ALTER TABLE `teacher_classes` DROP PRIMARY KEY, DROP COLUMN `classId`,
    MODIFY `classExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`teacherProfileId`, `classExternalId`);
ALTER TABLE `teacher_series` DROP PRIMARY KEY, DROP COLUMN `seriesId`,
    MODIFY `seriesExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`teacherProfileId`, `seriesExternalId`);
ALTER TABLE `teacher_subjects` DROP PRIMARY KEY, DROP COLUMN `subjectId`,
    MODIFY `subjectExternalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`teacherProfileId`, `subjectExternalId`);

-- 9) Drop old main-table columns ---------------------------------------------
ALTER TABLE `questions` DROP COLUMN `bookId`, DROP COLUMN `chapterId`, DROP COLUMN `classId`,
    DROP COLUMN `externalId`, DROP COLUMN `sourceUpdatedAt`, DROP COLUMN `subjectId`;
ALTER TABLE `assessments` DROP COLUMN `boardId`, DROP COLUMN `bookId`, DROP COLUMN `classId`, DROP COLUMN `subjectId`;
ALTER TABLE `quizzes` DROP COLUMN `boardId`, DROP COLUMN `bookId`, DROP COLUMN `classId`, DROP COLUMN `seriesId`, DROP COLUMN `subjectId`;
ALTER TABLE `student_profiles` DROP COLUMN `boardId`, DROP COLUMN `classId`, DROP COLUMN `seriesId`;
ALTER TABLE `teacher_profiles` DROP COLUMN `boardId`;

-- 10) Drop catalog + content-sync tables -------------------------------------
DROP TABLE `content_sync_logs`;
DROP TABLE `chapters`;
DROP TABLE `books`;
DROP TABLE `boards`;
DROP TABLE `classes`;
DROP TABLE `series`;
DROP TABLE `subjects`;

-- 11) Create new external-id indexes -----------------------------------------
CREATE INDEX `assessment_assigned_classes_classExternalId_idx` ON `assessment_assigned_classes`(`classExternalId`);
CREATE INDEX `assessment_chapters_chapterExternalId_idx` ON `assessment_chapters`(`chapterExternalId`);
CREATE INDEX `assessments_subjectExternalId_idx` ON `assessments`(`subjectExternalId`);
CREATE INDEX `assessments_boardExternalId_idx` ON `assessments`(`boardExternalId`);
CREATE INDEX `assessments_classExternalId_idx` ON `assessments`(`classExternalId`);
CREATE INDEX `assessments_bookExternalId_idx` ON `assessments`(`bookExternalId`);
CREATE INDEX `questions_subjectExternalId_idx` ON `questions`(`subjectExternalId`);
CREATE INDEX `questions_bookExternalId_idx` ON `questions`(`bookExternalId`);
CREATE INDEX `questions_chapterExternalId_idx` ON `questions`(`chapterExternalId`);
CREATE INDEX `questions_classExternalId_idx` ON `questions`(`classExternalId`);
CREATE INDEX `quiz_assigned_classes_classExternalId_idx` ON `quiz_assigned_classes`(`classExternalId`);
CREATE INDEX `quiz_chapters_chapterExternalId_idx` ON `quiz_chapters`(`chapterExternalId`);
CREATE INDEX `quizzes_classExternalId_idx` ON `quizzes`(`classExternalId`);
CREATE INDEX `quizzes_boardExternalId_idx` ON `quizzes`(`boardExternalId`);
CREATE INDEX `quizzes_bookExternalId_idx` ON `quizzes`(`bookExternalId`);
CREATE INDEX `quizzes_seriesExternalId_idx` ON `quizzes`(`seriesExternalId`);
CREATE INDEX `quizzes_subjectExternalId_idx` ON `quizzes`(`subjectExternalId`);
CREATE INDEX `student_books_bookExternalId_idx` ON `student_books`(`bookExternalId`);
CREATE INDEX `student_profiles_boardExternalId_idx` ON `student_profiles`(`boardExternalId`);
CREATE INDEX `student_profiles_classExternalId_idx` ON `student_profiles`(`classExternalId`);
CREATE INDEX `student_profiles_seriesExternalId_idx` ON `student_profiles`(`seriesExternalId`);
CREATE INDEX `student_subjects_subjectExternalId_idx` ON `student_subjects`(`subjectExternalId`);
CREATE INDEX `teacher_books_bookExternalId_idx` ON `teacher_books`(`bookExternalId`);
CREATE INDEX `teacher_classes_classExternalId_idx` ON `teacher_classes`(`classExternalId`);
CREATE INDEX `teacher_profiles_boardExternalId_idx` ON `teacher_profiles`(`boardExternalId`);
CREATE INDEX `teacher_series_seriesExternalId_idx` ON `teacher_series`(`seriesExternalId`);
CREATE INDEX `teacher_subjects_subjectExternalId_idx` ON `teacher_subjects`(`subjectExternalId`);
