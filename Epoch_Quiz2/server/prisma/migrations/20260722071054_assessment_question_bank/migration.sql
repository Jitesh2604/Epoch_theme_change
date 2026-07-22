-- Assessment gets its own, physically separate question-content table so it
-- is structurally impossible for Practice/Olympiad (which only ever queries
-- `questions`) to surface an assessment question, or vice versa. Mirrors
-- `questions`' shape exactly, minus `externalId` (that column exists only
-- for the external content-sync pipeline, which is Practice-only).

-- CreateTable
CREATE TABLE `assessment_question_bank` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE', 'FILL_IN_BLANK', 'MATCH_THE_COLUMN', 'DESCRIPTIVE') NOT NULL,
    `prompt` TEXT NOT NULL,
    `promptImageUrl` VARCHAR(191) NULL,
    `optionA` TEXT NULL,
    `optionAImageUrl` VARCHAR(191) NULL,
    `optionB` TEXT NULL,
    `optionBImageUrl` VARCHAR(191) NULL,
    `optionC` TEXT NULL,
    `optionCImageUrl` VARCHAR(191) NULL,
    `optionD` TEXT NULL,
    `optionDImageUrl` VARCHAR(191) NULL,
    `correctAnswer` VARCHAR(191) NULL,
    `correctOptions` LONGTEXT NOT NULL,
    `correctBoolean` BOOLEAN NULL,
    `modelAnswer` TEXT NULL,
    `matchPairs` LONGTEXT NULL,
    `explanation` TEXT NULL,
    `explanationImageUrl` VARCHAR(191) NULL,
    `marks` INTEGER NOT NULL DEFAULT 1,
    `negativeMarks` DOUBLE NOT NULL DEFAULT 0,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL DEFAULT 'MEDIUM',
    `language` VARCHAR(191) NULL DEFAULT 'English',
    `educationBoard` VARCHAR(191) NULL,
    `tags` LONGTEXT NOT NULL,
    `status` ENUM('ACTIVE', 'PENDING', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `subjectExternalId` VARCHAR(191) NULL,
    `classExternalId` VARCHAR(191) NULL,
    `bookExternalId` VARCHAR(191) NULL,
    `chapterExternalId` VARCHAR(191) NULL,

    INDEX `assessment_question_bank_createdById_idx`(`createdById`),
    INDEX `assessment_question_bank_type_idx`(`type`),
    INDEX `assessment_question_bank_subjectExternalId_idx`(`subjectExternalId`),
    INDEX `assessment_question_bank_difficulty_idx`(`difficulty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assessment_question_bank` ADD CONSTRAINT `assessment_question_bank_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate existing assessment-question content (today only the seeded dummy
-- questions from seed-assessments.ts) into the new table, preserving ids so
-- the FK repoint below needs no id remapping.
INSERT INTO `assessment_question_bank` (
    `id`, `type`, `prompt`, `promptImageUrl`,
    `optionA`, `optionAImageUrl`, `optionB`, `optionBImageUrl`,
    `optionC`, `optionCImageUrl`, `optionD`, `optionDImageUrl`,
    `correctAnswer`, `correctOptions`, `correctBoolean`, `modelAnswer`, `matchPairs`,
    `explanation`, `explanationImageUrl`, `marks`, `negativeMarks`, `difficulty`,
    `language`, `educationBoard`, `tags`, `status`, `createdById`, `createdAt`, `updatedAt`,
    `subjectExternalId`, `classExternalId`, `bookExternalId`, `chapterExternalId`
)
SELECT
    `id`, `type`, `prompt`, `promptImageUrl`,
    `optionA`, `optionAImageUrl`, `optionB`, `optionBImageUrl`,
    `optionC`, `optionCImageUrl`, `optionD`, `optionDImageUrl`,
    `correctAnswer`, `correctOptions`, `correctBoolean`, `modelAnswer`, `matchPairs`,
    `explanation`, `explanationImageUrl`, `marks`, `negativeMarks`, `difficulty`,
    `language`, `educationBoard`, `tags`, `status`, `createdById`, `createdAt`, `updatedAt`,
    `subjectExternalId`, `classExternalId`, `bookExternalId`, `chapterExternalId`
FROM `questions`
WHERE `id` IN (
    SELECT DISTINCT `questionId` FROM `assessment_questions`
    UNION
    SELECT DISTINCT `questionId` FROM `answers`
);

-- Repoint assessment_questions.questionId from questions -> assessment_question_bank
ALTER TABLE `assessment_questions` DROP FOREIGN KEY `assessment_questions_questionId_fkey`;
ALTER TABLE `assessment_questions` ADD CONSTRAINT `assessment_questions_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `assessment_question_bank`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Repoint answers.questionId from questions -> assessment_question_bank
ALTER TABLE `answers` DROP FOREIGN KEY `answers_questionId_fkey`;
ALTER TABLE `answers` ADD CONSTRAINT `answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `assessment_question_bank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The original rows are intentionally left in `questions` (harmless leftovers
-- — not returned by any Practice/Olympiad query since nothing there matches
-- their subjectExternalId: null seeding convention). No destructive delete.
