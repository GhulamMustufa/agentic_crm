import { test, expect } from '@playwright/test';

test.describe('Forgot Password & Password Reset Flow', () => {
  test('should complete the end-to-end forgot password and reset flow', async ({ page }) => {
    // 1. Mock forgot-password API
    await page.route('**/api/v1/auth/forgot-password', async (route) => {
      const requestData = JSON.parse(route.request().postData() || '{}');
      expect(requestData.email).toBe('founder@omnicorp.io');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            message: 'If an account exists, instructions have been sent.',
            debugToken: 'mock-valid-reset-token-123',
          },
        }),
      });
    });

    // 2. Mock reset-password API
    await page.route('**/api/v1/auth/reset-password', async (route) => {
      const requestData = JSON.parse(route.request().postData() || '{}');
      expect(requestData.token).toBe('mock-valid-reset-token-123');
      expect(requestData.newPassword).toBe('NewSecurePassword123!');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            message: 'Password has been successfully reset.',
          },
        }),
      });
    });

    // 3. Mock login API with new password
    await page.route('**/api/v1/auth/login', async (route) => {
      const requestData = JSON.parse(route.request().postData() || '{}');
      expect(requestData.email).toBe('founder@omnicorp.io');
      expect(requestData.password).toBe('NewSecurePassword123!');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tokens: { accessToken: 'new-mock-jwt-token', refreshToken: 'new-mock-refresh-token' },
            user: {
              id: 'usr-1',
              email: 'founder@omnicorp.io',
              fullName: 'Founder',
              tenantId: 'org-1',
            },
          },
        }),
      });
    });

    // 4. Mock organizations & dashboard queries for post-login
    await page.route(/\/api\/v1\/organizations/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'org-1', name: 'OmniCorp Inc.', legalName: 'OmniCorp Inc.', baseCurrency: 'USD' },
          ],
        }),
      });
    });

    await page.route('**/api/v1/dashboard/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            totalBalanceCents: 5000000,
            transactionCount: 12,
            totalReconciledCents: 4500000,
            exceptionsCount: 0,
            accounts: [],
            recentTransactions: [],
            primaryCurrency: 'USD',
          },
        }),
      });
    });

    await page.route('**/api/v1/banking/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });

    // Step A: Start from /login and click "Forgot your password?"
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await page.getByRole('link', { name: /forgot your password\?/i }).click();

    // Step B: Land on /forgot-password
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { name: /forgot your password\?/i })).toBeVisible();

    // Step C: Submit email for password reset
    await page.locator('#email').fill('founder@omnicorp.io');
    await page.getByRole('button', { name: /send password reset link/i }).click();

    // Step D: Verify confirmation screen & cooldown
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expect(page.getByText(/founder@omnicorp\.io/i)).toBeVisible();
    // Resend button should show countdown or be disabled
    const resendBtn = page.getByRole('button', { name: /resend email in/i });
    await expect(resendBtn).toBeVisible();
    await expect(resendBtn).toBeDisabled();

    // Step E: Navigate to /reset-password using token received
    await page.goto('/reset-password?token=mock-valid-reset-token-123');
    await expect(page.getByRole('heading', { name: /create new password/i })).toBeVisible();

    // Step F: Fill new password and confirm
    await page.locator('#password').fill('NewSecurePassword123!');
    await page.locator('#confirmPassword').fill('NewSecurePassword123!');
    await page.getByRole('button', { name: /set new password/i }).click();

    // Step G: Verify Password Reset Complete success screen
    await expect(page.getByRole('heading', { name: /password reset complete!/i })).toBeVisible();

    // Step H: Wait for automatic redirect or click "Sign in now" to return to /login
    await expect(page).toHaveURL(/\/login(\?reset=success)?/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    // Step I: Sign in with the newly reset password
    await page.locator('#email').fill('founder@omnicorp.io');
    await page.locator('#password').fill('NewSecurePassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Step J: Verify arrival on Dashboard
    await expect(page).toHaveURL(/\//, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /financial command center/i })).toBeVisible();
  });

  test('should validate email format and support "use different email" on forgot password page', async ({
    page,
  }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot your password\?/i })).toBeVisible();

    // 1. Try submitting empty form
    await page.getByRole('button', { name: /send password reset link/i }).click();
    await expect(page.getByText(/please enter a valid email address/i)).toBeVisible();

    // 2. Try submitting invalid email format
    await page.locator('#email').fill('not-an-email');
    await page.getByRole('button', { name: /send password reset link/i }).click();
    await expect(page.getByText(/please enter a valid email address/i)).toBeVisible();

    // 3. Mock success and submit valid email
    await page.route('**/api/v1/auth/forgot-password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { message: 'Instructions sent' } }),
      });
    });

    await page.locator('#email').fill('valid@omnicorp.io');
    await page.getByRole('button', { name: /send password reset link/i }).click();
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    // 4. Click "Use a different email address"
    await page.getByRole('button', { name: /use a different email address/i }).click();
    await expect(page.getByRole('heading', { name: /forgot your password\?/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();

    // 5. Test "Back to Sign in" link
    await page.getByRole('link', { name: /back to sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show invalid reset link state when token is missing', async ({ page }) => {
    // Visit reset password without ?token=
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: /invalid reset link/i })).toBeVisible();
    await expect(page.getByText(/no recovery token was found in the link/i)).toBeVisible();

    // Click "Request a new link" button
    await page.getByRole('button', { name: /request a new link/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('should validate password length and password matching on reset page', async ({ page }) => {
    await page.goto('/reset-password?token=test-validation-token');
    await expect(page.getByRole('heading', { name: /create new password/i })).toBeVisible();

    // 1. Password too short (< 8 chars)
    await page.locator('#password').fill('short');
    await page.locator('#confirmPassword').fill('short');
    await page.getByRole('button', { name: /set new password/i }).click();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();

    // 2. Password mismatch
    await page.locator('#password').fill('ValidPass123!');
    await page.locator('#confirmPassword').fill('DifferentPass123!');
    await page.getByRole('button', { name: /set new password/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('should display error message when token is expired or invalid on submission', async ({
    page,
  }) => {
    // Mock API rejecting invalid/expired token with 400
    await page.route('**/api/v1/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: 'Invalid or expired password reset link',
        }),
      });
    });

    await page.goto('/reset-password?token=expired-token-999');
    await expect(page.getByRole('heading', { name: /create new password/i })).toBeVisible();

    await page.locator('#password').fill('StrongPassword123!');
    await page.locator('#confirmPassword').fill('StrongPassword123!');
    await page.getByRole('button', { name: /set new password/i }).click();

    // Assert error callout
    await expect(
      page.getByText(
        /this password reset link is invalid or has expired\. please request a new link\./i,
      ),
    ).toBeVisible();

    // Click recovery link from the error banner
    await page.getByRole('link', { name: /request a new reset link/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});
