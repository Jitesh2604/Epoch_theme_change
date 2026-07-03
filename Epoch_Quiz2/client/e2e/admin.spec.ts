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
  // Wait for the dashboard shell to finish booting (session refresh settles)
  // before any subsequent hard navigation, so single-use refresh tokens
  // aren't consumed mid-flight.
  await page.waitForSelector('aside', { timeout: 10_000 });
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
    await page.getByRole('link', { name: 'Teachers', exact: true }).click();
    await page.waitForURL('**/admin/teachers', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Teachers' })).toBeVisible();
  });

  test('Students page renders table', async ({ page }) => {
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.waitForURL('**/admin/students', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  });

  test('Assessments page renders', async ({ page }) => {
    await page.getByRole('link', { name: 'Assessments', exact: true }).click();
    await page.waitForURL('**/admin/assessments', { timeout: 5_000 });
    await expect(page.locator('text=Assessment Management')).toBeVisible();
  });

  test('Reports page renders tabs', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports & Analytics', exact: true }).click();
    await page.waitForURL('**/admin/reports', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
    await expect(page.locator('main').getByText('Overview', { exact: true })).toBeVisible();
  });

  test('Settings page renders tabs', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/admin/settings', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Platform Settings' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Security' })).toBeVisible();
  });

  test('Settings can switch tabs', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/admin/settings', { timeout: 5_000 });
    const securityTab = page.getByRole('button', { name: 'Security' });
    await securityTab.click();
    // Active tab gets the brand background — proves the tab actually switched.
    await expect(securityTab).toHaveClass(/bg-brand/, { timeout: 3_000 });
  });

  test('Question Bank renders questions list', async ({ page }) => {
    await page.getByRole('link', { name: 'Question Bank', exact: true }).click();
    await page.waitForURL('**/admin/question-bank', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Question Bank' })).toBeVisible();
  });
});
