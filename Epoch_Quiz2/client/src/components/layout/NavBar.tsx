import React, { useState, useEffect, useCallback } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import { useT } from '../../lib/i18n';
import { useAuth, logout, toUIRole, type AuthUser } from '../../lib/authStore';
import { useResultsPublished } from '../../hooks/useResultsPublished';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function avatarGradient(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue},80%,72%), hsl(${(hue + 40) % 360},75%,62%))`;
}

interface NavLinkProps {
  to: string;
  current: string;
  navigate: NavigateFn;
  children: React.ReactNode;
}

const NavLink: React.FC<NavLinkProps> = ({ to, current, navigate, children }) => (
  <button
    className={`nav-link ${current === to ? 'active' : ''}`}
    onClick={() => navigate(to)}
  >
    {children}
  </button>
);

interface NavBarProps {
  route: string;
  navigate: NavigateFn;
}

// Secondary/informational pages grouped under the "More" dropdown — kept
// off the main nav so it only shows the most frequently used items.
const MORE_ROUTES = ['faq', 'about', 'contact'];

// Temporarily hidden from the navbar while this feature isn't ready for
// release — the pages, routes, and backend logic are untouched. Flip to
// `true` to bring the link back; no other code changes needed.
const NAV_ENABLED = {
  assessment: false,
};

export const NavBar: React.FC<NavBarProps> = ({ route, navigate }) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t    = useT();
  const user = useAuth();
  // Leaderboard isn't a static on/off flag like Assessment above — it's
  // hidden until the current assessment's results are published, then
  // appears automatically for every student (see useResultsPublished.ts).
  const resultsPublished = useResultsPublished();

  useEffect(() => {
    const onClick = () => { setProfileOpen(false); };
    if (profileOpen) {
      setTimeout(() => document.addEventListener('click', onClick, { once: true }));
      return () => document.removeEventListener('click', onClick);
    }
  }, [profileOpen]);

  useEffect(() => {
    const onClick = () => { setMoreOpen(false); };
    if (moreOpen) {
      setTimeout(() => document.addEventListener('click', onClick, { once: true }));
      return () => document.removeEventListener('click', onClick);
    }
  }, [moreOpen]);

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const top  = route.split('/')[0] || 'home';

  // Lock body scroll while the drawer is open; close it once the viewport grows
  // back to desktop so state never gets stuck.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const handleLogout = async () => {
    setProfileOpen(false);
    setMobileOpen(false);
    await logout();
    showToast('Signed out', 'success');
    navigate('home');
  };

  return (
    <>
    <header className="nav">
      <div className="nav-inner" style={{ display: 'flex', alignItems: 'center' }}>

        {/* LEFT — brand */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <a href="#/home" className="brand-link" onClick={(e) => { e.preventDefault(); navigate('home'); }}>
            <img src="/assets/logo-mark.svg" alt="" className="brand-mark" />
            <div>
              <div className="brand-name">Olympiad <em>Quiz</em></div>
              <div className="brand-sub">STUDENT PRACTICE PLATFORM</div>
            </div>
          </a>
        </div>

        {/* CENTER — nav links (flex-centered between the two flex:1 sides so it
            can never overlap the auth cluster; hidden below lg via .nav-links) */}
        <nav className="nav-links">
          <NavLink to="home" current={top} navigate={navigate}>{t('nav.home')}</NavLink>
          <NavLink to="play" current={top} navigate={navigate}>{t('nav.quizPlay')}</NavLink>
          {/* Assessment, Results, and Leaderboard all live in the separate
              dashboard-app tree (react-router-dom, mounted at a different
              root — see main.tsx), so these are real navigations (<a
              href>), not the hash-router's navigate(). Shown only to
              logged-in students — Teacher/Admin have their own,
              differently-scoped pages elsewhere. There is no Student
              Dashboard — these are standalone top-level routes, not nested
              under a dashboard shell (see DashboardApp.tsx). */}
          {user && toUIRole(user.role) === 'student' && (
            <>
              {NAV_ENABLED.assessment && <a href="/assessment" className="nav-link">Assessment</a>}
              <a href="/results" className="nav-link">Results</a>
              {resultsPublished && <a href="/leaderboard" className="nav-link">Leaderboard</a>}
            </>
          )}
          {/* Secondary/informational pages (FAQ, About, Contact) live behind
              this "More" dropdown instead of cluttering the main nav — see
              MORE_ROUTES above. */}
          <div style={{ position: 'relative' }} onClick={stop}>
            <button
              className={`nav-link ${MORE_ROUTES.includes(top) ? 'active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {t('nav.more')}
              <Icon name="chevronDown" size={12} style={{ transition: 'transform var(--dur-base) var(--ease)', transform: moreOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {moreOpen && (
              <div className="dropdown">
                <button className={`dropdown-item ${top === 'faq' ? 'active' : ''}`} onClick={() => { navigate('faq'); setMoreOpen(false); }}>{t('nav.faq')}</button>
                <button className={`dropdown-item ${top === 'about' ? 'active' : ''}`} onClick={() => { navigate('about'); setMoreOpen(false); }}>{t('nav.aboutUs')}</button>
                <button className={`dropdown-item ${top === 'contact' ? 'active' : ''}`} onClick={() => { navigate('contact'); setMoreOpen(false); }}>{t('nav.contactUs')}</button>
              </div>
            )}
          </div>
        </nav>

        {/* RIGHT — auth buttons (desktop only; folded into the drawer below lg) */}
        <div className="nav-auth" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {user ? (
            <ProfileMenu
              user={user}
              // There is no Student Dashboard — for students this opens
              // their standalone Profile page instead. Admin/Teacher keep
              // their existing Dashboard link.
              menuLabel={toUIRole(user.role) === 'student' ? 'Profile' : 'Dashboard'}
              menuHref={toUIRole(user.role) === 'student' ? '/profile' : `/${toUIRole(user.role)}`}
              open={profileOpen}
              setOpen={setProfileOpen}
              onLogout={handleLogout}
              stop={stop}
            />
          ) : (
            <>
              <button className="btn btn-ghost sm" onClick={() => navigate('login')} style={{ padding: '7px 14px' }}>
                Sign In
              </button>
              <button className="btn btn-primary sm" onClick={() => navigate('signup')} style={{ padding: '7px 14px' }}>
                Sign Up
              </button>
            </>
          )}
        </div>

        <button className="nav-iconbtn menu-btn" onClick={() => setMobileOpen(v => !v)} title="Menu">
          <Icon name={mobileOpen ? 'x' : 'menu'} size={18} />
        </button>
      </div>
    </header>

      {/* Drawer rendered OUTSIDE <header.nav>: that element has backdrop-filter,
          which would otherwise make it the containing block for these
          position:fixed nodes and clip the drawer to the 64px bar height. */}
      {mobileOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={() => setMobileOpen(false)} />
          <aside className="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="nav-drawer-head">
              <span className="brand-name" style={{ fontSize: 15 }}>Olympiad <em>Quiz</em></span>
              <button className="nav-iconbtn" onClick={() => setMobileOpen(false)} title="Close menu">
                <Icon name="x" size={18} />
              </button>
            </div>
          {([
            ['home', t('nav.home')],
            ['play', t('nav.quizPlay')],
          ] as [string, string][]).map(([k, n]) => (
            <button key={k} className={`nav-link ${top === k ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { navigate(k); setMobileOpen(false); }}>
              {n}
            </button>
          ))}
          {user && toUIRole(user.role) === 'student' && (
            <>
              {NAV_ENABLED.assessment && (
                <a
                  href="/assessment"
                  className="nav-link"
                  style={{ textAlign: 'left', display: 'block', textDecoration: 'none' }}
                  onClick={() => setMobileOpen(false)}
                >
                  Assessment
                </a>
              )}
              <a
                href="/results"
                className="nav-link"
                style={{ textAlign: 'left', display: 'block', textDecoration: 'none' }}
                onClick={() => setMobileOpen(false)}
              >
                Results
              </a>
              {resultsPublished && (
                <a
                  href="/leaderboard"
                  className="nav-link"
                  style={{ textAlign: 'left', display: 'block', textDecoration: 'none' }}
                  onClick={() => setMobileOpen(false)}
                >
                  Leaderboard
                </a>
              )}
            </>
          )}

          {/* Secondary/informational pages, grouped the same way as the
              desktop "More" dropdown — see MORE_ROUTES above. */}
          <button
            className={`nav-link ${MORE_ROUTES.includes(top) ? 'active' : ''}`}
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={() => setMoreOpen((v) => !v)}
          >
            {t('nav.more')}
            <Icon name="chevronDown" size={14} style={{ transition: 'transform var(--dur-base) var(--ease)', transform: moreOpen ? 'rotate(180deg)' : undefined }} />
          </button>
          {moreOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 12 }}>
              <button className={`nav-link ${top === 'faq' ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { navigate('faq'); setMobileOpen(false); }}>{t('nav.faq')}</button>
              <button className={`nav-link ${top === 'about' ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { navigate('about'); setMobileOpen(false); }}>{t('nav.aboutUs')}</button>
              <button className={`nav-link ${top === 'contact' ? 'active' : ''}`} style={{ textAlign: 'left' }} onClick={() => { navigate('contact'); setMobileOpen(false); }}>{t('nav.contactUs')}</button>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border-1)', marginTop: 8, paddingTop: 8 }}>
            {user ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px' }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flex: '0 0 auto',
                    display: 'grid', placeItems: 'center', overflow: 'hidden',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                    background: avatarGradient(user.avatarHue),
                  }}>
                    {initials(user.name)}
                  </span>
                  <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'capitalize' }}>{toUIRole(user.role)}</div>
                  </div>
                </div>
                <div style={{ padding: '4px 14px 8px' }}>
                  {/* No Student Dashboard — students get their standalone
                      Profile page here instead; Admin/Teacher keep their
                      existing Dashboard link. */}
                  <a
                    href={toUIRole(user.role) === 'student' ? '/profile' : `/${toUIRole(user.role)}`}
                    className="btn btn-primary sm"
                    style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon name="sparkles" size={14} />
                    {toUIRole(user.role) === 'student' ? 'My Profile' : 'My Dashboard'}
                  </a>
                </div>
                <button
                  className="nav-link"
                  style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}
                  onClick={handleLogout}
                >
                  <Icon name="logout" size={14} /> Log out
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, padding: '8px 14px' }}>
                <button className="btn btn-ghost sm" style={{ flex: 1 }} onClick={() => { setMobileOpen(false); navigate('login'); }}>Sign In</button>
                <button className="btn btn-primary sm" style={{ flex: 1 }} onClick={() => { setMobileOpen(false); navigate('signup'); }}>Sign Up</button>
              </div>
            )}
          </div>
          </aside>
        </>
      )}
    </>
  );
};

// ── Logged-in profile menu (desktop) ─────────────────────────────
interface ProfileMenuProps {
  user: AuthUser;
  menuLabel: string;
  menuHref: string;
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onLogout: () => void;
  stop: (e: React.MouseEvent) => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({ user, menuLabel, menuHref, open, setOpen, onLogout, stop }) => (
  <div style={{ position: 'relative' }} onClick={stop}>
    <button
      className="nav-profile-btn"
      onClick={() => setOpen((v) => !v)}
      title={user.name}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px 5px 5px', borderRadius: 999,
        border: '1px solid var(--border-1)', background: 'var(--surface-1)',
        cursor: 'pointer', color: 'var(--fg-1)',
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: '50%', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', overflow: 'hidden',
        fontSize: 11, fontWeight: 700, color: '#1a1a1a',
        background: avatarGradient(user.avatarHue),
      }}>
        {initials(user.name)}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {user.name.split(/\s+/)[0]}
      </span>
      <Icon name="chevronDown" size={12} />
    </button>
    {open && (
      <div className="dropdown">
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
        </div>
        <a className="dropdown-item" href={menuHref} style={{ textDecoration: 'none' }}>
          <Icon name="sparkles" size={14} /> {menuLabel}
        </a>
        <button className="dropdown-item" onClick={onLogout} style={{ color: 'var(--danger, #FF6B6B)' }}>
          <Icon name="logout" size={14} /> Log out
        </button>
      </div>
    )}
  </div>
);
