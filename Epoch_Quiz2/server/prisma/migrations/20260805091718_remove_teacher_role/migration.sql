-- DropForeignKey
ALTER TABLE `teacher_books` DROP FOREIGN KEY `teacher_books_teacherProfileId_fkey`;

-- DropForeignKey
ALTER TABLE `teacher_classes` DROP FOREIGN KEY `teacher_classes_teacherProfileId_fkey`;

-- DropForeignKey
ALTER TABLE `teacher_profiles` DROP FOREIGN KEY `teacher_profiles_userId_fkey`;

-- DropForeignKey
ALTER TABLE `teacher_series` DROP FOREIGN KEY `teacher_series_teacherProfileId_fkey`;

-- DropForeignKey
ALTER TABLE `teacher_subjects` DROP FOREIGN KEY `teacher_subjects_teacherProfileId_fkey`;

-- AlterTable
ALTER TABLE `student_profiles` DROP COLUMN `teacherCode`;

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'PUBLICATION_ADMIN', 'CONTENT_MANAGER', 'STUDENT') NOT NULL;

-- DropTable
DROP TABLE `teacher_books`;

-- DropTable
DROP TABLE `teacher_classes`;

-- DropTable
DROP TABLE `teacher_profiles`;

-- DropTable
DROP TABLE `teacher_series`;

-- DropTable
DROP TABLE `teacher_subjects`;

