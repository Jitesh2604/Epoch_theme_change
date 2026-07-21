-- AlterTable
ALTER TABLE `attempt_answers` ADD COLUMN `draftSelectedOption` VARCHAR(191) NULL,
    ADD COLUMN `draftSelectedOptions` LONGTEXT NULL,
    ADD COLUMN `draftTextAnswer` TEXT NULL,
    ADD COLUMN `isSubmitted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `quiz_attempts` ADD COLUMN `currentQuestionIndex` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pausedAt` DATETIME(3) NULL,
    ADD COLUMN `totalPausedSec` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `submissions` ADD COLUMN `currentQuestionIndex` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pausedAt` DATETIME(3) NULL,
    ADD COLUMN `totalPausedSec` INTEGER NOT NULL DEFAULT 0;

-- Backfill: mark pre-existing attempt-answer rows that already carry a real
-- selection or a grading result as submitted, so in-flight attempts don't
-- appear to have lost their answers under the new isSubmitted/draft split.
-- Rows that were explicitly skipped with nothing selected are indistinguishable
-- from never-touched stub rows and are left as drafts (isSubmitted = false).
UPDATE `attempt_answers`
SET `isSubmitted` = true
WHERE `selectedOption` IS NOT NULL
   OR `selectedOptions` != '[]'
   OR `textAnswer` IS NOT NULL
   OR `isCorrect` IS NOT NULL;
