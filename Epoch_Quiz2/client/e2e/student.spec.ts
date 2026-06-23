import { test, expect } from '@playwright/test';
import { TEST_STUDENT, loginAs, waitForDashboard } from './helpers';

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_STUDENT.email, TEST_STUDENT.password);
    await waitForDashboard(page);
  });

  test('renders student dashboard', async ({ page }) => {
    await page.waitForURL('**/student', { timeout: 8_000 });
    const body = await page.locator('main').textContent();
    expect(body?.length ?? 0).toBeGreaterThan(20);
  });

  test('My Assessments page renders', async ({ page }) => {
    await page.click('text=My Assessments');
    await page.waitForURL('**/student/assessments', { timeout: 5_000 });
    await expect(page.locator('text=My Assessments')).toBeVisible();
  });

  test('Results page renders', async ({ page }) => {
    await page.click('text=Results');
    await page.waitForURL('**/student/results', { timeout: 5_000 });
    await expect(page.locator('text=Results')).toBeVisible();
  });

  test('Leaderboard page renders', async ({ page }) => {
    await page.click('text=Leaderboard');
    await page.waitForURL('**/student/leaderboard', { timeout: 5_000 });
    await expect(page.locator('text=Leaderboard')).toBeVisible();
  });

  test('Join Assessment page has 6-digit code input', async ({ page }) => {
    await page.click('text=Join Assessment');
    await page.waitForURL('**/student/join', { timeout: 5_000 });
    const inputs = page.locator('input[maxlength="1"]');
    await expect(inputs).toHaveCount(6, { timeout: 3_000 });
  });

  test('Notifications page shows notification list (no admin buttons)', async ({ page }) => {
    await page.click('text=Notifications');
    await page.waitForURL('**/student/notifications', { timeout: 5_000 });
    // Student page should NOT have "New notification" button
    const newBtn = page.locator('text=New notification');
    await expect(newBtn).toHaveCount(0);
  });

  test('Profile page loads', async ({ page }) => {
    await page.goto('/student/profile');
    await expect(page.locator('text=My Profile')).toBeVisible({ timeout: 5_000 });
  });
});
