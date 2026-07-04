-- Student ↔ Subjects (many-to-many): the subjects a student studies.
CREATE TABLE `student_subjects` (
    `studentProfileId` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    `subjectId` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    PRIMARY KEY (`studentProfileId`, `subjectId`),
    KEY `student_subjects_subjectId_fkey` (`subjectId`),
    CONSTRAINT `student_subjects_studentProfileId_fkey` FOREIGN KEY (`studentProfileId`) REFERENCES `student_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `student_subjects_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subject kind: distinguishes normal subjects from special Olympiad modes
-- without relying on list position or hardcoded ids.
ALTER TABLE `subjects` ADD COLUMN `kind` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUBJECT';
UPDATE `subjects` SET `kind` = 'PRACTICE_OLYMPIAD'  WHERE `slug` = 'practice-olympiad';
UPDATE `subjects` SET `kind` = 'ATTEMPTED_OLYMPIAD' WHERE `slug` = 'attempted-olympiad';

-- Board tag on questions, so practice/olympiad can be scoped to the student's board.
ALTER TABLE `questions` ADD COLUMN `educationBoard` VARCHAR(191) COLLATE utf8mb4_unicode_ci NULL;
