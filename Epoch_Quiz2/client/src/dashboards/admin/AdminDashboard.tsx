import {
  LayoutDashboard, GraduationCap, ClipboardList, BookOpen, FileQuestion,
  BarChart3, Settings as SettingsIcon, Home, Award, TrendingUp, Layers, ListChecks, ClipboardCheck, School,
} from 'lucide-react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../shared/DashboardLayout';
import { DashboardOverviewPage } from './pages/DashboardOverviewPage';
import { StudentsPage } from './pages/StudentsPage';
import { StudentPerformancePage } from './pages/StudentPerformancePage';
import { ClassAnalyticsPage } from './pages/ClassAnalyticsPage';
import { SubjectAnalyticsPage } from './pages/SubjectAnalyticsPage';
import { QuestionAnalyticsPage } from './pages/QuestionAnalyticsPage';
import { AssessmentAnalyticsPage } from './pages/AssessmentAnalyticsPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { AssessmentResultsPage } from './pages/AssessmentResultsPage';
import { AssessmentQuestionBankPage } from './pages/AssessmentQuestionBankPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { UploadQuestionsPage } from '../shared/UploadQuestionsPage';
import { UploadHistoryPage } from '../shared/UploadHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CreateAssessmentPage } from '../shared/CreateAssessmentPage';
import { QuestionManagementPage } from '../shared/QuestionManagementPage';
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
              { to: '/admin/students', label: 'Students', icon: GraduationCap },
              { to: '/admin/student-performance', label: 'Student Performance', icon: TrendingUp },
              { to: '/admin/class-analytics', label: 'Class Analytics', icon: School },
              { to: '/admin/subject-analytics', label: 'Subject Analytics', icon: Layers },
              { to: '/admin/question-analytics', label: 'Question Analytics', icon: ListChecks },
              { to: '/admin/assessment-analytics', label: 'Assessment Analytics', icon: ClipboardCheck },
              { to: '/admin/assessments', label: 'Assessments', icon: ClipboardList },
              { to: '/admin/assessment-results', label: 'Assessment Results', icon: Award },
              { to: '/admin/assessment-question-bank', label: 'Assessment Question Bank', icon: FileQuestion },
              { to: '/admin/question-bank', label: 'Practice Olympiad Question Bank', icon: BookOpen },
              { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
            ]}
            footerItems={[
              { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
              // Help Center is hidden until it has real content of its own —
              // it used to just reopen the Settings page under a different
              // label. Restore this item (and the HelpCircle icon import
              // above) once a real Help Center/FAQ/docs page exists.
              // { to: '/admin/help', label: 'Help center', icon: HelpCircle },
              { to: '/', label: 'Home', icon: Home, href: '/#/home' },
            ]}
          />
        }
      >
        <Route index element={<DashboardOverviewPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="student-performance" element={<StudentPerformancePage />} />
        <Route path="class-analytics" element={<ClassAnalyticsPage />} />
        <Route path="subject-analytics" element={<SubjectAnalyticsPage />} />
        <Route path="question-analytics" element={<QuestionAnalyticsPage />} />
        <Route path="assessment-analytics" element={<AssessmentAnalyticsPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />
        <Route path="assessment-results" element={<AssessmentResultsPage />} />
        <Route path="create-assessment" element={<CreateAssessmentPage />} />
        <Route path="assessments/:id/questions" element={<QuestionManagementPage />} />
        <Route path="assessment-question-bank" element={<AssessmentQuestionBankPage />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="upload-questions" element={<UploadQuestionsPage />} />
        <Route path="upload-questions/history" element={<UploadHistoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* <Route path="help" element={<SettingsPage />} /> — was only an alias
            for Settings, not a real Help Center. Point this at a dedicated
            HelpCenterPage when one exists. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
