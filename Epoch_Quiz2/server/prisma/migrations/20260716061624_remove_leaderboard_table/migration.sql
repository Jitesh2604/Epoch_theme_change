/*
  Warnings:

  - You are about to drop the `leaderboard` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `leaderboard` DROP FOREIGN KEY `leaderboard_attemptId_fkey`;

-- DropForeignKey
ALTER TABLE `leaderboard` DROP FOREIGN KEY `leaderboard_quizId_fkey`;

-- DropForeignKey
ALTER TABLE `leaderboard` DROP FOREIGN KEY `leaderboard_studentId_fkey`;

-- DropTable
DROP TABLE `leaderboard`;
