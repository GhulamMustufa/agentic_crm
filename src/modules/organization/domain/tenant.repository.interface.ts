import type {
  TenantEntity,
  TenantMembershipEntity,
  TenantSettingsEntity,
  TenantInvitationEntity,
} from './tenant.entity';

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

  createInvitation(
    invitation: Omit<TenantInvitationEntity, 'id' | 'createdAt' | 'updatedAt' | 'acceptedAt'>,
  ): Promise<TenantInvitationEntity>;
  findInvitationById(id: string): Promise<TenantInvitationEntity | null>;
  findInvitationByTokenHash(tokenHash: string): Promise<TenantInvitationEntity | null>;
  findPendingInvitation(tenantId: string, email: string): Promise<TenantInvitationEntity | null>;
  listPendingInvitations(tenantId: string): Promise<TenantInvitationEntity[]>;
  updateInvitationStatus(
    id: string,
    status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED',
    acceptedAt?: Date,
  ): Promise<TenantInvitationEntity>;
}

export const TENANT_REPOSITORY_TOKEN = Symbol('ITenantRepository');
