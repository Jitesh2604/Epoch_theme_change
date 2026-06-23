const BASE = '/api/v1';

// ── Token store (access token in memory, refresh in localStorage) ──

let accessToken: string | null = null;

export function setAccessToken(t: string | null) {
  accessToken = t;
  (window as any).__epochAccessToken = t;
}
export function getAccessToken() { return accessToken; }

const REFRESH_KEY = 'epoch-refresh-token';
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }
export function setRefreshToken(t: string | null) {
  if (t) localStorage.setItem(REFRESH_KEY, t);
  else   localStorage.removeItem(REFRESH_KEY);
}

export function clearTokens() {
  setAccessToken(null);
  setRefreshToken(null);
}

// ── Core fetch ──────────────────────────────────────────────────

interface ApiOpts extends RequestInit {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Array<{ field?: string; message: string }>;
  constructor(status: number, code: string, message: string, details?: typeof ApiError.prototype.details) {
    super(message);
    this.status = status;
    this.code   = code;
    this.details = details;
  }
}

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) { clearTokens(); return null; }
    const body = await res.json();
    const newAccess  = body.data?.accessToken  as string | undefined;
    const newRefresh = body.data?.refreshToken as string | undefined;
    if (!newAccess) { clearTokens(); return null; }
    setAccessToken(newAccess);
    if (newRefresh) setRefreshToken(newRefresh);
    return newAccess;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { skipAuth, ...fetchOpts } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOpts.headers as Record<string, string> ?? {}),
  };
  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, headers });

  // Token expired — try silent refresh once
  if (res.status === 401 && !skipAuth) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefresh();
      isRefreshing   = false;
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];

      if (!newToken) {
        clearTokens();
        window.location.href = '/#/login';
        throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
      }

      // Retry original request
      return apiFetch<T>(path, opts);
    }

    // Another request is already refreshing — queue this one
    return new Promise<T>((resolve, reject) => {
      refreshQueue.push(async (token) => {
        if (!token) { reject(new ApiError(401, 'UNAUTHORIZED', 'Session expired')); return; }
        try { resolve(await apiFetch<T>(path, opts)); }
        catch (e)  { reject(e); }
      });
    });
  }

  let body: any;
  const ct = res.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Request failed', err.details);
  }

  return (body?.data ?? body) as T;
}

// ── Typed helper methods ────────────────────────────────────────

export const api = {
  get:    <T>(path: string, opts?: ApiOpts) => apiFetch<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: ApiOpts) => apiFetch<T>(path, { ...opts, method: 'POST',  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown, opts?: ApiOpts) => apiFetch<T>(path, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, opts?: ApiOpts) => apiFetch<T>(path, { ...opts, method: 'DELETE' }),

  getWithQuery: <T>(path: string, params: Record<string, string | number | boolean | undefined | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    return api.get<T>(qs ? `${path}?${qs}` : path);
  },
};
