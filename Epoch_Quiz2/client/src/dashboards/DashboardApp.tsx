import { useEffect, useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { RoleSelectionPage } from './RoleSelectionPage';
import { AdminDashboard } from './admin/AdminDashboard';
// Teacher module is temporarily hidden — see DashboardApp route below.
// import { TeacherDashboard } from './teacher/TeacherDashboard';
import { AssessmentEntryPage } from './student/pages/AssessmentEntryPage';
import { AssessmentOverviewPage } from './student/pages/AssessmentOverviewPage';
import { AssessmentTakePage } from './student/pages/AssessmentTakePage';
import { AssessmentResultPage } from './student/pages/AssessmentResultPage';
import { ResultsPage } from './student/pages/ResultsPage';
import { LeaderboardPage } from './student/pages/LeaderboardPage';
import { ProfilePage } from './student/pages/ProfilePage';
import { RequireRole } from './shared/RequireRole';
import { getRole, pathForRole, signOut } from './shared/auth';
import { refreshSession, getRefreshToken } from '../lib/authStore';

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
  // Teacher module is hidden and has no route; clear any stale locally-stored
  // 'teacher' role (e.g. from before this change) instead of redirect-looping.
  if (role === 'teacher') {
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
        {/* Teacher module is temporarily hidden — re-add this route (and the
            TeacherDashboard import above) to bring it back. */}
        {/* <Route path="/teacher/*" element={<RequireRole role="teacher"><TeacherDashboard /></RequireRole>} /> */}

        {/* There is no Student Dashboard — these are flat, top-level
            standalone routes (not nested under a "/student" prefix, which
            would itself imply a dashboard area). Each renders its own
            minimal shell (StandaloneHeader, or nothing at all for the exam
            itself) instead of DashboardLayout's sidebar/topbar. Reachable
            from the main site navbar's Assessment/Results/Leaderboard
            links and the profile menu's Profile link — see NavBar.tsx. */}
        <Route element={<RequireRole role="student"><Outlet /></RequireRole>}>
          <Route path="/assessment"                     element={<AssessmentEntryPage />} />
          <Route path="/assessment/:assessmentId"        element={<AssessmentOverviewPage />} />
          <Route path="/assessment/take/:submissionId"   element={<AssessmentTakePage />} />
          <Route path="/assessment/result/:submissionId" element={<AssessmentResultPage />} />
          <Route path="/results"     element={<ResultsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile"     element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<RootFallback />} />
      </Routes>
    </BrowserRouter>
    </DashboardErrorBoundary>
  );
}
