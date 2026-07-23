import { useSyncExternalStore } from 'react';
import { api, setAccessToken, setRefreshToken, clearTokens, getRefreshToken } from './api';
export { getRefreshToken };

// ── Types ────────────────────────────────────────────────────────

export type BackendRole = 'SUPER_ADMIN' | 'PUBLICATION_ADMIN' | 'CONTENT_MANAGER' | 'TEACHER' | 'STUDENT';
export type UIRole = 'admin' | 'teacher' | 'student';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: BackendRole;
  status: string;
  avatarHue: number;
  profileComplete: boolean;
  createdAt: string;
}

export interface ProfileUpdateData {
  name?: string;
  avatarHue?: number;
  dob?: string | null;           // YYYY-MM-DD
  schoolName?: string | null;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  zip?: string | null;
  imageUrl?: string | null;      // profile image (data URL or hosted URL)
  // Education board (curated taxonomy; stateBoard resolved when STATE_BOARD)
  educationBoard?: string | null;
  stateBoard?: string | null;
  // FK fields (single select)
  boardExternalId?: string | null;
  classExternalId?: string | null;       // student: single
  seriesExternalId?: string | null;      // student: single
  // Many-to-many (arrays of IDs)
  classExternalIds?: string[];           // teacher: multiple
  subjectExternalIds?: string[];         // teacher: multiple
  seriesExternalIds?: string[];          // teacher: multiple
  bookExternalIds?: string[];            // both: multiple
  // Role-specific text fields
  bio?: string | null;           // Teacher only
  teacherCode?: string | null;   // Student only
}

const USER_KEY = 'epoch-user';

// ── Role mapping ─────────────────────────────────────────────────

export function toUIRole(role: BackendRole): UIRole {
  if (role === 'TEACHER') return 'teacher';
  if (role === 'STUDENT') return 'student';
  return 'admin';
}

// ── Reactive auth state ──────────────────────────────────────────
// Single in-memory snapshot kept in sync with localStorage, with a
// subscriber set so React components re-render the instant it changes.
// Persistence (localStorage) means a page refresh restores the snapshot.

function readPersistedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

let currentUser: AuthUser | null = readPersistedUser();
const listeners = new Set<() => void>();

function emitAuthChange() {
  for (const listener of listeners) listener();
}

// Legacy key the dashboard's route guard (RequireRole/getRole) reads. Every
// path that establishes or refreshes a session — login, register, silent
// token refresh, profile update — funnels through saveUser(), so this stays
// in sync everywhere instead of relying on each call site to remember it
// (a previous version only wrote it from login/register/updateProfile, so a
// silent refreshSession() → getMe() call left it stale).
function syncLegacyAuthKey(u: AuthUser | null) {
  if (u) {
    localStorage.setItem('epoch-auth', JSON.stringify({ name: u.name, email: u.email, role: toUIRole(u.role), signedInAt: Date.now() }));
  } else {
    localStorage.removeItem('epoch-auth');
  }
}

function saveUser(u: AuthUser | null) {
  currentUser = u;
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else   localStorage.removeItem(USER_KEY);
  syncLegacyAuthKey(u);
  emitAuthChange();
}

/** Synchronous current-user snapshot (stable reference until it changes). */
export function loadUser(): AuthUser | null {
  return currentUser;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React hook — re-renders the component whenever auth state changes. */
export function useAuth(): AuthUser | null {
  return useSyncExternalStore(subscribeAuth, loadUser, loadUser);
}

// Keep the in-memory snapshot aligned with other tabs / external writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === USER_KEY || e.key === null) {
      currentUser = readPersistedUser();
      emitAuthChange();
    }
  });
}

// ── Auth API calls ────────────────────────────────────────────────

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<AuthResponse>('/auth/login', { email, password }, { skipAuth: true });
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  saveUser(data.user);
  return data.user;
}

// Registration no longer auto-logs in — the account is created PENDING and
// needs its emailed code confirmed via verifyEmail() first (see
// VerifyEmailPage.tsx).
export async function register(
  name: string,
  email: string,
  password: string,
  role: 'TEACHER' | 'STUDENT',
  mobileNo: string,
): Promise<{ email: string; expiresInMinutes: number; devCode?: string }> {
  return api.post('/auth/register', { name, email, password, role, mobileNo }, { skipAuth: true });
}

export async function verifyEmail(email: string, code: string): Promise<AuthUser> {
  const data = await api.post<AuthResponse>('/auth/verify-email', { email, code }, { skipAuth: true });
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  saveUser(data.user);
  return data.user;
}

export async function resendVerificationCode(email: string): Promise<{ ok: boolean; devCode?: string }> {
  return api.post('/auth/resend-verification', { email }, { skipAuth: true });
}

export async function logout(): Promise<void> {
  const rt = getRefreshToken();
  if (rt) {
    try { await api.post('/auth/logout', { refreshToken: rt }); } catch {}
  }
  clearTokens();
  saveUser(null);
}

// Deduplicates concurrent calls (e.g. React StrictMode double-invocation).
// The server uses rotating single-use refresh tokens — two simultaneous calls
// with the same token would cause the second to get 401 and wipe valid tokens.
let _refreshingSession: Promise<AuthUser | null> | null = null;

export function refreshSession(): Promise<AuthUser | null> {
  if (_refreshingSession) return _refreshingSession;

  _refreshingSession = (async () => {
    const rt = getRefreshToken();
    if (!rt) return null;
    try {
      const { accessToken: newAccess, refreshToken: newRefresh } = await api.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/refresh', { refreshToken: rt }, { skipAuth: true });

      setAccessToken(newAccess);
      if (newRefresh) setRefreshToken(newRefresh);

      return await getMe();
    } catch {
      clearTokens();
      saveUser(null);
      return null;
    }
  })();

  _refreshingSession.finally(() => { _refreshingSession = null; });
  return _refreshingSession;
}

export async function getMe(): Promise<AuthUser> {
  const user = await api.get<AuthUser>('/auth/me');
  saveUser(user);
  return user;
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; resetToken?: string }> {
  return api.post('/auth/forgot-password', { email }, { skipAuth: true });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post('/auth/reset-password', { token, newPassword }, { skipAuth: true });
}

export async function updateProfile(data: ProfileUpdateData): Promise<AuthUser> {
  const user = await api.patch<AuthUser>('/users/me', data);
  saveUser(user);
  return user;
}
