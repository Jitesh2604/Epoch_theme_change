import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, Menu, Search, Sun, Moon, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from './auth';
import { logout } from '../../lib/authStore';

interface Props {
  user: { name: string; subtitle: string; avatarHue: number };
  onMenuClick: () => void;
}

export function Topbar({ user, onMenuClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('epoch-theme')) || 'light');
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = location.pathname.startsWith('/teacher') ? '/teacher'
                 : location.pathname.startsWith('/student') ? '/student'
                 : '/admin';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('epoch-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 h-16 bg-bg/90 backdrop-blur-xl border-b border-line">
      <div className="h-full flex items-center gap-3 px-4 md:px-6 lg:px-8">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-10 h-10 grid place-items-center rounded-lg border border-line text-fg3 hover:text-fg1 hover:bg-surface2 transition"
        >
          <Menu size={18} />
        </button>

        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg4 pointer-events-none" />
          <input
            placeholder="Search assessments, students, questions…"
            className="w-full pl-9 pr-3 h-10 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 placeholder:text-fg4 font-body focus:outline-none focus:border-[rgba(53,64,36,0.35)] focus:ring-2 focus:ring-[rgba(53,64,36,0.08)] transition"
          />
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 grid place-items-center rounded-lg border border-line text-fg3 hover:text-fg1 hover:bg-surface2 transition"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="w-9 h-9 grid place-items-center rounded-lg border border-line text-fg3 hover:text-fg1 hover:bg-surface2 transition">
            <HelpCircle size={15} />
          </button>
        </div>

        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen(o => !o)}
            className="relative w-9 h-9 grid place-items-center rounded-lg border border-line text-fg3 hover:text-fg1 hover:bg-surface2 transition"
          >
            <Bell size={15} />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-brand animate-pulse-soft" />
          </button>
          <AnimatePresence>
            {bellOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-12 w-80 bg-surface1 border border-line rounded-xl shadow-elev2 z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-fg1">Notifications</span>
                  <button className="text-[11px] text-brand hover:underline">Mark all read</button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-line">
                  {[
                    { t: 'New assessment ready for review', s: '2 min ago' },
                    { t: '5 students completed Algebra Test', s: '1 hour ago' },
                    { t: 'Weekly analytics report ready', s: 'Yesterday' },
                  ].map((n, i) => (
                    <button key={i} className="w-full text-left px-4 py-3 hover:bg-surface2">
                      <div className="text-[12.5px] text-fg1">{n.t}</div>
                      <div className="text-[10.5px] text-fg3 mt-0.5">{n.s}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setBellOpen(false); }}
                  className="block w-full px-4 py-2.5 text-[12px] text-fg2 hover:bg-surface2 border-t border-line"
                >
                  View all
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={ref} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 pl-1 pr-2.5 h-9 rounded-lg border border-line hover:bg-surface2 transition"
          >
            <span
              className="w-7 h-7 rounded-md grid place-items-center font-body font-semibold text-[11px] text-white"
              style={{ background: `linear-gradient(135deg, hsl(${30 + (user.avatarHue % 30)},52%,40%), hsl(${50 + (user.avatarHue % 20)},45%,34%))` }}
            >
              {user.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
            </span>
            <div className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-[12.5px] text-fg1 font-semibold">{user.name}</span>
              <span className="text-[10px] text-fg3">{user.subtitle}</span>
            </div>
            <ChevronDown size={14} className="text-fg3" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-12 w-56 bg-surface1 border border-line rounded-xl shadow-elev2 z-50 p-1.5"
              >
                {[
                  { label: 'Profile', action: () => navigate(`${basePath}/profile`) },
                  { label: 'Account settings', action: () => navigate(`${basePath}/settings`) },
                ].map((it, i) => (
                  <button
                    key={i}
                    onClick={() => { it.action(); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-fg1 hover:bg-surface2"
                  >
                    {it.label}
                  </button>
                ))}
                <div className="h-px bg-line my-1" />
                <button
                  onClick={() => { setMenuOpen(false); logout().finally(() => { signOut(); window.location.href = '/login'; }); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-danger hover:bg-surface2"
                >
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
