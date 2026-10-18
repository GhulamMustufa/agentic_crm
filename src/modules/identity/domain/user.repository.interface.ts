import type { UserEntity, UserSessionEntity, PasswordResetTokenEntity } from './user.entity';

export interface IUserRepository {
  create(user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<UserEntity>;
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  update(id: string, updates: Partial<UserEntity>): Promise<UserEntity>;
  createSession(session: Omit<UserSessionEntity, 'id' | 'createdAt'>): Promise<UserSessionEntity>;
  findSessionByTokenHash(tokenHash: string): Promise<UserSessionEntity | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
  createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenEntity>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenEntity | null>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  invalidateUserPasswordResetTokens(userId: string): Promise<void>;
}

export const USER_REPOSITORY_TOKEN = Symbol('IUserRepository');
