-- Removes the legacy `categories` table. Subjects (and the Practice/Attempt
-- Olympiad modes) are no longer cached locally: real subjects come live from
-- the Content API on every request, and the Olympiad modes live in
-- `olympiad_modes`. This table duplicated that concept with two stale rows
-- and was only read by the client's now-removed `useCategories` hook.
DROP TABLE IF EXISTS `categories`;
