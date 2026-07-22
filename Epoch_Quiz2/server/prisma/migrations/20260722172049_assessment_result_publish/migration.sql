ALTER TABLE `assessments`
  ADD COLUMN `resultsPublished` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `resultPublishAt` DATETIME(3) NULL;
