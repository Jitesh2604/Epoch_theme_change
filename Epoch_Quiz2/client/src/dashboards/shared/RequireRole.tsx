import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { getRole, pathForRole, type Role } from './auth';
import { loadUser, toUIRole } from '../../lib/authStore';
import { rememberPostAuthTarget } from '../../lib/postAuthRedirect';

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const current = getRole();
  const user = loadUser();
  // Teachers/students must finish onboarding before any dashboard is reachable.
  const needsProfile = !!user && toUIRole(user.role) !== 'admin' && !user.profileComplete;

  useEffect(() => {
    if (!current) {
      const t = setTimeout(() => {
        // Remember exactly the protected page they were trying to reach
        // (e.g. /profile) so login can send them straight back instead of
        // defaulting to Home.
        rememberPostAuthTarget(window.location.pathname + window.location.search);
        window.location.href = '/#/login';
      }, 1500);
      return () => clearTimeout(t);
    }
    if (needsProfile) {
      // Complete-profile lives in the hash-routed marketing SPA at the root path.
      window.location.href = '/#/complete-profile';
    }
  }, [current, needsProfile]);

  if (current && needsProfile) {
    return (
      <div className="min-h-screen bg-bg text-fg1 grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center mb-4 text-fg3">
            <Lock size={22} />
          </div>
          <h2 className="font-display font-semibold text-[20px] text-fg1 mb-1.5">Finish your profile</h2>
          <p className="text-[13px] text-fg2 mb-4">Complete your profile to unlock your workspace. Redirecting…</p>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-bg text-fg1 grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface1 border border-line grid place-items-center mb-4 text-fg3">
            <Lock size={22} />
          </div>
          <h2 className="font-display font-semibold text-[20px] text-fg1 mb-1.5">Sign in required</h2>
          <p className="text-[13px] text-fg2 mb-4">You need to sign in to access this workspace. Redirecting to login…</p>
        </div>
      </div>
    );
  }

  if (current !== role) {
    return <Navigate to={pathForRole(current)} replace />;
  }

  return <>{children}</>;
}
