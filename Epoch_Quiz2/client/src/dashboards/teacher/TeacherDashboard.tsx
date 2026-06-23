import {
  LayoutDashboard, FilePlus2, FileText, BookOpen, Upload,
  Users, BarChart3, Award, User2, Settings as SettingsIcon, Home,
} from 'lucide-react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../shared/DashboardLayout';
import { useAuth } from '../../lib/authStore';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';
import { CreateAssessmentPage } from './pages/CreateAssessmentPage';
import { QuestionManagementPage } from './pages/QuestionManagementPage';
import { MyAssessmentsPage } from './pages/MyAssessmentsPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { UploadQuestionsPage } from './pages/UploadQuestionsPage';
import { StudentsPage } from './pages/StudentsPage';
import { ResultsPage } from './pages/ResultsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProfilePage } from './pages/ProfilePage';

export function TeacherDashboard() {
  const user = useAuth();
  return (
    <Routes>
      <Route
        element={
          <DashboardLayout
            role="teacher"
            brand="Epoch Quiz"
            brandSub="Teacher Console"
            user={{
              name: user?.name ?? 'Teacher',
              subtitle: user?.email ?? 'Teacher',
              avatarHue: user?.avatarHue ?? 180,
            }}
            navItems={[
              { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
              { to: '/teacher/create-assessment', label: 'Create Assessment', icon: FilePlus2 },
              { to: '/teacher/assessments', label: 'My Assessments', icon: FileText },
              { to: '/teacher/question-bank', label: 'Question Bank', icon: BookOpen },
              { to: '/teacher/upload-questions', label: 'Upload Questions', icon: Upload },
              { to: '/teacher/students', label: 'Students', icon: Users },
              { to: '/teacher/results', label: 'Results', icon: Award },
              { to: '/teacher/analytics', label: 'Analytics', icon: BarChart3 },
            ]}
            footerItems={[
              { to: '/teacher/profile', label: 'Profile', icon: User2 },
              { to: '/teacher/settings', label: 'Settings', icon: SettingsIcon },
              { to: '/', label: 'Home', icon: Home, href: '/#/home' },
            ]}
          />
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route path="create-assessment" element={<CreateAssessmentPage />} />
        <Route path="assessments/:id/questions" element={<QuestionManagementPage />} />
        <Route path="assessments" element={<MyAssessmentsPage />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="upload-questions" element={<UploadQuestionsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>
    </Routes>
  );
}
