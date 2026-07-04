import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import type { Role, SidebarItem } from './types';

interface Props {
  role: Role;
  brand: string;
  brandSub: string;
  items: SidebarItem[];
  footerItems?: SidebarItem[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const EpochMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="var(--brand)" />
    <rect x="9"  y="9"  width="4.5" height="22" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
    <rect x="13.5" y="9"  width="16" height="4.5" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
    <rect x="13.5" y="17.5" width="11" height="4"   rx="2"    fill="var(--brand-ink)" opacity="0.70"/>
    <rect x="13.5" y="26.5" width="13.5" height="4.5" rx="2.25" fill="var(--brand-ink)" opacity="0.95"/>
  </svg>
);

export function Sidebar({
  role, brand, brandSub, items, footerItems, collapsed, setCollapsed, mobileOpen, setMobileOpen,
}: Props) {
  const navigate = useNavigate();

  const content = (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-line">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group min-w-0">
          <div className="flex-shrink-0">
            <EpochMark size={collapsed ? 28 : 30} />
          </div>
          {!collapsed && (
            <div className="flex flex-col text-left min-w-0">
              <span className="font-display font-semibold text-[14px] leading-tight text-fg1 tracking-[-0.01em] truncate">{brand}</span>
              <span className="text-[9px] tracking-[0.14em] text-fg4 uppercase mt-0.5 font-body truncate">{brandSub}</span>
            </div>
          )}
        </button>

        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden w-8 h-8 rounded-lg grid place-items-center border border-line text-fg3 hover:text-fg1 hover:bg-surface2 transition flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 px-2.5 mt-3 space-y-0.5 overflow-y-auto">
        {items.map(item => {
          if (item.href) {
            return (
              <a
                key={item.to}
                href={item.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium font-body text-fg2 hover:text-fg1 hover:bg-[rgba(53,64,36,0.04)] border border-transparent transition-all"
              >
                <item.icon size={17} className="text-fg3 group-hover:text-fg2 flex-shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              </a>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium font-body transition-all ${
                  isActive
                    ? 'bg-brand-soft text-fg1 border border-[rgba(53,64,36,0.18)]'
                    : 'text-fg2 hover:text-fg1 hover:bg-[rgba(53,64,36,0.04)] border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId={`sb-${role}`}
                      className="absolute left-0 inset-y-0 my-auto w-0.5 h-4 rounded-r bg-brand"
                    />
                  )}
                  <item.icon
                    size={17}
                    className={isActive ? 'text-brand flex-shrink-0' : 'text-fg3 group-hover:text-fg2 flex-shrink-0'}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-brand text-brand-ink leading-none">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-line px-2.5 py-2.5 space-y-0.5">
        {footerItems?.map(item => {
          // External / cross-app links (e.g. back to the marketing Home page,
          // which lives in a separate hash-routed app) must be real anchors so
          // they do a full navigation instead of resolving inside this router.
          const footerCls = 'flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] font-medium font-body text-fg3 hover:text-fg1 hover:bg-[rgba(53,64,36,0.04)] transition-all';
          if (item.href) {
            return (
              <a key={item.to} href={item.href} className={footerCls}>
                <item.icon size={16} className="text-fg3 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] font-medium font-body transition-all ${
                  isActive
                    ? 'bg-brand-soft text-fg1'
                    : 'text-fg3 hover:text-fg1 hover:bg-[rgba(53,64,36,0.04)]'
                }`
              }
            >
              <item.icon size={16} className="text-fg3 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium font-body text-fg4 hover:text-fg2 hover:bg-[rgba(53,64,36,0.04)] transition"
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30 bg-surface1 border-r border-line transition-[width] duration-300 ease-out"
        style={{ width: collapsed ? 68 : 256 }}
      >
        {content}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-[rgba(44,30,8,0.35)] backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -272 }} animate={{ x: 0 }} exit={{ x: -272 }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[256px] bg-surface1 border-r border-line shadow-elev2 lg:hidden"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
