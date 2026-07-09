import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'audit-out');
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [768, 820, 920, 1000, 1023, 1024, 1280];

async function seedAuth(page: Page) {
  const res = await page.request.post('http://localhost:3000/api/v1/auth/login', {
    data: { email: 'admin@epoch.local', password: 'Admin@12345' },
  });
  const body = await res.json();
  const user = { ...body.data.user, profileComplete: true };
  const auth = { name: user.name, email: user.email, role: 'admin', signedInAt: Date.now() };
  await page.route('**/api/v1/auth/refresh', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { accessToken: body.data.accessToken, refreshToken: body.data.refreshToken } }) }));
  await page.addInitScript(([a, u, rt]) => {
    localStorage.setItem('epoch-auth', a); localStorage.setItem('epoch-user', u); localStorage.setItem('epoch-refresh-token', rt);
  }, [JSON.stringify(auth), JSON.stringify(user), body.data.refreshToken] as [string, string, string]);
}

/** Any header descendant that overflows the viewport width = a broken navbar. */
async function navOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const header = document.querySelector('header.nav');
    if (!header) return { ok: false, reason: 'no header' };
    const bad: string[] = [];
    header.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2) return;
      if (r.right > vw + 1 || r.left < -1) bad.push((el.className || el.tagName).toString().slice(0, 40) + ` r=${Math.round(r.right)}`);
    });
    return { ok: bad.length === 0, vw, offenders: bad.slice(0, 6) };
  });
}

test('navbar — logged in — all tablet widths', async ({ page }) => {
  test.setTimeout(240_000);
  await seedAuth(page);
  const results: any = {};
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    results[w] = await navOverflow(page);
    await page.locator('header.nav').screenshot({ path: path.join(OUT, `nav_in_${w}.png`) }).catch(() => {});
    // Capture the open drawer at a representative tablet + phone width.
    if (w === 920 || w === 768) {
      await page.locator('.menu-btn').click().catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `nav_drawer_${w}.png`) }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  fs.writeFileSync(path.join(OUT, 'nav-report-in.json'), JSON.stringify(results, null, 2));
  for (const w of WIDTHS) expect(results[w].ok, `logged-in navbar overflow at ${w}px: ${JSON.stringify(results[w].offenders)}`).toBe(true);
});

test('navbar — logged out — all tablet widths', async ({ page }) => {
  test.setTimeout(240_000);
  const results: any = {};
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto('/#/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    results[w] = await navOverflow(page);
    await page.locator('header.nav').screenshot({ path: path.join(OUT, `nav_out_${w}.png`) }).catch(() => {});
  }
  fs.writeFileSync(path.join(OUT, 'nav-report-out.json'), JSON.stringify(results, null, 2));
  for (const w of WIDTHS) expect(results[w].ok, `logged-out navbar overflow at ${w}px: ${JSON.stringify(results[w].offenders)}`).toBe(true);
});
