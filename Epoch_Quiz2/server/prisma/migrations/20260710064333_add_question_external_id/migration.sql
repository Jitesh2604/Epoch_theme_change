-- AlterTable
ALTER TABLE `questions` ADD COLUMN `externalId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `questions_externalId_key` ON `questions`(`externalId`);
