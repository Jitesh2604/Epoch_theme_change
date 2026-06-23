import { test, expect } from '@playwright/test';

const ADMIN = {
  email:    process.env.E2E_ADMIN_EMAIL    ?? 'admin@epoch.local',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@12345',
};

async function loginAdmin(page: any) {
  await page.goto('/#/login');
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**', { timeout: 10_000 });
}

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test('renders admin overview with stat cards', async ({ page }) => {
    await expect(page.locator('text=Total Teachers')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Total Students')).toBeVisible();
  });

  test('Teachers page renders table', async ({ page }) => {
    await page.click('text=Teachers');
    await page.waitForURL('**/admin/teachers', { timeout: 5_000 });
    await expect(page.locator('text=Teachers')).toBeVisible();
  });

  test('Students page renders table', async ({ page }) => {
    await page.click('text=Students');
    await page.waitForURL('**/admin/students', { timeout: 5_000 });
    await expect(page.locator('text=Students')).toBeVisible();
  });

  test('Assessments page renders', async ({ page }) => {
    await page.click('text=Assessments');
    await page.waitForURL('**/admin/assessments', { timeout: 5_000 });
    await expect(page.locator('text=Assessment Management')).toBeVisible();
  });

  test('Reports page renders tabs', async ({ page }) => {
    await page.click('text=Reports');
    await page.waitForURL('**/admin/reports', { timeout: 5_000 });
    await expect(page.locator('text=Reports & Analytics')).toBeVisible();
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Students')).toBeVisible();
  });

  test('Settings page renders tabs', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.locator('text=Platform Settings')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=General')).toBeVisible();
    await expect(page.locator('text=Security')).toBeVisible();
  });

  test('Settings can switch tabs', async ({ page }) => {
    await page.goto('/admin/settings');
    await page.click('text=Security');
    await expect(page.locator('text=security.')).toBeVisible({ timeout: 3_000 });
  });

  test('Question Bank renders questions list', async ({ page }) => {
    await page.click('text=Question Bank');
    await page.waitForURL('**/admin/question-bank', { timeout: 5_000 });
    await expect(page.locator('text=Question Bank')).toBeVisible();
  });
});
