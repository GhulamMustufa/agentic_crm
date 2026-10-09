import { test, expect } from '@playwright/test';

test.describe('Dashboard & Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Inject authenticated session
    await page.addInitScript(() => {
      localStorage.setItem('agentic_os_token', 'mock-token-xyz');
      localStorage.setItem('agentic_os_tenant_id', 'org-1');
      localStorage.setItem(
        'agentic_os_user',
        JSON.stringify({
          id: 'usr-1',
          email: 'founder@omnicorp.io',
          fullName: 'Founder',
          tenantId: 'org-1',
        }),
      );
      document.cookie = 'token=mock-token-xyz; path=/';
      document.cookie = 'tenantId=org-1; path=/';
    });

    // Mock API responses
    await page.route('**/api/v1/organizations/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { id: 'org-1', name: 'OmniCorp Inc.', baseCurrency: 'USD' },
        }),
      });
    });

    await page.route('**/api/v1/banking/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            booksStatus: 'RECONCILED',
            transactionsProcessedCount: 42,
            reconciledAmountCents: 1250000,
            pendingExceptionsCount: 2,
            totalCashBalanceCents: 5400000,
            accounts: [],
            recentTransactions: [],
          },
        }),
      });
    });

    await page.route('**/api/v1/banking/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/banking/transactions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/banking/statements', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route('**/api/v1/banking/exceptions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test('should render dashboard metrics and navigate across main sections', async ({ page }) => {
    // 1. Visit Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /financial command center/i })).toBeVisible();

    // 2. Verify Key Metric Cards with exact match
    await expect(page.getByText('Financial Health', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Cash Balance', { exact: true })).toBeVisible();
    await expect(page.getByText('Bookkeeping Accuracy', { exact: true })).toBeVisible();

    // 3. Test Sidebar Navigation: Approvals
    await page.getByRole('link', { name: 'Approvals' }).click();
    await expect(page).toHaveURL(/\/exceptions/);
    await expect(page.getByRole('heading', { name: /review & approvals/i })).toBeVisible();

    // 4. Test Sidebar Navigation: Banking
    await page.getByRole('link', { name: 'Banking' }).click();
    await expect(page).toHaveURL(/\/banking/);
    await expect(page.getByRole('heading', { name: /bank accounts/i })).toBeVisible();

    // 5. Test Sidebar Navigation: Overview
    await page.getByRole('link', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/\//);
    await expect(page.getByRole('heading', { name: /financial command center/i })).toBeVisible();
  });
});
