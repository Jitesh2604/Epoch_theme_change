-- DropForeignKey
ALTER TABLE `certificates` DROP FOREIGN KEY `certificates_studentId_fkey`;

-- DropIndex
DROP INDEX `certificates_studentId_certType_sessionTitle_key` ON `certificates`;

-- AlterTable
ALTER TABLE `certificates` ADD COLUMN `subjectExternalId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `certificates_studentId_certType_sessionTitle_subjectExternal_key` ON `certificates`(`studentId`, `certType`, `sessionTitle`, `subjectExternalId`);

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: `prisma migrate diff` also proposed re-adding
-- `assessment_chapters_assessmentId_fkey` here, but that constraint was
-- confirmed already present on the live database (verified via
-- information_schema.TABLE_CONSTRAINTS) — a stale/false-positive entry from
-- the diff tool, unrelated to this migration's actual purpose. Omitted.
