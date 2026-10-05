import type { TenantEntity, TenantMembershipEntity, TenantSettingsEntity } from './tenant.entity';

export interface ITenantRepository {
  createTenant(
    tenant: Omit<TenantEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<TenantEntity>;
  findTenantById(id: string): Promise<TenantEntity | null>;
  findTenantBySlug(slug: string): Promise<TenantEntity | null>;
  updateTenant(id: string, updates: Partial<TenantEntity>): Promise<TenantEntity>;

  createMembership(
    membership: Omit<TenantMembershipEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantMembershipEntity>;
  findMembership(tenantId: string, userId: string): Promise<TenantMembershipEntity | null>;
  listUserMemberships(
    userId: string,
  ): Promise<Array<TenantMembershipEntity & { tenant: TenantEntity }>>;
  listTenantMembers(tenantId: string): Promise<TenantMembershipEntity[]>;

  getSettings(tenantId: string): Promise<TenantSettingsEntity | null>;
  upsertSettings(
    settings: Omit<TenantSettingsEntity, 'updatedAt' | 'version'>,
  ): Promise<TenantSettingsEntity>;
}

export const TENANT_REPOSITORY_TOKEN = Symbol('ITenantRepository');
