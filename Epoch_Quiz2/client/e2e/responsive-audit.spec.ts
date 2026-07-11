/**
 * Responsive audit sweep — NOT a pass/fail test. It drives every route as each
 * role at the four required breakpoints, records any element that overflows the
 * viewport horizontally, and saves a mobile screenshot of every page for visual
 * review. Output: e2e/audit-out/report.json + screenshots.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Seed dashboard auth directly into localStorage on every navigation. The route
 * guard renders the workspace whenever `epoch-auth` (role) + a profileComplete
 * `epoch-user` exist — no live access token required — so every dashboard shell
 * renders for the layout audit even if data fetches 401. We also seed a real
 * refresh token (best-effort data loading).
 */
async function seedAuth(page: Page, email: string, password: string, uiRole: string) {
  const res = await page.request.post('http://localhost:3000/api/v1/auth/login', {
    data: { email, password },
  });
  const body = await res.json();
  const user = { ...body.data.user, profileComplete: true };
  const auth = { name: user.name, email: user.email, role: uiRole, signedInAt: Date.now() };
  const accessToken: string = body.data.accessToken;
  const refreshToken: string = body.data.refreshToken;

  // The dashboard restores its session on mount by calling /auth/refresh when a
  // refresh token is present. Intercept that call and return a FIXED valid
  // access token (non-rotating) so every full-reload navigation lands on a
  // working session — real data loads, nothing 401s, no bounce to /login.
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { accessToken, refreshToken } }),
    }),
  );

  await page.addInitScript(
    ([a, u, r]) => {
      localStorage.setItem('epoch-auth', a);
      localStorage.setItem('epoch-user', u);
      localStorage.setItem('epoch-refresh-token', r);
    },
    [JSON.stringify(auth), JSON.stringify(user), refreshToken] as [string, string, string],
  );
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'audit-out');
fs.mkdirSync(OUT, { recursive: true });

const BREAKPOINTS = [
  { name: 'w320',  w: 320,  h: 780 },
  { name: 'w375',  w: 375,  h: 780 },
  { name: 'w390',  w: 390,  h: 780 },
  { name: 'w414',  w: 414,  h: 780 },
  { name: 'w768',  w: 768,  h: 1024 },
  { name: 'w820',  w: 820,  h: 1180 },
  { name: 'w920',  w: 920,  h: 700 },
  { name: 'w1024', w: 1024, h: 768 },
  { name: 'w1280', w: 1280, h: 800 },
  { name: 'w1440', w: 1440, h: 900 },
  { name: 'w1920', w: 1920, h: 1080 },
];
// Widths at which to also capture a screenshot (navbar-critical tablet range).
const SHOT_WIDTHS = new Set(['w320', 'w375', 'w768', 'w920', 'w1024']);

// Real paths (BrowserRouter dashboards) and hash routes (marketing/auth).
const PUBLIC_ROUTES = [
  '/#/home', '/#/login', '/#/signup', '/#/forgot-password',
  '/#/complete-profile/student', '/#/complete-profile/teacher',
  '/#/olympiad', '/#/instruction',
];
const ADMIN_ROUTES = [
  '/admin', '/admin/teachers', '/admin/students', '/admin/assessments',
  '/admin/question-bank', '/admin/reports', '/admin/settings', '/admin/help',
];
const TEACHER_ROUTES = [
  '/teacher', '/teacher/create-assessment', '/teacher/assessments', '/teacher/question-bank',
  '/teacher/upload-questions', '/teacher/students', '/teacher/results', '/teacher/analytics',
  '/teacher/profile', '/teacher/settings',
];
const STUDENT_ROUTES = [
  '/student', '/student/practice', '/student/join', '/student/assessments',
  '/student/results', '/student/leaderboard',
  '/student/profile', '/student/settings',
];

type Offender = { tag: string; cls: string; right: number; w: number; scrollableX: boolean };
const report: Record<string, Record<string, Offender[]>> = {};

async function measureOffenders(page: import('@playwright/test').Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: any[] = [];
    const seen = new Set<string>();
    // Is the element (or its overflow) clipped by an ancestor that is itself
    // within the viewport? Then it can't cause visible horizontal overflow —
    // e.g. decorative blur circles inside an `overflow-hidden` card.
    const clippedByAncestor = (el: Element): boolean => {
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        // hidden/clip clips the overflow; auto/scroll makes it intended
        // horizontal-scroll content (tabs, tables) — either way it does not
        // cause page-level overflow as long as the container is within view.
        const contains = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX)
          || ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflow);
        if (contains && p.getBoundingClientRect().right <= window.innerWidth + 2) {
          return true;
        }
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right <= vw + 2 && r.left >= -2) return;               // within viewport
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && r.width <= vw + 2) return;    // fixed drawers off-screen are fine
      if (cs.visibility === 'hidden' || cs.opacity === '0') return;
      const scrollableX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      // Only flag the element if it is itself wider than the viewport OR spills
      // to the right while not being an intended horizontal scroller.
      const culprit = r.width > vw + 2 ? !scrollableX : r.right > vw + 2 && !scrollableX;
      if (!culprit) return;
      if (clippedByAncestor(el)) return;
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 90);
      const key = el.tagName + '|' + cls + '|' + Math.round(r.right);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ tag: el.tagName.toLowerCase(), cls, right: Math.round(r.right), w: Math.round(r.width), scrollableX });
    });
    // Sort worst-first by how far past the viewport they extend.
    return out.sort((a, b) => (b.right - vw) - (a.right - vw)).slice(0, 10);
  });
}

async function sweep(page: import('@playwright/test').Page, label: string, routes: string[]) {
  for (const route of routes) {
    for (const bp of BREAKPOINTS) {
      await page.setViewportSize({ width: bp.w, height: bp.h });
      await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(500);
      const offenders = await measureOffenders(page);
      const key = `${label} ${route}`;
      report[key] ??= {};
      report[key][bp.name] = offenders;
      if (SHOT_WIDTHS.has(bp.name)) {
        const safe = route.replace(/[^a-z0-9]/gi, '_');
        await page.screenshot({ path: path.join(OUT, `${label}_${safe}_${bp.name}.png`), fullPage: true }).catch(() => {});
      }
    }
  }
}

test('audit: public + auth', async ({ page }) => {
  test.setTimeout(300_000);
  await sweep(page, 'public', PUBLIC_ROUTES);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
});

test('audit: admin', async ({ page }) => {
  test.setTimeout(300_000);
  await seedAuth(page, 'admin@epoch.local', 'Admin@12345', 'admin');
  await sweep(page, 'admin', ADMIN_ROUTES);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
});

test('audit: teacher', async ({ page }) => {
  test.setTimeout(300_000);
  await seedAuth(page, 'test-teacher@epochquiz.test', 'TestPass@123', 'teacher');
  await sweep(page, 'teacher', TEACHER_ROUTES);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
});

test('audit: student', async ({ page }) => {
  test.setTimeout(300_000);
  await seedAuth(page, 'test-student@epochquiz.test', 'TestPass@123', 'student');
  await sweep(page, 'student', STUDENT_ROUTES);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  expect(true).toBe(true);
});
