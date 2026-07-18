/*
  Data fix: `language` was written inconsistently across code paths —
  manual question creation used 'ENGLISH' while the Content API sync,
  seed script, and the column's own schema default all use 'English'.
  Normalize every case-insensitive match for "english" (in any of the
  three tables carrying this column) to the single canonical value.
*/

UPDATE `questions`
SET `language` = 'English'
WHERE `language` IS NOT NULL
  AND LOWER(`language`) = 'english'
  AND `language` <> 'English';

UPDATE `assessments`
SET `language` = 'English'
WHERE `language` IS NOT NULL
  AND LOWER(`language`) = 'english'
  AND `language` <> 'English';

UPDATE `quizzes`
SET `language` = 'English'
WHERE `language` IS NOT NULL
  AND LOWER(`language`) = 'english'
  AND `language` <> 'English';
