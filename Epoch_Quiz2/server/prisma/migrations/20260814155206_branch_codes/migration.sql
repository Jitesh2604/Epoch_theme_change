-- DropForeignKey
ALTER TABLE `class_codes` DROP FOREIGN KEY `class_codes_classId_fkey`;

-- DropForeignKey
ALTER TABLE `school_classes` DROP FOREIGN KEY `school_classes_branchId_fkey`;

-- DropForeignKey
ALTER TABLE `school_classes` DROP FOREIGN KEY `school_classes_schoolId_fkey`;

-- DropForeignKey
ALTER TABLE `student_class_memberships` DROP FOREIGN KEY `student_class_memberships_classId_fkey`;

-- DropForeignKey
ALTER TABLE `student_class_memberships` DROP FOREIGN KEY `student_class_memberships_studentId_fkey`;

-- AlterTable
ALTER TABLE `student_profiles` ADD COLUMN `branchVerifiedAt` DATETIME(3) NULL;

-- DropTable
DROP TABLE `class_codes`;

-- DropTable
DROP TABLE `school_classes`;

-- DropTable
DROP TABLE `student_class_memberships`;

-- CreateTable
CREATE TABLE `branch_codes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `branch_codes_code_key`(`code`),
    INDEX `branch_codes_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `branch_codes` ADD CONSTRAINT `branch_codes_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
