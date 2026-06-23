import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { Role, SidebarItem } from './types';

interface Props {
  role: Role;
  brand: string;
  brandSub: string;
  user: { name: string; subtitle: string; avatarHue: number };
  navItems: SidebarItem[];
  footerItems?: SidebarItem[];
}

export function DashboardLayout({ role, brand, brandSub, user, navItems, footerItems }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-bg text-fg1 font-body">
      <Sidebar
        role={role}
        brand={brand}
        brandSub={brandSub}
        items={navItems}
        footerItems={footerItems}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div
        className="flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-out"
        style={{ marginLeft: collapsed ? 68 : 256 }}
      >
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-5 md:px-8 lg:px-10 py-6 lg:py-8 max-w-[1480px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .flex-1[style*="margin-left"] { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
