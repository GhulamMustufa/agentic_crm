import { test, expect } from '@playwright/test';

test.describe('Exception Center Review & Resolution Flow', () => {
  test('should inspect AI proposals and approve an exception with optimistic UI update', async ({ page }) => {
    // 1. Visit Exception Center
    await page.goto('/exceptions');
    await expect(page.getByRole('heading', { name: /exception center/i })).toBeVisible();

    // 2. Verify Exception Items in Left Pane
    const firstException = page.locator('span', { hasText: /unrecognized vendor/i });
    await expect(firstException).toBeVisible();

    // 3. Verify AI Analysis & Proposal in Right Pane
    await expect(page.getByRole('heading', { name: /ai analysis & proposal/i })).toBeVisible();
    await expect(page.getByText(/stripe merchant payout/i)).toBeVisible();

    // 4. Click Second Exception to Switch Focus
    const secondException = page.locator('span', { hasText: /cloudflare hosting/i });
    await expect(secondException).toBeVisible();
    await secondException.click();

    // 5. Verify Detail Pane Updated for Second Exception
    await expect(page.getByText(/match to recurring vendor cloudflare inc/i)).toBeVisible();

    // 6. Approve the Proposal
    const approveButton = page.getByRole('button', { name: /approve proposal/i });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // 7. Optimistic UI Verification: Approved Item Removed from List
    await expect(page.locator('span', { hasText: /cloudflare hosting/i })).not.toBeVisible({ timeout: 5000 });
  });
});
