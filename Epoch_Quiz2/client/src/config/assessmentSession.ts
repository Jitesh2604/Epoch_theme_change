/**
 * 2026 Assessment Session cutoff. At and after this moment, students can no
 * longer browse or start assessments anywhere in the Student Dashboard —
 * they're shown a "session is over" screen with a Practice Olympiad link
 * instead. See `SessionOverScreen` (dashboards/shared/SessionOverScreen.tsx)
 * for the screen itself and everywhere it's used.
 *
 * To switch between testing and production, comment out one block and
 * uncomment the other. The PRODUCTION value must always be a fixed,
 * static timestamp (never computed relative to `Date.now()`), since this
 * module only evaluates once per full page load — a dynamic value would
 * silently drift/reset on every reload instead of staying fixed. The
 * TESTING option below is the one place that's intentionally dynamic,
 * for quick manual smoke-testing.
 */

// ── PRODUCTION — November 1, 2026, 12:00 AM UTC ──
export const SESSION_END_DATE = new Date('2026-11-01T00:00:00Z');

// ── TESTING — uncomment this and comment out the PRODUCTION line above to
//    verify the session-over screen ~5 minutes after the next page load,
//    without waiting until November. Note: a hard refresh resets the
//    5-minute window, since it re-evaluates this module. ──
// export const SESSION_END_DATE = new Date(Date.now() + 5 * 60 * 1000);
