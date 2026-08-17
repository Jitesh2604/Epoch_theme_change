-- DropForeignKey
ALTER TABLE `school_registrations` DROP FOREIGN KEY `school_registrations_branchId_fkey`;

-- AlterTable
ALTER TABLE `school_branches` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `city` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `school_registrations` MODIFY `branchId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `school_registrations` ADD CONSTRAINT `school_registrations_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
