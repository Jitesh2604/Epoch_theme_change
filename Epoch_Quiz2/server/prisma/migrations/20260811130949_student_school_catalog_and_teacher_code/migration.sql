-- AlterTable
ALTER TABLE `student_profiles` ADD COLUMN `branchId` VARCHAR(191) NULL,
    ADD COLUMN `schoolId` VARCHAR(191) NULL,
    ADD COLUMN `teacherCode` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `student_profiles_schoolId_idx` ON `student_profiles`(`schoolId`);

-- CreateIndex
CREATE INDEX `student_profiles_branchId_idx` ON `student_profiles`(`branchId`);

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `school_branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
