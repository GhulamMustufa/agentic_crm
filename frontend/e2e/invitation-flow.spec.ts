import { test, expect } from '@playwright/test';

test.describe('Invitation System Flow', () => {
  test('should accept invitation as a new user, create account, and access dashboard', async ({
    page,
  }) => {
    const inviteToken = 'mock-new-invite-token-123';

    // 1. Mock GET /auth/invite details
    await page.route(`**/api/v1/auth/invite?token=${inviteToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            email: 'sarah.connor@cyberdyne.com',
            roleCode: 'CONTROLLER',
            tenantName: 'Cyberdyne Systems Corp',
            inviterName: 'Miles Dyson',
            isExistingUser: false,
          },
        }),
      });
    });

    // 2. Mock POST /auth/accept-invite
    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      expect(body.token).toBe(inviteToken);
      expect(body.fullName).toBe('Sarah Connor');
      expect(body.password).toBe('Cyberdyne123!');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              id: 'usr-sarah',
              email: 'sarah.connor@cyberdyne.com',
              fullName: 'Sarah Connor',
            },
            tokens: {
              accessToken: 'mock-sarah-jwt',
              refreshToken: 'mock-sarah-refresh',
            },
          },
        }),
      });
    });

    // 3. Mock GET /organizations
    await page.route(/\/api\/v1\/organizations/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'org-cyberdyne',
              name: 'Cyberdyne Systems Corp',
              legalName: 'Cyberdyne Systems Corp',
              baseCurrency: 'USD',
            },
          ],
        }),
      });
    });

    // 4. Mock dashboard endpoints
    await page.route('**/api/v1/dashboard/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            totalBalanceCents: 12500000,
            transactionCount: 24,
            totalReconciledCents: 11000000,
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

    // Step A: Navigate to invite link
    await page.goto(`/invite?token=${inviteToken}`);

    // Step B: Verify Organization and Inviter details
    await expect(page.getByRole('heading', { name: /join cyberdyne systems corp/i })).toBeVisible();
    await expect(page.getByText(/miles dyson has invited you/i)).toBeVisible();
    await expect(page.getByText(/controller/i).first()).toBeVisible();

    // Verify email input is disabled with invitee email
    const emailInput = page.locator('input[disabled]');
    await expect(emailInput).toHaveValue('sarah.connor@cyberdyne.com');

    // Step C: Fill new account credentials
    await page.locator('#fullName').fill('Sarah Connor');
    await page.locator('#password').fill('Cyberdyne123!');
    await page.locator('#confirmPassword').fill('Cyberdyne123!');

    // Step D: Submit invite acceptance
    await page.getByRole('button', { name: /create account & join team/i }).click();

    // Step E: Verify success state and auto-redirect to dashboard overview
    await expect(page.getByRole('heading', { name: /invitation accepted!/i })).toBeVisible();
    await expect(page).toHaveURL(/\/(overview)?/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /financial command center/i })).toBeVisible();
  });

  test('should accept invitation as an existing user with one-click', async ({ page }) => {
    const inviteToken = 'mock-existing-invite-token-456';

    // 1. Mock GET /auth/invite details for an existing user
    await page.route(`**/api/v1/auth/invite?token=${inviteToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            email: 'john.reese@fintech.io',
            roleCode: 'AUDITOR',
            tenantName: 'Enterprise Security Holdings',
            inviterName: 'Harold Finch',
            isExistingUser: true,
          },
        }),
      });
    });

    // 2. Mock POST /auth/accept-invite
    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      expect(body.token).toBe(inviteToken);
      // No fullName or password required for existing active users
      expect(body.password).toBeUndefined();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user: {
              id: 'usr-john',
              email: 'john.reese@fintech.io',
              fullName: 'John Reese',
            },
            tokens: {
              accessToken: 'mock-john-jwt',
              refreshToken: 'mock-john-refresh',
            },
          },
        }),
      });
    });

    // 3. Mock GET /organizations
    await page.route(/\/api\/v1\/organizations/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'org-enterprise',
              name: 'Enterprise Security Holdings',
              legalName: 'Enterprise Security Holdings',
              baseCurrency: 'USD',
            },
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
            totalBalanceCents: 8500000,
            transactionCount: 15,
            totalReconciledCents: 8000000,
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

    // Step A: Navigate to invite link
    await page.goto(`/invite?token=${inviteToken}`);

    // Step B: Verify Organization details & existing user callout
    await expect(
      page.getByRole('heading', { name: /join enterprise security holdings/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/you already have an active account associated with/i),
    ).toBeVisible();
    await expect(page.getByText(/auditor/i).first()).toBeVisible();

    // Verify password inputs are not rendered
    await expect(page.locator('#password')).toHaveCount(0);
    await expect(page.locator('#fullName')).toHaveCount(0);

    // Step C: Click Accept Invitation & Join
    await page.getByRole('button', { name: /accept invitation & join/i }).click();

    // Step D: Verify success state and auto-redirect
    await expect(page.getByRole('heading', { name: /invitation accepted!/i })).toBeVisible();
    await expect(page).toHaveURL(/\/(overview)?/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /financial command center/i })).toBeVisible();
  });

  test('should show unavailable card when invitation token is missing', async ({ page }) => {
    await page.goto('/invite');

    await expect(page.getByRole('heading', { name: /invitation unavailable/i })).toBeVisible();
    await expect(page.getByText(/no invitation token found in this link/i)).toBeVisible();

    // Test Return to Login button
    await page.getByRole('button', { name: /return to login/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show unavailable card when invitation token is expired or invalid', async ({
    page,
  }) => {
    const expiredToken = 'expired-token-789';

    await page.route(`**/api/v1/auth/invite?token=${expiredToken}`, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: 'This invitation link has expired (valid for 7 days)',
        }),
      });
    });

    await page.goto(`/invite?token=${expiredToken}`);

    await expect(page.getByRole('heading', { name: /invitation unavailable/i })).toBeVisible();
    await expect(
      page.getByRole('paragraph').filter({ hasText: /this invitation link has expired/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /return to login/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should validate required fields and password rules on new user invite form', async ({
    page,
  }) => {
    const inviteToken = 'mock-new-invite-validation';

    await page.route(`**/api/v1/auth/invite?token=${inviteToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            email: 'newuser@omnicorp.io',
            roleCode: 'BOOKKEEPER',
            tenantName: 'OmniCorp HQ',
            inviterName: 'Admin',
            isExistingUser: false,
          },
        }),
      });
    });

    await page.goto(`/invite?token=${inviteToken}`);
    await expect(page.getByRole('heading', { name: /join omnicorp hq/i })).toBeVisible();

    // 1. Password mismatch
    await page.locator('#fullName').fill('New User');
    await page.locator('#password').fill('ValidPass123!');
    await page.locator('#confirmPassword').fill('MismatchPass123!');
    await page.getByRole('button', { name: /create account & join team/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();

    // 2. Short password (< 8 chars)
    await page.locator('#password').fill('pass1');
    await page.locator('#confirmPassword').fill('pass1');
    await page.getByRole('button', { name: /create account & join team/i }).click();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
  });

  test('should invite a team member and revoke the invitation in Settings', async ({ page }) => {
    const tenantId = 'org-e2e-1';

    // Set local storage session before navigating to /settings
    await page.addInitScript(
      ({ tid }) => {
        localStorage.setItem('agentic_os_token', 'mock-owner-token');
        localStorage.setItem('agentic_os_tenant_id', tid);
        localStorage.setItem(
          'agentic_os_user',
          JSON.stringify({
            id: 'usr-owner',
            email: 'owner@omnicorp.io',
            fullName: 'Owner User',
            tenantId: tid,
          }),
        );
        document.cookie = `token=mock-owner-token; path=/; max-age=604800; SameSite=Lax`;
        document.cookie = `tenantId=${tid}; path=/; max-age=604800; SameSite=Lax`;
      },
      { tid: tenantId },
    );

    // Mock settings API endpoints
    await page.route(`**/api/v1/organizations/${tenantId}/settings`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            allowAiAutoPosting: true,
            autoPostMinConfidence: 0.95,
            maxAutoPostAmountCents: 500000,
            requireReceiptAboveCents: 7500,
          },
        }),
      });
    });

    await page.route(`**/api/v1/organizations/${tenantId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: tenantId,
            slug: 'omnicorp-e2e',
            legalName: 'OmniCorp E2E Inc.',
            baseCurrency: 'USD',
            timezone: 'UTC',
          },
        }),
      });
    });

    await page.route(`**/api/v1/organizations/${tenantId}/members`, async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        expect(body.email).toBe('newcolleague@omnicorp.io');
        expect(body.roleCode).toBe('CONTROLLER');

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              invitationId: 'inv-colleague-1',
              email: 'newcolleague@omnicorp.io',
              roleCode: 'CONTROLLER',
              debugInviteUrl: 'http://localhost:3099/invite?token=mock-debug-token-777',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'mem-1',
                userId: 'usr-owner',
                roleCode: 'OWNER',
                status: 'ACTIVE',
                createdAt: new Date().toISOString(),
                user: {
                  id: 'usr-owner',
                  email: 'owner@omnicorp.io',
                  fullName: 'Owner User',
                },
              },
            ],
          }),
        });
      }
    });

    let pendingInvites = [
      {
        id: 'inv-existing-99',
        email: 'preexisting@omnicorp.io',
        roleCode: 'BOOKKEEPER',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    ];

    await page.route(`**/api/v1/organizations/${tenantId}/invitations`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: pendingInvites }),
      });
    });

    await page.route(
      `**/api/v1/organizations/${tenantId}/invitations/inv-existing-99`,
      async (route) => {
        if (route.request().method() === 'DELETE') {
          pendingInvites = [];
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: { success: true } }),
          });
        }
      },
    );

    // Step A: Visit /settings
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /organization settings/i })).toBeVisible();

    // Step B: Switch to Team & Roles tab
    await page.getByRole('button', { name: /team & roles/i }).click();
    await expect(page.getByText('Team Members & Role-Based Access')).toBeVisible();

    // Verify existing member and pending invitation
    await expect(page.getByRole('cell', { name: /owner@omnicorp\.io/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: /preexisting@omnicorp\.io/i })).toBeVisible();

    // Step C: Open Invite Member modal
    await page.getByRole('button', { name: /invite member/i }).click();
    await expect(page.getByText('Invite Team Member')).toBeVisible();

    // Step D: Fill Invite details and send
    await page
      .locator('input[placeholder="colleague@company.com"]')
      .fill('newcolleague@omnicorp.io');
    await page.locator('select').selectOption('CONTROLLER');
    await page.getByRole('button', { name: /send invitation/i }).click();

    // Verify modal closes and recent invite link appears
    await expect(page.getByText('Invite Team Member')).not.toBeVisible();
    await expect(page.getByText(/mock-debug-token-777/i)).toBeVisible();

    // Step E: Revoke the pending invitation
    const revokeButton = page.getByRole('button', { name: /revoke/i });
    await expect(revokeButton).toBeVisible();
    await revokeButton.click();

    // Verify invitation is removed from table
    await expect(page.getByRole('cell', { name: /preexisting@omnicorp\.io/i })).not.toBeVisible();
  });
});
