import { Injectable } from '@nestjs/common';
import type { Tenant, TenantMembership, TenantSettings } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type {
  TenantEntity,
  TenantMembershipEntity,
  TenantSettingsEntity,
} from '../domain/tenant.entity';
import type { ITenantRepository } from '../domain/tenant.repository.interface';

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toTenantEntity(model: Tenant): TenantEntity {
    return {
      id: model.id,
      slug: model.slug,
      legalName: model.legalName,
      taxIdentifier: model.taxIdentifier || undefined,
      baseCurrency: model.baseCurrency,
      timezone: model.timezone,
      status: model.status as 'ACTIVE' | 'TRIAL' | 'DELINQUENT' | 'SUSPENDED',
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toMembershipEntity(model: TenantMembership): TenantMembershipEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      userId: model.userId,
      roleCode: model.roleCode,
      status: model.status as 'ACTIVE' | 'INVITED' | 'INACTIVE',
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }

  private toSettingsEntity(model: TenantSettings): TenantSettingsEntity {
    return {
      tenantId: model.tenantId,
      autoPostMinConfidence: model.autoPostMinConfidence,
      maxAutoPostAmountCents: model.maxAutoPostAmountCents,
      allowAiAutoPosting: model.allowAiAutoPosting,
      requireReceiptAboveCents: model.requireReceiptAboveCents,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  async createTenant(
    tenant: Omit<TenantEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<TenantEntity> {
    const existing = await this.findTenantBySlug(tenant.slug);
    if (existing) {
      throw new ConflictError(`Organization with slug '${tenant.slug}' already exists`);
    }

    const created = await this.prisma.tenant.create({
      data: {
        slug: tenant.slug.toLowerCase().trim(),
        legalName: tenant.legalName.trim(),
        taxIdentifier: tenant.taxIdentifier,
        baseCurrency: tenant.baseCurrency.toUpperCase(),
        timezone: tenant.timezone,
        status: tenant.status ?? 'ACTIVE',
      },
    });

    return this.toTenantEntity(created);
  }

  async findTenantById(id: string): Promise<TenantEntity | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });
    return tenant ? this.toTenantEntity(tenant) : null;
  }

  async findTenantBySlug(slug: string): Promise<TenantEntity | null> {
    const normalized = slug.toLowerCase().trim();
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalized },
    });
    return tenant ? this.toTenantEntity(tenant) : null;
  }

  async updateTenant(id: string, updates: Partial<TenantEntity>): Promise<TenantEntity> {
    const existing = await this.findTenantById(id);
    if (!existing) {
      throw new NotFoundError('Tenant', id);
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(updates.slug ? { slug: updates.slug.toLowerCase().trim() } : {}),
        ...(updates.legalName ? { legalName: updates.legalName } : {}),
        ...(updates.taxIdentifier !== undefined ? { taxIdentifier: updates.taxIdentifier } : {}),
        ...(updates.baseCurrency ? { baseCurrency: updates.baseCurrency } : {}),
        ...(updates.timezone ? { timezone: updates.timezone } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        version: { increment: 1 },
      },
    });

    return this.toTenantEntity(updated);
  }

  async createMembership(
    membership: Omit<TenantMembershipEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantMembershipEntity> {
    const created = await this.prisma.tenantMembership.create({
      data: {
        tenantId: membership.tenantId,
        userId: membership.userId,
        roleCode: membership.roleCode,
        status: membership.status ?? 'ACTIVE',
      },
    });

    return this.toMembershipEntity(created);
  }

  async findMembership(tenantId: string, userId: string): Promise<TenantMembershipEntity | null> {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
    });
    return membership ? this.toMembershipEntity(membership) : null;
  }

  async listUserMemberships(
    userId: string,
  ): Promise<Array<TenantMembershipEntity & { tenant: TenantEntity }>> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        tenant: true,
      },
    });

    return memberships.map((mem) => ({
      ...this.toMembershipEntity(mem),
      tenant: this.toTenantEntity(mem.tenant),
    }));
  }

  async listTenantMembers(tenantId: string): Promise<TenantMembershipEntity[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
    });

    return memberships.map((mem) => this.toMembershipEntity(mem));
  }

  async getSettings(tenantId: string): Promise<TenantSettingsEntity | null> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    return settings ? this.toSettingsEntity(settings) : null;
  }

  async upsertSettings(
    settings: Omit<TenantSettingsEntity, 'updatedAt' | 'version'>,
  ): Promise<TenantSettingsEntity> {
    const record = await this.prisma.tenantSettings.upsert({
      where: { tenantId: settings.tenantId },
      update: {
        autoPostMinConfidence: settings.autoPostMinConfidence,
        maxAutoPostAmountCents: settings.maxAutoPostAmountCents,
        allowAiAutoPosting: settings.allowAiAutoPosting,
        requireReceiptAboveCents: settings.requireReceiptAboveCents,
        version: { increment: 1 },
      },
      create: {
        tenantId: settings.tenantId,
        autoPostMinConfidence: settings.autoPostMinConfidence,
        maxAutoPostAmountCents: settings.maxAutoPostAmountCents,
        allowAiAutoPosting: settings.allowAiAutoPosting,
        requireReceiptAboveCents: settings.requireReceiptAboveCents,
      },
    });

    return this.toSettingsEntity(record);
  }
}
