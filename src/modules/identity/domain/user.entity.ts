export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  isSuperadmin: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface UserSessionEntity {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
}

export interface RoleEntity {
  id: string;
  tenantId?: string;
  roleCode: string;
  name: string;
  description?: string;
  permissions: string[];
}
