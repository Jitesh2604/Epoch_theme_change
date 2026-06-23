import { test, expect } from '@playwright/test';
import { TEST_TEACHER, TEST_STUDENT, loginAs } from './helpers';

// ---------------------------------------------------------------------------
// Authentication flows
// ---------------------------------------------------------------------------

test.describe('Login', () => {
  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/#/login');
    await page.click('button[type="submit"]');
    // Password field should show an error
    await expect(page.locator('.auth-error').first()).toBeVisible();
  });

  test('rejects wrong credentials', async ({ page }) => {
    await page.goto('/#/login');
    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'WrongPassword1');
    await page.click('button[type="submit"]');
    await expect(page.locator('.auth-error').first()).toBeVisible();
  });

  test('teacher can log in and reach teacher dashboard', async ({ page }) => {
    await loginAs(page, TEST_TEACHER.email, TEST_TEACHER.password);
    await page.waitForURL('**/teacher**', { timeout: 10_000 });
    await expect(page).toHaveURL(/teacher/);
  });

  test('student can log in and reach student dashboard', async ({ page }) => {
    await loginAs(page, TEST_STUDENT.email, TEST_STUDENT.password);
    await page.waitForURL('**/student**', { timeout: 10_000 });
    await expect(page).toHaveURL(/student/);
  });
});

test.describe('Forgot Password', () => {
  test('navigates to forgot password page from login', async ({ page }) => {
    await page.goto('/#/login');
    await page.click('text=Forgot password?');
    await expect(page).toHaveURL(/#\/forgot-password/);
  });

  test('forgot password page accepts email and shows confirmation', async ({ page }) => {
    await page.goto('/#/forgot-password');
    await page.fill('input[type="email"]', 'anyuser@example.com');
    await page.click('button[type="submit"]');
    // Should show "Check your inbox" regardless of whether email exists
    await expect(page.locator('text=Check your inbox')).toBeVisible({ timeout: 5_000 });
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await page.goto('/#/forgot-password');
    await page.fill('input[type="email"]', 'notanemail');
    await page.click('button[type="submit"]');
    await expect(page.locator('.auth-error').first()).toBeVisible();
  });
});

test.describe('Logout', () => {
  test('teacher can log out', async ({ page }) => {
    await loginAs(page, TEST_TEACHER.email, TEST_TEACHER.password);
    await page.waitForURL('**/teacher**', { timeout: 10_000 });
    // Open user menu
    await page.click('header button:has-text("Teacher")');
    await page.click('text=Sign out');
    // Should redirect to login hash page
    await page.waitForURL(url => url.hash.includes('login') || !url.pathname.includes('teacher'), { timeout: 8_000 });
  });
});

test.describe('Protected routes', () => {
  test('unauthenticated user is redirected away from dashboard', async ({ page }) => {
    await page.goto('/teacher');
    // Should show "Sign in required" or redirect
    const body = await page.textContent('body');
    const redirected = page.url().includes('login') || (body?.includes('Sign in') ?? false);
    expect(redirected).toBe(true);
  });
});
