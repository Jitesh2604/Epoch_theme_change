-- Profile avatars are stored as base64 data URLs (up to ~3.5MB); varchar(191)
-- is far too small. Widen to MEDIUMTEXT.
ALTER TABLE `student_profiles` MODIFY `imageUrl` MEDIUMTEXT NULL;
ALTER TABLE `teacher_profiles` MODIFY `imageUrl` MEDIUMTEXT NULL;
