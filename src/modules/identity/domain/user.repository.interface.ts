import type { UserEntity, UserSessionEntity } from './user.entity';

export interface IUserRepository {
  create(user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<UserEntity>;
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  update(id: string, updates: Partial<UserEntity>): Promise<UserEntity>;
  createSession(session: Omit<UserSessionEntity, 'id' | 'createdAt'>): Promise<UserSessionEntity>;
  findSessionByTokenHash(tokenHash: string): Promise<UserSessionEntity | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}

export const USER_REPOSITORY_TOKEN = Symbol('IUserRepository');
