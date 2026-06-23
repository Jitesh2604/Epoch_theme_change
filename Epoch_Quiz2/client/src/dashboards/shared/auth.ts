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

export function pathForRole(role: Role): string {
  return `/${role}`;
}
