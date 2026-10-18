import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../core/config/config.service';
import { EmailService } from '../../../core/email/email.service';
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../../../core/errors/app-error';
import {
  USER_REPOSITORY_TOKEN,
  type IUserRepository,
} from '../../identity/domain/user.repository.interface';
import {
  TENANT_REPOSITORY_TOKEN,
  type ITenantRepository,
} from '../domain/tenant.repository.interface';
import {
  type CreateTenantDto,
  type InviteMemberDto,
  type UpdateTenantSettingsDto,
  createTenantSchema,
  inviteMemberSchema,
  updateTenantSettingsSchema,
} from '../dto/organization.dto';

import type {
  TenantEntity,
  TenantMembershipEntity,
  TenantSettingsEntity,
  TenantInvitationEntity,
} from '../domain/tenant.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(TENANT_REPOSITORY_TOKEN)
    private readonly tenantRepo: ITenantRepository,
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepo: IUserRepository,
    private readonly emailService: EmailService,
    private readonly config: AppConfigService,
  ) {}

  async createOrganization(userId: string, rawDto: CreateTenantDto): Promise<TenantEntity> {
    const parseResult = createTenantSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Organization validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const existingSlug = await this.tenantRepo.findTenantBySlug(dto.slug);
    if (existingSlug) {
      throw new ConflictError(`Organization with slug '${dto.slug}' already exists`);
    }

    // 1. Create tenant
    const tenant = await this.tenantRepo.createTenant({
      legalName: dto.legalName.trim(),
      slug: dto.slug.toLowerCase().trim(),
      baseCurrency: dto.baseCurrency.toUpperCase(),
      timezone: dto.timezone,
      status: 'ACTIVE',
    });

    // 2. Creator automatically becomes OWNER
    await this.tenantRepo.createMembership({
      tenantId: tenant.id,
      userId,
      roleCode: 'OWNER',
      status: 'ACTIVE',
    });

    // 3. Initialize default tenant financial settings
    await this.tenantRepo.upsertSettings({
      tenantId: tenant.id,
      autoPostMinConfidence: 0.95,
      maxAutoPostAmountCents: BigInt(500000), // $5,000.00
      allowAiAutoPosting: true,
      requireReceiptAboveCents: BigInt(7500), // $75.00
    });

    return tenant;
  }

  async getUserOrganizations(userId: string): Promise<TenantEntity[]> {
    const memberships = await this.tenantRepo.listUserMemberships(userId);
    return memberships.map((m) => m.tenant);
  }

  async getTenantById(
    tenantId: string,
    userId: string,
  ): Promise<TenantEntity & { roleCode: string }> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AuthorizationError('You do not belong to this organization');
    }

    const tenant = await this.tenantRepo.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Organization', tenantId);
    }

    return { ...tenant, roleCode: membership.roleCode };
  }

  async inviteMember(
    tenantId: string,
    inviterUserId: string,
    rawDto: InviteMemberDto,
  ): Promise<{
    invitationId: string;
    email: string;
    roleCode: string;
    expiresAt: Date;
    debugInviteUrl?: string;
  }> {
    const parseResult = inviteMemberSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Member invite validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Verify inviter is member with OWNER or CONTROLLER
    const inviterMembership = await this.tenantRepo.findMembership(tenantId, inviterUserId);
    if (!inviterMembership || !['OWNER', 'CONTROLLER'].includes(inviterMembership.roleCode)) {
      throw new AuthorizationError('Only an Owner or Controller may invite new members');
    }

    // Check if target user exists and is already an active member of this organization
    const existingUser = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      const existingMembership = await this.tenantRepo.findMembership(tenantId, existingUser.id);
      if (existingMembership && existingMembership.status === 'ACTIVE') {
        throw new ConflictError(
          `User '${normalizedEmail}' is already an active member of this organization`,
        );
      }
    }

    // Revoke any previous pending invitation for this tenant & email
    const existingPending = await this.tenantRepo.findPendingInvitation(tenantId, normalizedEmail);
    if (existingPending) {
      await this.tenantRepo.updateInvitationStatus(existingPending.id, 'REVOKED');
    }

    // Generate secure 32-byte cryptographic token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.tenantRepo.createInvitation({
      tenantId,
      email: normalizedEmail,
      roleCode: dto.roleCode,
      tokenHash,
      invitedByUserId: inviterUserId,
      status: 'PENDING',
      expiresAt,
    });

    const tenant = await this.tenantRepo.findTenantById(tenantId);
    const inviterUser = await this.userRepo.findById(inviterUserId);
    const frontendBaseUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const inviteUrl = `${frontendBaseUrl.replace(/\/$/, '')}/invite?token=${rawToken}`;

    await this.emailService.sendOrganizationInviteEmail(
      normalizedEmail,
      inviterUser?.fullName || 'A team administrator',
      tenant?.legalName || 'your organization',
      dto.roleCode,
      inviteUrl,
    );

    return {
      invitationId: invitation.id,
      email: invitation.email,
      roleCode: invitation.roleCode,
      expiresAt: invitation.expiresAt,
      ...(this.config.isDevelopment || this.config.isTest ? { debugInviteUrl: inviteUrl } : {}),
    };
  }

  async listPendingInvitations(
    tenantId: string,
    userId: string,
  ): Promise<TenantInvitationEntity[]> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AuthorizationError('You do not belong to this organization');
    }
    return this.tenantRepo.listPendingInvitations(tenantId);
  }

  async revokeInvitation(
    tenantId: string,
    userId: string,
    invitationId: string,
  ): Promise<{ success: boolean }> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || !['OWNER', 'CONTROLLER'].includes(membership.roleCode)) {
      throw new AuthorizationError('Only an Owner or Controller may revoke invitations');
    }
    const invitation = await this.tenantRepo.findInvitationById(invitationId);
    if (!invitation || invitation.tenantId !== tenantId) {
      throw new NotFoundError('Invitation not found');
    }
    await this.tenantRepo.updateInvitationStatus(invitationId, 'REVOKED');
    return { success: true };
  }

  async getMembers(tenantId: string, userId: string): Promise<TenantMembershipEntity[]> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AuthorizationError('You do not belong to this organization');
    }
    return this.tenantRepo.listTenantMembers(tenantId);
  }

  async getSettings(tenantId: string, userId?: string): Promise<TenantSettingsEntity> {
    if (userId) {
      const membership = await this.tenantRepo.findMembership(tenantId, userId);
      if (!membership || membership.status !== 'ACTIVE') {
        throw new AuthorizationError('You do not belong to this organization');
      }
    }

    const settings = await this.tenantRepo.getSettings(tenantId);
    if (!settings) {
      throw new NotFoundError('Tenant settings', tenantId);
    }
    return settings;
  }

  async updateSettings(
    tenantId: string,
    userId: string,
    rawDto: UpdateTenantSettingsDto,
  ): Promise<TenantSettingsEntity> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || membership.roleCode !== 'OWNER') {
      throw new AuthorizationError('Only an Owner may update organization settings');
    }

    const parseResult = updateTenantSettingsSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Settings validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const existing = await this.getSettings(tenantId);
    return this.tenantRepo.upsertSettings({
      tenantId,
      autoPostMinConfidence: dto.autoPostMinConfidence ?? existing.autoPostMinConfidence,
      maxAutoPostAmountCents: dto.maxAutoPostAmountCents ?? existing.maxAutoPostAmountCents,
      allowAiAutoPosting: dto.allowAiAutoPosting ?? existing.allowAiAutoPosting,
      requireReceiptAboveCents: dto.requireReceiptAboveCents ?? existing.requireReceiptAboveCents,
    });
  }

  async updateOrganization(
    tenantId: string,
    userId: string,
    dto: { legalName?: string; timezone?: string; baseCurrency?: string },
  ): Promise<TenantEntity> {
    const membership = await this.tenantRepo.findMembership(tenantId, userId);
    if (!membership || membership.roleCode !== 'OWNER') {
      throw new AuthorizationError('Only an Owner may update organization details');
    }
    return this.tenantRepo.updateTenant(tenantId, {
      legalName: dto.legalName?.trim(),
      timezone: dto.timezone,
      ...(dto.baseCurrency ? { baseCurrency: dto.baseCurrency.toUpperCase().trim() } : {}),
    });
  }
}
