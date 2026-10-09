import { test, expect } from '@playwright/test';

test.describe('Exception Center Review & Resolution Flow', () => {
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

    let exceptionsList = [
      {
        id: 'exc-001',
        createdAt: '2026-10-06T08:30:00.000Z',
        type: 'UNKNOWN_TRANSACTION',
        exceptionType: 'unrecognized_vendor',
        reason: "Unrecognized payee 'Stripe Merchant Payout'",
        severity: 'medium',
        aiRecommendation:
          'Categorize as Stripe Merchant Payout and reconcile against Account 1010.',
        status: 'OPEN',
        evidence: [{ amountCents: 85000 }],
        proposedResolution: { amountCents: 85000, transactionDate: '2026-10-06' },
      },
      {
        id: 'exc-002',
        createdAt: '2026-10-06T09:15:00.000Z',
        type: 'AMBIGUOUS_TRANSACTION',
        exceptionType: 'ambiguous_category',
        reason: 'Ambiguous Category: Cloudflare Hosting',
        severity: 'medium',
        aiRecommendation:
          'Match to recurring vendor Cloudflare Inc. and allocate to 6010 Hosting Expense.',
        status: 'OPEN',
        evidence: [{ amountCents: 14250 }],
        proposedResolution: { amountCents: 14250, transactionDate: '2026-10-06' },
      },
    ];

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

    await page.route(/\/api\/v1\/banking\/exceptions/, async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === 'POST') {
        const idMatch = url.match(/\/banking\/exceptions\/([^/?]+)\/resolve/);
        if (idMatch) {
          const resolvedId = idMatch[1];
          exceptionsList = exceptionsList.filter((e) => e.id !== resolvedId);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { success: true } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: exceptionsList }),
        });
      }
    });
  });

  test('should inspect AI proposals and approve an exception with optimistic UI update', async ({
    page,
  }) => {
    // 1. Visit Exception Center
    await page.goto('/exceptions');
    await expect(page.getByRole('heading', { name: /review & approvals/i })).toBeVisible();

    // 2. Verify Exception Items in Left Pane
    await expect(page.getByText(/stripe merchant payout/i).first()).toBeVisible();

    // 3. Verify AI Analysis & Proposal in Right Pane
    await expect(page.getByText(/ai recommendation:/i)).toBeVisible();
    await expect(page.getByText(/stripe merchant payout/i).first()).toBeVisible();

    // 4. Click Second Exception to Switch Focus
    const secondException = page.getByRole('button', { name: /cloudflare hosting/i });
    await expect(secondException).toBeVisible();
    await secondException.click();

    // 5. Verify Detail Pane Updated for Second Exception
    await expect(page.getByText(/match to recurring vendor cloudflare inc/i).first()).toBeVisible();

    // 6. Approve the Proposal
    const approveButton = page.getByRole('button', { name: /approve & record/i });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // 7. Verify Item Removed from Review Queue
    await expect(page.getByRole('button', { name: /cloudflare hosting/i })).not.toBeVisible({
      timeout: 5000,
    });
  });
});
