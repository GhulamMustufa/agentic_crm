import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import type {
  TenantEntity,
  TenantMembershipEntity,
  TenantSettingsEntity,
} from '../domain/tenant.entity';
import type { ITenantRepository } from '../domain/tenant.repository.interface';

@Injectable()
export class InMemoryTenantRepository implements ITenantRepository {
  private readonly tenants = new Map<string, TenantEntity>();
  private readonly memberships = new Map<string, TenantMembershipEntity>();
  private readonly settings = new Map<string, TenantSettingsEntity>();

  async createTenant(
    tenant: Omit<TenantEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<TenantEntity> {
    const id = uuidv4();
    const now = new Date();
    const created: TenantEntity = {
      ...tenant,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.tenants.set(id, created);
    return created;
  }

  async findTenantById(id: string): Promise<TenantEntity | null> {
    return this.tenants.get(id) ?? null;
  }

  async findTenantBySlug(slug: string): Promise<TenantEntity | null> {
    const normalized = slug.toLowerCase().trim();
    for (const tenant of this.tenants.values()) {
      if (tenant.slug.toLowerCase() === normalized) {
        return tenant;
      }
    }
    return null;
  }

  async updateTenant(id: string, updates: Partial<TenantEntity>): Promise<TenantEntity> {
    const existing = this.tenants.get(id);
    if (!existing) {
      throw new Error(`Tenant not found: ${id}`);
    }
    const updated: TenantEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      version: existing.version + 1,
    };
    this.tenants.set(id, updated);
    return updated;
  }

  async createMembership(
    membership: Omit<TenantMembershipEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantMembershipEntity> {
    const id = uuidv4();
    const now = new Date();
    const created: TenantMembershipEntity = {
      ...membership,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.memberships.set(`${membership.tenantId}_${membership.userId}`, created);
    return created;
  }

  async findMembership(tenantId: string, userId: string): Promise<TenantMembershipEntity | null> {
    return this.memberships.get(`${tenantId}_${userId}`) ?? null;
  }

  async listUserMemberships(
    userId: string,
  ): Promise<Array<TenantMembershipEntity & { tenant: TenantEntity }>> {
    const result: Array<TenantMembershipEntity & { tenant: TenantEntity }> = [];
    for (const mem of this.memberships.values()) {
      if (mem.userId === userId && mem.status === 'ACTIVE') {
        const tenant = this.tenants.get(mem.tenantId);
        if (tenant) {
          result.push({ ...mem, tenant });
        }
      }
    }
    return result;
  }

  async listTenantMembers(tenantId: string): Promise<TenantMembershipEntity[]> {
    const result: TenantMembershipEntity[] = [];
    for (const mem of this.memberships.values()) {
      if (mem.tenantId === tenantId) {
        result.push(mem);
      }
    }
    return result;
  }

  async getSettings(tenantId: string): Promise<TenantSettingsEntity | null> {
    return this.settings.get(tenantId) ?? null;
  }

  async upsertSettings(
    settings: Omit<TenantSettingsEntity, 'updatedAt' | 'version'>,
  ): Promise<TenantSettingsEntity> {
    const existing = this.settings.get(settings.tenantId);
    const updated: TenantSettingsEntity = {
      ...settings,
      updatedAt: new Date(),
      version: existing ? existing.version + 1 : 1,
    };
    this.settings.set(settings.tenantId, updated);
    return updated;
  }

  clear(): void {
    this.tenants.clear();
    this.memberships.clear();
    this.settings.clear();
  }
}
