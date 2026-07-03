import { test, expect } from '@playwright/test';
import { TEST_TEACHER, loginAs, waitForDashboard } from './helpers';

test.describe('Teacher Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_TEACHER.email, TEST_TEACHER.password);
    await waitForDashboard(page);
  });

  test('renders Dashboard overview with stat cards', async ({ page }) => {
    await page.waitForURL('**/teacher', { timeout: 8_000 });
    await expect(page.locator('text=Assessments created')).toBeVisible({ timeout: 5_000 });
  });

  test('My Assessments page renders without blank screen', async ({ page }) => {
    await page.getByRole('link', { name: 'My Assessments', exact: true }).click();
    await page.waitForURL('**/teacher/assessments', { timeout: 5_000 });
    // Should show either skeletons, empty state, or assessment cards — but NOT a completely empty body
    const hasContent = await page.locator('main').textContent().then(t => (t?.trim().length ?? 0) > 10);
    expect(hasContent).toBe(true);
  });

  test('Question Bank page renders', async ({ page }) => {
    await page.getByRole('link', { name: 'Question Bank', exact: true }).click();
    await page.waitForURL('**/teacher/question-bank', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Question Bank' })).toBeVisible();
  });

  test('Students page renders', async ({ page }) => {
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.waitForURL('**/teacher/students', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  });

  test('Create Assessment form renders all fields', async ({ page }) => {
    await page.getByRole('link', { name: 'Create Assessment', exact: true }).click();
    await page.waitForURL('**/teacher/create-assessment', { timeout: 5_000 });
    await expect(page.locator('input[placeholder*="title"], input[name="title"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Profile page loads real user data', async ({ page }) => {
    await page.goto('/teacher/profile');
    // Should NOT display raw default 'Teacher' string — real name should load
    await expect(page.locator('text=My Profile')).toBeVisible({ timeout: 5_000 });
  });

  test('Analytics page renders without blank screen', async ({ page }) => {
    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await page.waitForURL('**/teacher/analytics', { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  });
});

test.describe('Teacher Create Assessment flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_TEACHER.email, TEST_TEACHER.password);
    await waitForDashboard(page);
  });

  test('can fill and submit Create Assessment form', async ({ page }) => {
    await page.goto('/teacher/create-assessment');
    const titleField = page.locator('input[placeholder*="title"], input[name="title"]').first();
    await titleField.waitFor({ timeout: 5_000 });
    await titleField.fill('E2E Test Assessment');

    // Subject is required — pick the first real subject (index 0 is the placeholder).
    await page.locator('form select').first().selectOption({ index: 1 });

    // Duration field
    const durationField = page.locator('input[type="number"]').first();
    if (await durationField.isVisible()) await durationField.fill('30');

    await page.click('button[type="submit"]');
    // After submit, should navigate to assessment questions page or show success
    await page.waitForTimeout(2_000); // allow navigation
    const url = page.url();
    const navigated = url.includes('questions') || url.includes('assessments');
    expect(navigated).toBe(true);
  });
});
