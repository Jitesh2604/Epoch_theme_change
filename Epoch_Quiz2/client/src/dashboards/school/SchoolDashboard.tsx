import { LayoutDashboard, Home } from 'lucide-react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../shared/DashboardLayout';
import { SchoolOverviewPage } from './pages/SchoolOverviewPage';
import { useAuth } from '../../lib/authStore';

// Deliberately minimal — registration + a read-only overview of the
// school's own submitted details, per the agreed scope. Real school-admin
// features (managing students, etc.) are a future addition, following the
// same nav-item + <Route> pattern AdminDashboard.tsx already establishes.
export function SchoolDashboard() {
  const user = useAuth();
  return (
    <Routes>
      <Route
        element={
          <DashboardLayout
            role="school"
            brand="Epoch Quiz"
            brandSub="School Panel"
            user={{ name: user?.name ?? 'School', subtitle: 'School Admin', avatarHue: user?.avatarHue ?? 200 }}
            navItems={[
              { to: '/school', label: 'Overview', icon: LayoutDashboard },
            ]}
            footerItems={[
              { to: '/', label: 'Home', icon: Home, href: '/#/home' },
            ]}
          />
        }
      >
        <Route index element={<SchoolOverviewPage />} />
        <Route path="*" element={<Navigate to="/school" replace />} />
      </Route>
    </Routes>
  );
}
