import { test, expect } from '@playwright/test';

test.describe('Banking & Statement Ingestion Flow', () => {
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

    await page.route('**/api/v1/banking/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'acc-1',
              accountName: 'Operating Vault',
              institutionName: 'Chase Business Checking',
              accountType: 'CHECKING',
              currency: 'USD',
              accountNumberLast4: '4092',
              currentBalanceCents: '1250000',
              reconciledBalanceCents: '1250000',
              isActive: true,
              createdAt: '2026-10-01T00:00:00Z',
            },
            {
              id: 'acc-2',
              accountName: 'Reserve Vault',
              institutionName: 'SVB Corporate Savings',
              accountType: 'SAVINGS',
              currency: 'USD',
              accountNumberLast4: '8812',
              currentBalanceCents: '5400000',
              reconciledBalanceCents: '5400000',
              isActive: true,
              createdAt: '2026-10-01T00:00:00Z',
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/banking/statements', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test('should display connected bank accounts and statement upload dropzone', async ({ page }) => {
    // 1. Visit Banking Page
    await page.goto('/banking');
    await expect(page.getByRole('heading', { name: /bank accounts/i })).toBeVisible();

    // 2. Verify Connected Accounts
    await expect(page.getByText('Chase Business Checking')).toBeVisible();
    await expect(page.getByText('SVB Corporate Savings')).toBeVisible();

    // 3. Verify Statement Upload Dropzone & Bank Badges
    const uploadDropzone = page.getByText(/click or drag bank statements here/i);
    await expect(uploadDropzone).toBeVisible();
    await expect(page.getByText('Maybank', { exact: true })).toBeVisible();
    await expect(page.getByText('Chase', { exact: true })).toBeVisible();
    await expect(page.getByText('Mercury', { exact: true })).toBeVisible();
  });
});
