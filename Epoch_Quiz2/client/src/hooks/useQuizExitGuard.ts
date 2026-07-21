import { useEffect, useRef, useState, useCallback } from 'react';

interface UseQuizExitGuardOptions {
  /** Guard is only active while a quiz is actually in progress (loaded, not mid-submit). */
  active: boolean;
  /**
   * Called once the student confirms they want to leave (or clicks Pause,
   * which reuses this same routine). Must save whatever progress needs
   * saving; the page itself is responsible for navigating away afterwards
   * unless a same-origin link click triggered the guard, in which case that
   * link's href is followed once this resolves.
   */
  onConfirmLeave: () => void | Promise<void>;
}

/**
 * Guards against every way a student can accidentally leave an in-progress
 * quiz: browser Back, refresh/tab close, and in-app navigation clicks
 * (sidebar links on the dashboard, nav links on the marketing site). All
 * four converge on the same confirm modal and the same onConfirmLeave save
 * routine — see AssessmentTakePage / PracticePlayPage / OlympiadPlayPage.
 */
export function useQuizExitGuard({ active, onConfirmLeave }: UseQuizExitGuardOptions) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);
  const leavingRef   = useRef(false);

  // Refresh / tab close — the browser's own dialog; custom text is ignored
  // by every modern browser, this is a platform limitation, not ours to fix.
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Once the student has already confirmed leaving via our own modal,
      // confirmLeaveNow may trigger a real navigation (following an
      // intercepted link's href) — don't show the browser's redundant
      // "leave site?" dialog on top of the confirmation we just got.
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  // Browser Back button — push a sentinel history entry; if it's popped,
  // push it right back (cancelling the effective navigation) and show our
  // modal instead. Works for both the RRD BrowserRouter and the hash router,
  // since hash changes also produce popstate events.
  useEffect(() => {
    if (!active) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      if (leavingRef.current) return;
      window.history.pushState(null, '', window.location.href);
      pendingHref.current = null;
      setConfirmOpen(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [active]);

  // In-app link clicks — sidebar nav (dashboard) and nav bar (marketing
  // site) both render real <a> tags, so a capture-phase click listener
  // intercepts either regardless of which router is in play.
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (leavingRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      let url: URL;
      try { url = new URL(anchor.href, window.location.origin); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (anchor.href === window.location.href) return;
      e.preventDefault();
      e.stopPropagation();
      pendingHref.current = anchor.href;
      setConfirmOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active]);

  const requestLeave = useCallback(() => {
    pendingHref.current = null;
    setConfirmOpen(true);
  }, []);

  const stay = useCallback(() => setConfirmOpen(false), []);

  const confirmLeaveNow = useCallback(async () => {
    leavingRef.current = true;
    setConfirmOpen(false);
    await onConfirmLeave();
    if (pendingHref.current) window.location.href = pendingHref.current;
  }, [onConfirmLeave]);

  return { confirmOpen, requestLeave, stay, confirmLeaveNow };
}
