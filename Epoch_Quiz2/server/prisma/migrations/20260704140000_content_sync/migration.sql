-- externalId (SDK stable id) on every synced catalog/content table
ALTER TABLE `boards`   ADD COLUMN `externalId` VARCHAR(191) NULL;
ALTER TABLE `series`   ADD COLUMN `externalId` VARCHAR(191) NULL;
ALTER TABLE `classes`  ADD COLUMN `externalId` VARCHAR(191) NULL;
ALTER TABLE `subjects` ADD COLUMN `externalId` VARCHAR(191) NULL;
ALTER TABLE `books`    ADD COLUMN `externalId` VARCHAR(191) NULL, ADD COLUMN `sourceUpdatedAt` DATETIME(3) NULL;
ALTER TABLE `chapters` ADD COLUMN `externalId` VARCHAR(191) NULL, ADD COLUMN `sourceUpdatedAt` DATETIME(3) NULL;
ALTER TABLE `questions`ADD COLUMN `externalId` VARCHAR(191) NULL, ADD COLUMN `sourceUpdatedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `boards_externalId_key`    ON `boards`(`externalId`);
CREATE UNIQUE INDEX `series_externalId_key`    ON `series`(`externalId`);
CREATE UNIQUE INDEX `classes_externalId_key`   ON `classes`(`externalId`);
CREATE UNIQUE INDEX `subjects_externalId_key`  ON `subjects`(`externalId`);
CREATE UNIQUE INDEX `books_externalId_key`     ON `books`(`externalId`);
CREATE UNIQUE INDEX `chapters_externalId_key`  ON `chapters`(`externalId`);
CREATE UNIQUE INDEX `questions_externalId_key` ON `questions`(`externalId`);

CREATE TABLE `content_sync_logs` (
    `id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    `status` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RUNNING',
    `trigger` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `inserted` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `stats` LONGTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
    `error` TEXT COLLATE utf8mb4_unicode_ci NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `content_sync_logs_status_idx`(`status`),
    INDEX `content_sync_logs_startedAt_idx`(`startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
