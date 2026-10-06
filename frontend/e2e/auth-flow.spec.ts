import { test, expect } from '@playwright/test';

test.describe('Authentication & Onboarding Flow', () => {
  test('should complete registration and organization onboarding to dashboard', async ({
    page,
  }) => {
    // 1. Visit Register Page
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible();

    // 2. Fill Registration Details
    await page.locator('#firstName').fill('Alexandra');
    await page.locator('#lastName').fill('Vance');
    await page.locator('#email').fill('alexandra.vance@omnicorp.io');
    await page.locator('#password').fill('SuperSecret123!');

    // 3. Submit Registration
    await page.getByRole('button', { name: /sign up/i }).click();

    // 4. Assert Redirect to Setup Page
    await expect(page).toHaveURL(/\/setup/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /set up your organization/i })).toBeVisible();

    // 5. Fill Organization Setup Details
    await page.locator('#companyName').fill('OmniCorp AI Solutions Inc.');
    await page.locator('#industry').fill('Artificial Intelligence & Software');
    await page.locator('#registrationNumber').fill('US-DEL-984210');

    // 6. Submit Setup
    await page.getByRole('button', { name: /complete setup/i }).click();

    // 7. Assert Arrival on Main Dashboard
    await expect(page).toHaveURL(/\//, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /ai accountant overview/i })).toBeVisible();
  });

  test('should login successfully from login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    await page.locator('#email').fill('founder@omnicorp.io');
    await page.locator('#password').fill('Password123!');

    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\//, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /ai accountant overview/i })).toBeVisible();
  });
});
