import { test, expect } from '@playwright/test';

test.describe('Banking & Statement Ingestion Flow', () => {
  test('should display connected bank accounts and simulate statement upload processing', async ({
    page,
  }) => {
    // 1. Visit Banking Page
    await page.goto('/banking');
    await expect(page.getByRole('heading', { name: /bank accounts/i })).toBeVisible();

    // 2. Verify Connected Accounts
    await expect(page.getByText('Chase Business Checking')).toBeVisible();
    await expect(page.getByText('SVB Corporate Savings')).toBeVisible();

    // 3. Trigger Statement Upload Simulation
    const uploadDropzone = page.getByText(/click to upload statement/i);
    await expect(uploadDropzone).toBeVisible();
    await uploadDropzone.click();

    // 4. Assert Progress Indicator Starts
    await expect(page.getByText('Data Extraction')).toBeVisible();

    // 5. Wait for Complete State (simulation finishes in ~6s)
    await expect(page.getByText(/last upload successful/i)).toBeVisible({ timeout: 15000 });
  });
});
