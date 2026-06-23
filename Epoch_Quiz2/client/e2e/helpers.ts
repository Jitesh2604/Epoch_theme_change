import { type Page } from '@playwright/test';

export const TEST_TEACHER = {
  email:    process.env.E2E_TEACHER_EMAIL    ?? 'test-teacher@epochquiz.test',
  password: process.env.E2E_TEACHER_PASSWORD ?? 'TestPass@123',
  name:     'E2E Teacher',
};
export const TEST_STUDENT = {
  email:    process.env.E2E_STUDENT_EMAIL    ?? 'test-student@epochquiz.test',
  password: process.env.E2E_STUDENT_PASSWORD ?? 'TestPass@123',
  name:     'E2E Student',
};

/** Login via the hash-routed auth page and wait for the dashboard to appear. */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/#/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for URL to change away from the login hash fragment
  await page.waitForURL(url => !url.hash.includes('login'), { timeout: 8_000 });
}

/** Wait for the dashboard sidebar to be visible. */
export async function waitForDashboard(page: Page) {
  await page.waitForSelector('aside', { timeout: 8_000 });
}
