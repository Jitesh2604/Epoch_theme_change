import { useCallback, useEffect, useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { RoleSelectionPage } from './RoleSelectionPage';
import { AdminDashboard } from './admin/AdminDashboard';
import { MyAssessmentsPage } from './student/pages/MyAssessmentsPage';
import { AssessmentOverviewPage } from './student/pages/AssessmentOverviewPage';
import { AssessmentTakePage } from './student/pages/AssessmentTakePage';
import { AssessmentResultPage } from './student/pages/AssessmentResultPage';
import { ResultsPage } from './student/pages/ResultsPage';
import { AnalyticsPage } from './student/pages/AnalyticsPage';
import { PracticeReviewPage } from './student/pages/PracticeReviewPage';
import { LeaderboardPage } from './student/pages/LeaderboardPage';
import { ProfilePage } from './student/pages/ProfilePage';
import { RequireRole } from './shared/RequireRole';
import { getRole, pathForRole, signOut } from './shared/auth';
import { refreshSession, getRefreshToken } from '../lib/authStore';
import { NavBar } from '../components/layout/NavBar';

/**
 * The same top NavBar shown on the marketing-site root (Home, Play Olympiad,
 * FAQ) — reused here so students see one consistent navbar across the whole
 * app, not just a brand-only header. NavBar's own Assessment/Results/
 * Analytics/Leaderboard/Profile links already use real `<a href>`s (not the
 * hash-router's navigate()) since those routes live in this separate
 * DashboardApp root — see NavBar.tsx's "Cross-app hard navigation" comments.
 * `navigate` here covers the remaining links (Home, Play Olympiad, FAQ,
 * About, Contact, Login, Sign up, and the logout redirect), which need a
 * real navigation back to the marketing-site root the same way, since a
 * hash change alone wouldn't unmount this root.
 *
 * Deliberately NOT applied to the exam-taking route itself
 * (/assessment/take/:submissionId, see the Routes tree below) — that page
 * stays completely chrome-free for a distraction-free exam, the same way
 * Practice/Olympiad's exam-mode hides the marketing-site NavBar only while
 * `phase === 'playing'` (see useExamMode.ts).
 */
function StudentLayout() {
  const { pathname } = useLocation();
  const navigate = useCallback((path: string) => { window.location.href = '/#/' + path; }, []);
  return (
    <>
      <NavBar route={pathname.replace(/^\//, '')} navigate={navigate} />
      <Outlet />
    </>
  );
}

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[Dashboard] Render error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg text-fg1 grid place-items-center px-6">
          <div className="max-w-sm text-center space-y-3">
            <h2 className="font-display font-semibold text-[20px]">Something went wrong</h2>
            <p className="text-[13px] text-fg2">{(this.state.error as Error).message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-brand text-brand-ink text-[13px] font-semibold">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RootFallback() {
  const role = getRole();
  // The Teacher role was removed and has no route; clear any stale
  // locally-stored 'teacher' value (from before the removal) instead of
  // redirect-looping. Compared as a string since the Role type itself no
  // longer includes 'teacher' — a real browser's localStorage isn't bound
  // by that type at runtime.
  if ((role as string) === 'teacher') {
    signOut();
    return <Navigate to="/select-role" replace />;
  }
  return <Navigate to={role ? pathForRole(role) : '/select-role'} replace />;
}

export function DashboardApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem('epoch-theme') ?? 'dark';
    document.documentElement.classList.toggle('theme-light', theme === 'light');

    // Always attempt session restore when there is a refresh token.
    // Do NOT gate this on loadUser() — epoch-user can be absent (e.g. after
    // the previous refreshSession bug cleared it) while epoch-refresh-token
    // is still valid. Without this, the access token is never restored and
    // every API call fires without an Authorization header → 401.
    if (getRefreshToken()) {
      refreshSession()
        .catch(() => { /* clearTokens already called inside refreshSession */ })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  if (!ready) return null;

  return (
    <DashboardErrorBoundary>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/select-role" element={<RoleSelectionPage />} />
        <Route path="/admin/*"   element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />

        {/* There is no Student Dashboard — these are flat, top-level
            standalone routes (not nested under a "/student" prefix, which
            would itself imply a dashboard area), not DashboardLayout's
            sidebar/topbar. All but the exam-taking screen itself render
            under StudentLayout, which shows the same top NavBar as the
            marketing-site root — see StudentLayout above. /assessment is
            the restored My Assessments list (Available/Completed tabs) —
            students pick an assessment here rather than being
            auto-redirected into the single current one. */}
        <Route element={<RequireRole role="student"><Outlet /></RequireRole>}>
          {/* No navbar during the exam itself — distraction-free, same
              principle as Practice/Olympiad's exam-mode hiding (see
              StudentLayout's doc comment above). */}
          <Route path="/assessment/take/:submissionId" element={<AssessmentTakePage />} />

          <Route element={<StudentLayout />}>
            <Route path="/assessment"                     element={<MyAssessmentsPage />} />
            <Route path="/assessment/:assessmentId"        element={<AssessmentOverviewPage />} />
            <Route path="/assessment/result/:submissionId" element={<AssessmentResultPage />} />
            <Route path="/results"     element={<ResultsPage />} />
            <Route path="/analytics"   element={<AnalyticsPage />} />
            <Route path="/review/:attemptId" element={<PracticeReviewPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/profile"     element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<RootFallback />} />
      </Routes>
    </BrowserRouter>
    </DashboardErrorBoundary>
  );
}
