import { Inject, Injectable } from '@nestjs/common';

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

import type { TenantEntity, TenantSettingsEntity } from '../domain/tenant.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(TENANT_REPOSITORY_TOKEN)
    private readonly tenantRepo: ITenantRepository,
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepo: IUserRepository,
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
  ): Promise<{ membershipId: string; email: string; roleCode: string }> {
    const parseResult = inviteMemberSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Member invite validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Verify inviter is member with OWNER or CONTROLLER
    const inviterMembership = await this.tenantRepo.findMembership(tenantId, inviterUserId);
    if (!inviterMembership || !['OWNER', 'CONTROLLER'].includes(inviterMembership.roleCode)) {
      throw new AuthorizationError('Only an Owner or Controller may invite new members');
    }

    // Check if target user exists, or create invited placeholder
    let targetUser = await this.userRepo.findByEmail(dto.email);
    if (!targetUser) {
      targetUser = await this.userRepo.create({
        email: dto.email.toLowerCase().trim(),
        fullName: dto.email.split('@')[0] || 'Invited User',
        passwordHash: 'INVITATION_PENDING',
        isSuperadmin: false,
        status: 'INVITED',
      });
    }

    const existingMembership = await this.tenantRepo.findMembership(tenantId, targetUser.id);
    if (existingMembership) {
      throw new ConflictError(`User '${dto.email}' is already a member of this organization`);
    }

    const membership = await this.tenantRepo.createMembership({
      tenantId,
      userId: targetUser.id,
      roleCode: dto.roleCode,
      status: 'ACTIVE',
    });

    return {
      membershipId: membership.id,
      email: targetUser.email,
      roleCode: membership.roleCode,
    };
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
}
