import {
  LayoutDashboard, KeyRound, FileText, Award, Trophy, User2,
  Zap, Home,
} from 'lucide-react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../shared/DashboardLayout';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { JoinAssessmentPage } from './pages/JoinAssessmentPage';
import { MyAssessmentsPage } from './pages/MyAssessmentsPage';
import { AssessmentOverviewPage } from './pages/AssessmentOverviewPage';
import { AssessmentTakePage } from './pages/AssessmentTakePage';
import { AssessmentResultPage } from './pages/AssessmentResultPage';
import { ResultsPage } from './pages/ResultsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { PracticeQuizPage } from './pages/PracticeQuizPage';
import { PracticePlayPage } from './pages/PracticePlayPage';
import { PracticeResultPage } from './pages/PracticeResultPage';
import { useAuth } from '../../lib/authStore';

export function StudentDashboard() {
  const user = useAuth();
  return (
    <Routes>
      <Route
        element={
          <DashboardLayout
            role="student"
            brand="Epoch Quiz"
            brandSub="Student"
            user={{
              name: user?.name ?? 'Student',
              subtitle: user?.email ?? 'Student',
              avatarHue: user?.avatarHue ?? 280,
            }}
            navItems={[
              { to: '/student',               label: 'Dashboard',       icon: LayoutDashboard },
              { to: '/student/practice',      label: 'Practice Quiz',   icon: Zap             },
              { to: '/student/join',          label: 'Join Assessment', icon: KeyRound        },
              { to: '/student/assessments',   label: 'My Assessments',  icon: FileText        },
              { to: '/student/results',       label: 'Results',         icon: Award           },
              { to: '/student/leaderboard',   label: 'Leaderboard',     icon: Trophy          },
            ]}
            footerItems={[
              { to: '/student/profile',  label: 'Profile',  icon: User2 },
              // Settings is hidden — it was only an alias for the Profile
              // page, not a distinct feature. Restore this item (and the
              // `Settings as SettingsIcon` import above) once real
              // account-settings functionality exists (password management,
              // notification preferences, privacy, language, theme, etc.).
              // { to: '/student/settings', label: 'Settings', icon: SettingsIcon },
              { to: '/', label: 'Home', icon: Home, href: '/#/home' },
            ]}
          />
        }
      >
        <Route index element={<StudentDashboardPage />} />
        <Route path="practice" element={<PracticeQuizPage />} />
        <Route path="practice/play/:attemptId" element={<PracticePlayPage />} />
        <Route path="practice/result/:attemptId" element={<PracticeResultPage />} />
        <Route path="join" element={<JoinAssessmentPage />} />
        <Route path="assessments" element={<MyAssessmentsPage />} />
        <Route path="assessment-overview/:assessmentId" element={<AssessmentOverviewPage />} />
        <Route path="take/:submissionId" element={<AssessmentTakePage />} />
        <Route path="assessment-result/:submissionId" element={<AssessmentResultPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* <Route path="settings" element={<ProfilePage />} /> — was only an
            alias for Profile, not a real Settings page. Point this at a
            dedicated StudentSettingsPage when one exists. */}
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Route>
    </Routes>
  );
}
