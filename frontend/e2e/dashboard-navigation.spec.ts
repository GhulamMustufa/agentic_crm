import { test, expect } from '@playwright/test';

test.describe('Dashboard & Navigation Flow', () => {
  test('should render dashboard metrics and navigate across main sections', async ({ page }) => {
    // 1. Visit Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /ai accountant overview/i })).toBeVisible();

    // 2. Verify Key Metric Cards
    await expect(page.getByText('Books Status')).toBeVisible();
    await expect(page.getByText('Transactions Processed')).toBeVisible();
    await expect(page.getByText('Reconciled Amount')).toBeVisible();
    await expect(page.getByText('Requiring human attention')).toBeVisible();

    // 3. Test Quick Action: View Exceptions
    await page.getByRole('link', { name: /view exceptions/i }).click();
    await expect(page).toHaveURL(/\/exceptions/);
    await expect(page.getByRole('heading', { name: /exception center/i })).toBeVisible();

    // 4. Test Sidebar Navigation: Banking
    await page.getByRole('link', { name: 'Banking' }).click();
    await expect(page).toHaveURL(/\/banking/);
    await expect(page.getByRole('heading', { name: /bank accounts/i })).toBeVisible();

    // 5. Test Sidebar Navigation: Overview
    await page.getByRole('link', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/\//);
    await expect(page.getByRole('heading', { name: /ai accountant overview/i })).toBeVisible();
  });
});
