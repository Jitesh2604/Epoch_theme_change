import {
  LayoutDashboard, Users, GraduationCap, ClipboardList, BookOpen,
  BarChart3, Bell, Settings as SettingsIcon, HelpCircle, Home,
} from 'lucide-react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../shared/DashboardLayout';
import { DashboardOverviewPage } from './pages/DashboardOverviewPage';
import { TeachersPage } from './pages/TeachersPage';
import { StudentsPage } from './pages/StudentsPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AssessmentPreviewPage } from './pages/AssessmentPreviewPage';
import { useAuth } from '../../lib/authStore';

export function AdminDashboard() {
  const user = useAuth();
  return (
    <Routes>
      <Route
        element={
          <DashboardLayout
            role="admin"
            brand="Epoch Quiz"
            brandSub="Publication Admin"
            user={{ name: user?.name ?? 'Admin', subtitle: 'Publication Admin', avatarHue: user?.avatarHue ?? 320 }}
            navItems={[
              { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
              { to: '/admin/teachers', label: 'Teachers', icon: Users },
              { to: '/admin/students', label: 'Students', icon: GraduationCap },
              { to: '/admin/assessments', label: 'Assessments', icon: ClipboardList },
              { to: '/admin/question-bank', label: 'Question Bank', icon: BookOpen },
              { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
              { to: '/admin/notifications', label: 'Notifications', icon: Bell },
            ]}
            footerItems={[
              { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
              { to: '/admin/help', label: 'Help center', icon: HelpCircle },
              { to: '/', label: 'Home', icon: Home, href: '/#/home' },
            ]}
          />
        }
      >
        <Route index element={<DashboardOverviewPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="assessments/:id" element={<AssessmentPreviewPage />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
