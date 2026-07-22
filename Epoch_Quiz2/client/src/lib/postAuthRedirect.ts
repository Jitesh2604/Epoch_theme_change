/**
 * "Where was the user trying to go before we sent them to log in?" — shared
 * by both the marketing hash-router app (App.tsx's PlayGate) and the
 * dashboard react-router-dom app (RequireRole), since a single Vite bundle
 * mounts both. Login/Signup default to Home when nothing is pending; this
 * is the only way either page ends up somewhere else.
 *
 * A pending value is one of:
 *   - a marketing hash-route fragment, e.g. "#/play/quiz/123"
 *   - a real dashboard-app path, e.g. "/profile" or "/assessment"
 * The two are unambiguous by prefix, so consuming picks the right kind of
 * navigation (hash assignment vs a full path) without needing a separate flag.
 */

const KEY = 'epoch-after-auth';

export function rememberPostAuthTarget(target: string) {
  localStorage.setItem(KEY, target);
}

/**
 * Call once, right after a successful login/signup. Performs the redirect
 * itself and returns true if there was a pending target; returns false (and
 * does nothing) if there wasn't, so the caller knows to fall back to Home.
 */
export function consumePostAuthRedirect(): boolean {
  const pending = localStorage.getItem(KEY);
  if (!pending) return false;
  localStorage.removeItem(KEY);
  if (pending.startsWith('#')) {
    window.location.hash = pending;
  } else {
    window.location.href = pending;
  }
  return true;
}
