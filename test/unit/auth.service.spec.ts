import * as crypto from 'crypto';

import { describe, it, expect, beforeEach } from 'vitest';

import { AppConfigService } from '@/core/config/config.service';
import { EmailService } from '@/core/email/email.service';
import { ConflictError, AuthenticationError, ValidationError } from '@/core/errors/app-error';
import { PasswordHasher } from '@/core/security/password-hasher';
import { TokenService } from '@/core/security/token.service';
import { InMemoryUserRepository } from '@/modules/identity/repositories/in-memory-user.repository';
import { AuthService } from '@/modules/identity/services/auth.service';
import { InMemoryTenantRepository } from '@/modules/organization/repositories/in-memory-tenant.repository';

describe('AuthService', () => {
  let authService: AuthService;
  let userRepo: InMemoryUserRepository;
  let tenantRepo: InMemoryTenantRepository;
  let passwordHasher: PasswordHasher;
  let tokenService: TokenService;
  let config: AppConfigService;
  let emailService: EmailService;

  beforeEach(() => {
    config = new AppConfigService({
      JWT_SECRET: 'test_jwt_secret_with_sufficient_length_123',
      JWT_REFRESH_SECRET: 'test_refresh_secret_with_sufficient_length_123',
      JWT_EXPIRES_IN: '7d',
      JWT_REFRESH_EXPIRES_IN: '30d',
      FRONTEND_URL: 'http://localhost:3000',
    });
    userRepo = new InMemoryUserRepository();
    tenantRepo = new InMemoryTenantRepository();
    passwordHasher = new PasswordHasher();
    tokenService = new TokenService(config);
    emailService = new EmailService(config);
    authService = new AuthService(
      userRepo,
      tenantRepo,
      passwordHasher,
      tokenService,
      config,
      emailService,
    );
  });

  it('should register a new user and return tokens', async () => {
    const result = await authService.register({
      email: 'alex@example.com',
      password: 'password123',
      fullName: 'Alex Founder',
    });

    expect(result.user.id).toBeDefined();
    expect(result.user.email).toBe('alex@example.com');
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.tokens.refreshToken).toBeDefined();

    const storedUser = await userRepo.findByEmail('alex@example.com');
    expect(storedUser).toBeDefined();
    expect(storedUser?.status).toBe('ACTIVE');
    expect(storedUser?.passwordHash).not.toBe('password123');
  });

  it('should throw ConflictError when registering duplicate email', async () => {
    await authService.register({
      email: 'alex@example.com',
      password: 'password123',
      fullName: 'Alex Founder',
    });

    await expect(
      authService.register({
        email: 'alex@example.com',
        password: 'anotherpassword',
        fullName: 'Alex Duplicate',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should throw ValidationError on invalid email or short password', async () => {
    await expect(
      authService.register({
        email: 'invalid-email',
        password: 'short',
        fullName: 'A',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should successfully log in with valid credentials', async () => {
    await authService.register({
      email: 'alex@example.com',
      password: 'password123',
      fullName: 'Alex Founder',
    });

    const loginResult = await authService.login({
      email: 'alex@example.com',
      password: 'password123',
    });

    expect(loginResult.tokens.accessToken).toBeDefined();
    expect(loginResult.user.email).toBe('alex@example.com');
  });

  it('should reject login with wrong password', async () => {
    await authService.register({
      email: 'alex@example.com',
      password: 'password123',
      fullName: 'Alex Founder',
    });

    await expect(
      authService.login({
        email: 'alex@example.com',
        password: 'wrongpassword',
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('should successfully refresh token and rotate refresh session', async () => {
    const regResult = await authService.register({
      email: 'alex@example.com',
      password: 'password123',
      fullName: 'Alex Founder',
    });

    const refreshResult = await authService.refreshToken({
      refreshToken: regResult.tokens.refreshToken,
    });

    expect(refreshResult.tokens.accessToken).toBeDefined();
    expect(refreshResult.tokens.refreshToken).not.toBe(regResult.tokens.refreshToken);

    // Old refresh token must now be revoked
    await expect(
      authService.refreshToken({
        refreshToken: regResult.tokens.refreshToken,
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  describe('Password Reset Flow', () => {
    it('should request password reset and generate valid token for registered user', async () => {
      await authService.register({
        email: 'founder@example.com',
        password: 'initialPassword123',
        fullName: 'Jane Founder',
      });

      const response = await authService.requestPasswordReset({
        email: 'founder@example.com',
      });

      expect(response.message).toContain('If an account exists');
      expect(response.debugToken).toBeDefined();
      expect(emailService.lastSentResetUrl).toContain('/reset-password?token=');
      expect(emailService.lastSentResetUrl).toContain(response.debugToken);
    });

    it('should return 200 generic message without error for non-existent email (anti-enumeration)', async () => {
      const response = await authService.requestPasswordReset({
        email: 'unknown-user@example.com',
      });

      expect(response.message).toContain('If an account exists');
      expect(response.debugToken).toBeUndefined();
    });

    it('should invalidate previous unused reset tokens if a user requests reset multiple times', async () => {
      await authService.register({
        email: 'multi@example.com',
        password: 'password123',
        fullName: 'Multi Test',
      });

      const req1 = await authService.requestPasswordReset({ email: 'multi@example.com' });
      const req2 = await authService.requestPasswordReset({ email: 'multi@example.com' });

      // First token must now be invalidated
      await expect(
        authService.resetPassword({
          token: req1.debugToken!,
          newPassword: 'brandNewPassword123',
        }),
      ).rejects.toThrow(ValidationError);

      // Second token must succeed
      const resetResult = await authService.resetPassword({
        token: req2.debugToken!,
        newPassword: 'brandNewPassword123',
      });
      expect(resetResult.message).toContain('successfully reset');
    });

    it('should successfully reset password, update hash, and revoke existing sessions', async () => {
      const regResult = await authService.register({
        email: 'resetme@example.com',
        password: 'oldPassword123',
        fullName: 'Reset Me',
      });

      const req = await authService.requestPasswordReset({ email: 'resetme@example.com' });
      expect(req.debugToken).toBeDefined();

      const result = await authService.resetPassword({
        token: req.debugToken!,
        newPassword: 'newSecurePassword456',
      });

      expect(result.message).toContain('successfully reset');

      // Old password must fail
      await expect(
        authService.login({
          email: 'resetme@example.com',
          password: 'oldPassword123',
        }),
      ).rejects.toThrow(AuthenticationError);

      // New password must succeed
      const newLogin = await authService.login({
        email: 'resetme@example.com',
        password: 'newSecurePassword456',
      });
      expect(newLogin.tokens.accessToken).toBeDefined();

      // Prior session must be revoked
      await expect(
        authService.refreshToken({
          refreshToken: regResult.tokens.refreshToken,
        }),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should reject reset attempt with already used token', async () => {
      await authService.register({
        email: 'reused@example.com',
        password: 'oldPassword123',
        fullName: 'Reused Test',
      });

      const req = await authService.requestPasswordReset({ email: 'reused@example.com' });

      // First reset succeeds
      await authService.resetPassword({
        token: req.debugToken!,
        newPassword: 'newPassword1234',
      });

      // Second attempt with same token must fail
      await expect(
        authService.resetPassword({
          token: req.debugToken!,
          newPassword: 'anotherPassword1234',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Invitation Acceptance Flow', () => {
    let tenantId: string;
    let inviterId: string;
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    beforeEach(async () => {
      const inviter = await userRepo.create({
        email: 'founder@acme.com',
        fullName: 'Jane Founder',
        passwordHash: 'hash',
        isSuperadmin: false,
        status: 'ACTIVE',
      });
      inviterId = inviter.id;

      const tenant = await tenantRepo.createTenant({
        slug: 'acme-holdings',
        legalName: 'Acme Holdings Inc.',
        baseCurrency: 'USD',
        timezone: 'UTC',
        status: 'ACTIVE',
      });
      tenantId = tenant.id;
    });

    it('should retrieve invitation details for valid pending invitation', async () => {
      await tenantRepo.createInvitation({
        tenantId,
        email: 'cpa@accounting.com',
        roleCode: 'CONTROLLER',
        tokenHash,
        invitedByUserId: inviterId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const details = await authService.getInvitationDetails(rawToken);
      expect(details.email).toBe('cpa@accounting.com');
      expect(details.roleCode).toBe('CONTROLLER');
      expect(details.tenantName).toBe('Acme Holdings Inc.');
      expect(details.isExistingUser).toBe(false);
    });

    it('should reject expired invitation details', async () => {
      await tenantRepo.createInvitation({
        tenantId,
        email: 'late@accounting.com',
        roleCode: 'BOOKKEEPER',
        tokenHash,
        invitedByUserId: inviterId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(authService.getInvitationDetails(rawToken)).rejects.toThrow(ValidationError);
    });

    it('should allow a brand new user to accept invitation, create user, membership, and return auth tokens', async () => {
      await tenantRepo.createInvitation({
        tenantId,
        email: 'newhire@acme.com',
        roleCode: 'BOOKKEEPER',
        tokenHash,
        invitedByUserId: inviterId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await authService.acceptInvitation({
        token: rawToken,
        fullName: 'Bob Newhire',
        password: 'securePassword123!',
      });

      expect(res.user.email).toBe('newhire@acme.com');
      expect(res.user.fullName).toBe('Bob Newhire');
      expect(res.tokens.accessToken).toBeDefined();

      // Verify user created active
      const user = await userRepo.findByEmail('newhire@acme.com');
      expect(user).toBeDefined();
      expect(user!.status).toBe('ACTIVE');

      // Verify membership created
      const mem = await tenantRepo.findMembership(tenantId, user!.id);
      expect(mem).toBeDefined();
      expect(mem!.roleCode).toBe('BOOKKEEPER');
      expect(mem!.status).toBe('ACTIVE');

      // Verify invitation marked ACCEPTED
      const updatedInv = await tenantRepo.findInvitationByTokenHash(tokenHash);
      expect(updatedInv!.status).toBe('ACCEPTED');
    });

    it('should allow existing active user to accept invitation and attach membership', async () => {
      const existing = await userRepo.create({
        email: 'existing.cpa@firm.com',
        fullName: 'Claire CPA',
        passwordHash: 'existing_hash',
        isSuperadmin: false,
        status: 'ACTIVE',
      });

      await tenantRepo.createInvitation({
        tenantId,
        email: 'existing.cpa@firm.com',
        roleCode: 'AUDITOR',
        tokenHash,
        invitedByUserId: inviterId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await authService.acceptInvitation({
        token: rawToken,
      });

      expect(res.user.email).toBe('existing.cpa@firm.com');
      expect(res.tokens.accessToken).toBeDefined();

      const mem = await tenantRepo.findMembership(tenantId, existing.id);
      expect(mem).toBeDefined();
      expect(mem!.roleCode).toBe('AUDITOR');
      expect(mem!.status).toBe('ACTIVE');
    });
  });
});
