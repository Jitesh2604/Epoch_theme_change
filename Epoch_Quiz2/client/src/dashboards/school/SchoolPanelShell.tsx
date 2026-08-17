import { ReactNode, useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Users, BarChart3, Trophy, ClipboardList, Award, Building2, Settings as SettingsIcon,
  ChevronsLeft, ChevronsRight, X, Menu, ChevronDown, LogOut, User as UserIcon, Bell, Search,
} from 'lucide-react';
import { useAuth, logout } from '../../lib/authStore';
import { SchoolThemeStyles, SchoolAvatar } from './schoolUI';

/**
 * School Panel shell v2 — a genuinely separate visual product, not a
 * recolored DashboardLayout. Everything here reads from the `.school-theme`
 * CSS-variable palette (see schoolUI.tsx's <SchoolThemeStyles/>, mounted
 * once right here) — deep navy sidebar, teal accents, light blue-gray
 * content well — and uses bold Inter (font-body) for every heading instead
 * of the serif font-display every other dashboard uses. Nothing here
 * imports dashboards/shared/{ui,charts,DashboardLayout,Sidebar,Topbar}.
 */

export interface SchoolShellUser { name: string; email: string; schoolName: string; branchCount: number; studentCount: number }

interface NavItem { to: string; label: string; icon: any }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/school', label: 'Dashboard', icon: LayoutGrid }] },
  { label: 'Student Management', items: [
    { to: '/school/students', label: 'Students', icon: Users },
    { to: '/school/branches', label: 'Branches', icon: Building2 },
  ] },
  { label: 'Academics', items: [
    { to: '/school/assessments', label: 'Assessments', icon: ClipboardList },
  ] },
  { label: 'Performance', items: [
    { to: '/school/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/school/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/school/certificates', label: 'Certificates', icon: Award },
  ] },
  { label: 'System', items: [
    { to: '/school/settings', label: 'School Settings', icon: SettingsIcon },
  ] },
];

const SECTION_LABEL: { prefix: string; label: string; crumb: string[] }[] = [
  { prefix: '/school/students/', label: 'Student Details', crumb: ['Students', 'Student Details'] },
  { prefix: '/school/students',  label: 'Students',        crumb: ['Students'] },
  { prefix: '/school/analytics', label: 'Analytics',       crumb: ['Analytics'] },
  { prefix: '/school/leaderboard', label: 'Leaderboard',   crumb: ['Leaderboard'] },
  { prefix: '/school/assessments', label: 'Assessments',   crumb: ['Assessments'] },
  { prefix: '/school/certificates', label: 'Certificates', crumb: ['Certificates'] },
  { prefix: '/school/branches', label: 'Branches',         crumb: ['Branches'] },
  { prefix: '/school/settings', label: 'School Settings',  crumb: ['School Settings'] },
];

function sectionFor(pathname: string) {
  return SECTION_LABEL.find(s => pathname.startsWith(s.prefix)) ?? { label: 'Dashboard', crumb: ['Dashboard'] };
}

function SchoolMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="11" fill="url(#sp-mark-grad)" />
      <path d="M20 9L32 15.5L20 22L8 15.5L20 9Z" fill="white" fillOpacity="0.96" />
      <path d="M13 18.5V25.5C13 25.5 15.5 28 20 28C24.5 28 27 25.5 27 25.5V18.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.92" />
      <path d="M32 15.5V23" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.92" />
      <defs>
        <linearGradient id="sp-mark-grad" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="var(--sp-navy)" />
          <stop offset="1" stopColor="var(--sp-teal)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ShellSidebar({
  user, collapsed, setCollapsed, mobileOpen, setMobileOpen,
}: {
  user: SchoolShellUser; collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void;
}) {
  const navigate = useNavigate();

  const content = (
    <div className="h-full flex flex-col min-w-0 bg-[var(--sp-navy-950)] text-slate-200">
      {/* School identity block */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <SchoolMark size={collapsed ? 30 : 34} />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-body font-extrabold text-[13.5px] leading-tight text-white truncate">{user.schoolName}</span>
              <span className="text-[9.5px] font-bold tracking-[0.14em] text-[var(--sp-teal)] uppercase mt-0.5">School Management</span>
            </div>
          )}
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/5 transition flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {!collapsed && (
        <div className="mx-4 mb-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-[11px]">
          <span className="text-slate-400">{user.branchCount} branch{user.branchCount === 1 ? '' : 'es'}</span>
          <span className="w-px h-3 bg-white/10" />
          <span className="text-slate-400">{user.studentCount} students</span>
        </div>
      )}

      <nav className="flex-1 min-w-0 px-3 mt-2 space-y-4 overflow-y-auto overflow-x-hidden pb-2">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && <div className="px-2 mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500">{group.label}</div>}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/school'}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[13px] font-semibold transition-all ${
                      isActive ? 'bg-[var(--sp-navy-800)] text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="sp-sb-active" className="absolute left-0 inset-y-1.5 w-[3px] rounded-r-full bg-[var(--sp-teal)]" />}
                      <item.icon size={17} className={isActive ? 'text-[var(--sp-teal)] flex-shrink-0' : 'text-slate-400 group-hover:text-slate-200 flex-shrink-0'} />
                      {!collapsed && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.08] px-3 py-3 space-y-1">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-1 py-2 mb-1">
            <SchoolAvatar name={user.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-white truncate">{user.name}</div>
              <div className="text-[10.5px] text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button onClick={() => navigate('/school/settings')} className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition">
          <UserIcon size={16} className="text-slate-400 flex-shrink-0" />
          {!collapsed && <span>Profile</span>}
        </button>
        <button onClick={() => logout().finally(() => { window.location.href = '/#/login'; })} className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition">
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/5 transition">
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30 transition-[width] duration-300 ease-out" style={{ width: collapsed ? 72 : 268 }}>
        {content}
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'tween', duration: 0.22 }} className="fixed left-0 top-0 bottom-0 z-50 w-[268px] shadow-2xl lg:hidden">
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ShellHeader({ user, onMenuClick }: { user: SchoolShellUser; onMenuClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const section = sectionFor(location.pathname);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const [searchValue, setSearchValue] = useState('');
  const submitSearch = () => {
    const q = searchValue.trim();
    navigate(q ? `/school/students?q=${encodeURIComponent(q)}` : '/school/students');
  };

  return (
    <header className="sticky top-0 z-20 h-[68px] bg-[var(--sp-surface)] border-b border-[var(--sp-border)]">
      <div className="h-full flex items-center gap-4 px-4 md:px-6 lg:px-8">
        <button onClick={onMenuClick} className="lg:hidden w-10 h-10 grid place-items-center rounded-lg border border-[var(--sp-border)] text-[var(--sp-muted)] hover:text-[var(--sp-navy)] hover:bg-[var(--sp-surface-alt)] transition">
          <Menu size={18} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--sp-muted-2)]">
            <span>School</span>
            {section.crumb.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-[var(--sp-border-strong)]">/</span>
                <span className={i === section.crumb.length - 1 ? 'text-[var(--sp-navy)] font-bold' : ''}>{c}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="hidden md:block relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sp-muted-2)] pointer-events-none" />
          <input
            value={searchValue} onChange={e => setSearchValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitSearch()}
            placeholder="Search students…"
            className="w-full pl-8 pr-3 h-9 rounded-lg bg-[var(--sp-surface-alt)] border border-[var(--sp-border)] text-[12.5px] text-[var(--sp-text)] placeholder:text-[var(--sp-muted-2)] focus:outline-none focus:border-[var(--sp-teal)] focus:ring-2 focus:ring-[var(--sp-teal)]/15 transition font-body"
          />
        </div>

        <button className="w-9 h-9 grid place-items-center rounded-lg text-[var(--sp-muted)] hover:text-[var(--sp-navy)] hover:bg-[var(--sp-surface-alt)] transition relative" title="Notifications">
          <Bell size={16} />
        </button>

        <div ref={ref} className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-2 pl-1 pr-2.5 h-9 rounded-lg border border-[var(--sp-border)] hover:bg-[var(--sp-surface-alt)] transition">
            <SchoolAvatar name={user.name} size={28} />
            <div className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-[12.5px] text-[var(--sp-text)] font-bold">{user.name}</span>
              <span className="text-[10px] text-[var(--sp-muted)]">School Admin</span>
            </div>
            <ChevronDown size={14} className="text-[var(--sp-muted)]" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-12 w-52 bg-[var(--sp-surface)] border border-[var(--sp-border)] rounded-xl [box-shadow:var(--sp-shadow)] z-50 p-1.5"
              >
                <button onClick={() => { setMenuOpen(false); navigate('/school/settings'); }} className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--sp-text)] hover:bg-[var(--sp-surface-alt)]">
                  School Settings
                </button>
                <div className="h-px bg-[var(--sp-border)] my-1" />
                <button onClick={() => { setMenuOpen(false); logout().finally(() => { window.location.href = '/#/login'; }); }} className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--sp-danger)] hover:bg-[var(--sp-danger-bg)]">
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export function SchoolPanelShell({ user }: { user: SchoolShellUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="school-theme flex min-h-screen bg-[var(--sp-bg)] text-[var(--sp-text)] font-body">
      <SchoolThemeStyles />
      <ShellSidebar user={user} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div className="school-shell-main flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-out" style={{ marginLeft: collapsed ? 72 : 268 }}>
        <ShellHeader user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 md:px-6 lg:px-8 py-6 lg:py-8 max-w-[1560px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: 'easeOut' }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <style>{`
        @media (max-width: 1023.98px) {
          .school-shell-main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
