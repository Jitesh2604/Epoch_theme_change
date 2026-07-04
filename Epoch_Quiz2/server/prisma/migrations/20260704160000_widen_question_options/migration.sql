-- Imported content can have long MCQ option texts; varchar(191) is too small.
ALTER TABLE `questions`
  MODIFY `optionA` TEXT NULL,
  MODIFY `optionB` TEXT NULL,
  MODIFY `optionC` TEXT NULL,
  MODIFY `optionD` TEXT NULL;
