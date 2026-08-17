import { Route, Routes, Navigate } from 'react-router-dom';
import { SchoolPanelShell } from './SchoolPanelShell';
import { SchoolOverviewPage } from './pages/SchoolOverviewPage';
import { BranchManagementPage } from './pages/BranchManagementPage';
import { SchoolStudentsPage } from './pages/SchoolStudentsPage';
import { SchoolStudentDetailPage } from './pages/SchoolStudentDetailPage';
import { SchoolAssessmentsPage } from './pages/SchoolAssessmentsPage';
import { SchoolCertificatesPage } from './pages/SchoolCertificatesPage';
import { SchoolLeaderboardPage } from './pages/SchoolLeaderboardPage';
import { SchoolAnalyticsPage } from './pages/SchoolAnalyticsPage';
import { SchoolSettingsPage } from './pages/SchoolSettingsPage';
import { useAuth } from '../../lib/authStore';
import { useMyProfile } from '../../hooks/useUsers';
import { useMyBranches } from '../../hooks/useBranchCodes';
import { useSchoolDashboard } from '../../hooks/useSchoolPanel';

// School-level management dashboard — Overview/Students/Student Details/
// Assessments/Certificates/Leaderboard/Analytics/Branches/Settings, all
// mounted under a dedicated SchoolPanelShell (its own sidebar/header, not
// the Admin/Student DashboardLayout — see SchoolPanelShell.tsx). Every one
// of these routes is only ever reachable through this component, which
// DashboardApp.tsx mounts behind <RequireRole role="school">, and every API
// call they make is independently gated SCHOOL_ADMIN-only + school-scoped
// server-side (schoolPanel.routes.ts / schoolAnalytics.routes.ts /
// branchCode.routes.ts) — a student or another school's admin can never
// reach another school's data through these pages. This file only changes
// presentation/navigation; no route was removed, and no API call changed.
export function SchoolDashboard() {
  const user = useAuth();
  const { data: profile } = useMyProfile();
  const { data: branches } = useMyBranches();
  const { data: dash } = useSchoolDashboard();
  const schoolName = profile?.schoolRegistration?.schoolName ?? 'School Panel';

  return (
    <Routes>
      <Route element={<SchoolPanelShell user={{
        name: user?.name ?? 'School Admin',
        email: profile?.email ?? '',
        schoolName,
        branchCount: branches?.length ?? 0,
        studentCount: dash?.totalStudents ?? 0,
      }} />}>
        <Route index element={<SchoolOverviewPage />} />
        <Route path="students" element={<SchoolStudentsPage />} />
        <Route path="students/:id" element={<SchoolStudentDetailPage />} />
        <Route path="assessments" element={<SchoolAssessmentsPage />} />
        <Route path="certificates" element={<SchoolCertificatesPage />} />
        <Route path="leaderboard" element={<SchoolLeaderboardPage />} />
        <Route path="analytics" element={<SchoolAnalyticsPage />} />
        <Route path="branches" element={<BranchManagementPage />} />
        <Route path="settings" element={<SchoolSettingsPage />} />
        {/* "results" kept as a redirect — Results is now folded into the
            richer Assessments page (real per-assessment aggregates instead
            of a flat submission list); no functionality was dropped, every
            submission row is still reachable from there or a student's own
            Results tab. */}
        <Route path="results" element={<Navigate to="/school/assessments" replace />} />
        <Route path="*" element={<Navigate to="/school" replace />} />
      </Route>
    </Routes>
  );
}
