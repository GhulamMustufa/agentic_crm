export interface TenantEntity {
  id: string;
  slug: string;
  legalName: string;
  taxIdentifier?: string;
  baseCurrency: string;
  timezone: string;
  status: 'ACTIVE' | 'TRIAL' | 'DELINQUENT' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface TenantMembershipEntity {
  id: string;
  tenantId: string;
  userId: string;
  roleCode: string;
  status: 'ACTIVE' | 'INVITED' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

export interface TenantSettingsEntity {
  tenantId: string;
  autoPostMinConfidence: number;
  maxAutoPostAmountCents: bigint;
  allowAiAutoPosting: boolean;
  requireReceiptAboveCents: bigint;
  updatedAt: Date;
  version: number;
}

export interface TenantInvitationEntity {
  id: string;
  tenantId: string;
  email: string;
  roleCode: string;
  tokenHash: string;
  invitedByUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: Date;
  acceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenant?: TenantEntity;
  invitedBy?: {
    id: string;
    email: string;
    fullName: string;
  };
}
