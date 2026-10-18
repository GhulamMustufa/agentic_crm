import * as crypto from 'crypto';

import { Inject, Injectable, forwardRef } from '@nestjs/common';

import { AppConfigService } from '../../../core/config/config.service';
import { EmailService } from '../../../core/email/email.service';
import {
  ConflictError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from '../../../core/errors/app-error';
import { PasswordHasher } from '../../../core/security/password-hasher';
import { TokenService } from '../../../core/security/token.service';
import {
  TENANT_REPOSITORY_TOKEN,
  type ITenantRepository,
} from '../../organization/domain/tenant.repository.interface';
import { USER_REPOSITORY_TOKEN, type IUserRepository } from '../domain/user.repository.interface';
import {
  type RegisterDto,
  type LoginDto,
  type RefreshTokenDto,
  type AuthResponseDto,
  type ForgotPasswordDto,
  type ResetPasswordDto,
  type AcceptInviteDto,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '../dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepo: IUserRepository,
    @Inject(forwardRef(() => TENANT_REPOSITORY_TOKEN))
    private readonly tenantRepo: ITenantRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly config: AppConfigService,
    private readonly emailService: EmailService,
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

  async requestPasswordReset(
    rawDto: ForgotPasswordDto,
  ): Promise<{ message: string; debugToken?: string }> {
    const parseResult = forgotPasswordSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Password reset request validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const { email } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.userRepo.findByEmail(normalizedEmail);

    // Timing-safe & anti-enumeration: Always return 200 OK generic message
    const genericSuccessMessage =
      'If an account exists with this email address, a password reset link has been sent.';

    if (!user || user.status !== 'ACTIVE') {
      return { message: genericSuccessMessage };
    }

    // Invalidate existing active tokens for this user
    await this.userRepo.invalidateUserPasswordResetTokens(user.id);

    // Generate secure random 32-byte token (hex format = 64 characters)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    // Expiry: 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.userRepo.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const frontendBaseUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = `${frontendBaseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    await this.emailService.sendPasswordResetEmail(user.email, user.fullName, resetUrl);

    return {
      message: genericSuccessMessage,
      ...(this.config.isDevelopment || this.config.isTest ? { debugToken: rawToken } : {}),
    };
  }

  async resetPassword(rawDto: ResetPasswordDto): Promise<{ message: string }> {
    const parseResult = resetPasswordSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Password reset validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const { token, newPassword } = parseResult.data;

    const tokenHash = this.hashToken(token);
    const resetToken = await this.userRepo.findPasswordResetToken(tokenHash);

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired password reset link');
    }

    const user = await this.userRepo.findById(resetToken.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new ValidationError('Account associated with this reset link is inactive or not found');
    }

    // Hash new password
    const newPasswordHash = await this.passwordHasher.hash(newPassword);

    // Update password
    await this.userRepo.update(user.id, { passwordHash: newPasswordHash });

    // Mark reset token as used
    await this.userRepo.markPasswordResetTokenUsed(resetToken.id);

    // Security requirement: Revoke all existing sessions for this user
    await this.userRepo.revokeAllUserSessions(user.id);

    return {
      message: 'Password has been successfully reset. You may now sign in with your new password.',
    };
  }

  async getInvitationDetails(rawToken: string): Promise<{
    email: string;
    roleCode: string;
    tenantName: string;
    inviterName: string;
    isExistingUser: boolean;
  }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new ValidationError('Invalid invitation token');
    }
    const tokenHash = this.hashToken(rawToken);
    const invitation = await this.tenantRepo.findInvitationByTokenHash(tokenHash);
    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundError('Invitation is invalid, revoked, or has already been used');
    }
    if (new Date() > new Date(invitation.expiresAt)) {
      throw new ValidationError('This invitation link has expired (valid for 7 days)');
    }

    const tenant = await this.tenantRepo.findTenantById(invitation.tenantId);
    const existingUser = await this.userRepo.findByEmail(invitation.email.toLowerCase().trim());

    return {
      email: invitation.email,
      roleCode: invitation.roleCode,
      tenantName: tenant?.legalName || 'Organization',
      inviterName: invitation.invitedBy?.fullName || 'A team administrator',
      isExistingUser: !!existingUser && existingUser.status === 'ACTIVE',
    };
  }

  async acceptInvitation(
    rawDto: AcceptInviteDto,
    metadata?: { ip?: string; userAgent?: string },
  ): Promise<AuthResponseDto> {
    const parseResult = acceptInviteSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Accept invite validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const { token, fullName, password } = parseResult.data;
    const tokenHash = this.hashToken(token);

    const invitation = await this.tenantRepo.findInvitationByTokenHash(tokenHash);
    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundError('Invitation is invalid, revoked, or has already been used');
    }
    if (new Date() > new Date(invitation.expiresAt)) {
      throw new ValidationError('This invitation link has expired (valid for 7 days)');
    }

    const normalizedEmail = invitation.email.toLowerCase().trim();
    let user = await this.userRepo.findByEmail(normalizedEmail);

    if (!user) {
      // Brand new user: fullName and password are required
      if (!fullName || fullName.trim().length < 2) {
        throw new ValidationError('Full name is required for new accounts (minimum 2 characters)');
      }
      if (!password || password.length < 8) {
        throw new ValidationError('Password is required (minimum 8 characters)');
      }

      const passwordHash = await this.passwordHasher.hash(password);
      user = await this.userRepo.create({
        email: normalizedEmail,
        passwordHash,
        fullName: fullName.trim(),
        isSuperadmin: false,
        status: 'ACTIVE',
      });
    } else {
      // Existing user: if user has a pending/invited status, activate them and set password if provided
      if (user.status === 'INVITED') {
        if (!password || password.length < 8) {
          throw new ValidationError(
            'Password is required to complete your registration (minimum 8 characters)',
          );
        }
        const passwordHash = await this.passwordHasher.hash(password);
        user = await this.userRepo.update(user.id, {
          passwordHash,
          status: 'ACTIVE',
          ...(fullName ? { fullName: fullName.trim() } : {}),
        });
      }
    }

    // Check if membership already exists for this tenant
    const existingMembership = await this.tenantRepo.findMembership(invitation.tenantId, user.id);
    if (!existingMembership) {
      await this.tenantRepo.createMembership({
        tenantId: invitation.tenantId,
        userId: user.id,
        roleCode: invitation.roleCode,
        status: 'ACTIVE',
      });
    }

    // Mark invitation as ACCEPTED
    await this.tenantRepo.updateInvitationStatus(invitation.id, 'ACCEPTED', new Date());

    return this.createAuthSession(user.id, user.email, user.fullName, metadata);
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
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

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
