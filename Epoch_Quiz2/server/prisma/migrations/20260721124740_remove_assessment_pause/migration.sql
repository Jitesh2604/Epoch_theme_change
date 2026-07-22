-- Removes the Assessment-side pause/resume columns. The pause feature has
-- been removed from the Assessment flow; Practice/Olympiad's equivalent
-- columns on quiz_attempts are untouched.
ALTER TABLE `submissions`
    DROP COLUMN `currentQuestionIndex`,
    DROP COLUMN `pausedAt`,
    DROP COLUMN `totalPausedSec`;
