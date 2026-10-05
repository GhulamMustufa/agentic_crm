import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../core/config/config.service';
import {
  ConflictError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from '../../../core/errors/app-error';
import { PasswordHasher } from '../../../core/security/password-hasher';
import { TokenService } from '../../../core/security/token.service';
import { USER_REPOSITORY_TOKEN, type IUserRepository } from '../domain/user.repository.interface';
import {
  type RegisterDto,
  type LoginDto,
  type RefreshTokenDto,
  type AuthResponseDto,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly config: AppConfigService,
  ) {}

  async register(rawDto: RegisterDto): Promise<AuthResponseDto> {
    const parseResult = registerSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Registration validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const existingUser = await this.userRepo.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictError(`User with email '${dto.email}' already exists`);
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.userRepo.create({
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      fullName: dto.fullName.trim(),
      isSuperadmin: false,
      status: 'ACTIVE',
    });

    return this.createAuthSession(user.id, user.email, user.fullName);
  }

  async login(
    rawDto: LoginDto,
    metadata?: { ip?: string; userAgent?: string },
  ): Promise<AuthResponseDto> {
    const parseResult = loginSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Login validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthenticationError(`User account is ${user.status.toLowerCase()}`);
    }

    const isMatch = await this.passwordHasher.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid email or password');
    }

    return this.createAuthSession(user.id, user.email, user.fullName, metadata);
  }

  async refreshToken(rawDto: RefreshTokenDto): Promise<AuthResponseDto> {
    const parseResult = refreshTokenSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Refresh token validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const tokenHash = this.hashToken(dto.refreshToken);

    const session = await this.userRepo.findSessionByTokenHash(tokenHash);
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token revoked or expired');
    }

    // Revoke old session and issue new token pair (rotation)
    await this.userRepo.revokeSession(session.id);

    const user = await this.userRepo.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError('User associated with token no longer active');
    }

    return this.createAuthSession(user.id, user.email, user.fullName);
  }

  async getProfile(
    userId: string,
  ): Promise<{ id: string; email: string; fullName: string; isSuperadmin: boolean }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperadmin: user.isSuperadmin,
    };
  }

  private async createAuthSession(
    userId: string,
    email: string,
    fullName: string,
    metadata?: { ip?: string; userAgent?: string },
  ): Promise<AuthResponseDto> {
    const accessToken = this.tokenService.generateAccessToken({ sub: userId, email });
    const refreshToken = this.tokenService.generateRefreshToken(userId);

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.userRepo.createSession({
      userId,
      refreshTokenHash: tokenHash,
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
      expiresAt,
      isRevoked: false,
    });

    return {
      user: {
        id: userId,
        email,
        fullName,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
