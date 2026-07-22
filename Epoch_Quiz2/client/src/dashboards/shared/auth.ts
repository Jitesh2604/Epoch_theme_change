export type Role = 'admin' | 'teacher' | 'student';

export interface AuthState {
  name?: string;
  email?: string;
  role?: Role;
  signedInAt?: number;
}

const KEY = 'epoch-auth';

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function getRole(): Role | null {
  return getAuth()?.role ?? null;
}

export function setAuth(next: AuthState) {
  const merged = { ...(getAuth() ?? {}), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
}

export function signOut() {
  localStorage.removeItem(KEY);
  localStorage.removeItem('epoch-user');
  localStorage.removeItem('epoch-refresh-token');
}

/**
 * Where a role's "home" area lives within the DashboardApp router tree.
 * Student has no dashboard home anymore — /assessment (the standalone
 * Assessment entry point) is the closest analog, and is a real route in
 * this same tree so same-tree <Navigate> targets stay valid.
 */
export function pathForRole(role: Role): string {
  if (role === 'student') return '/assessment';
  return `/${role}`;
}
