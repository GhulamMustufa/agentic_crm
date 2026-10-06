import { describe, it, expect, beforeEach } from 'vitest';

import { AppConfigService } from '@/core/config/config.service';
import { ConflictError, AuthenticationError, ValidationError } from '@/core/errors/app-error';
import { PasswordHasher } from '@/core/security/password-hasher';
import { TokenService } from '@/core/security/token.service';
import { InMemoryUserRepository } from '@/modules/identity/repositories/in-memory-user.repository';
import { AuthService } from '@/modules/identity/services/auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userRepo: InMemoryUserRepository;
  let passwordHasher: PasswordHasher;
  let tokenService: TokenService;
  let config: AppConfigService;

  beforeEach(() => {
    config = new AppConfigService({
      JWT_SECRET: 'test_jwt_secret_with_sufficient_length_123',
      JWT_REFRESH_SECRET: 'test_refresh_secret_with_sufficient_length_123',
      JWT_EXPIRES_IN: '1h',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    userRepo = new InMemoryUserRepository();
    passwordHasher = new PasswordHasher();
    tokenService = new TokenService(config);
    authService = new AuthService(userRepo, passwordHasher, tokenService, config);
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
});
