import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import type { UserEntity, UserSessionEntity } from '../domain/user.entity';
import type { IUserRepository } from '../domain/user.repository.interface';

@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, UserEntity>();
  private readonly sessions = new Map<string, UserSessionEntity>();

  async create(
    user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<UserEntity> {
    const id = uuidv4();
    const now = new Date();
    const created: UserEntity = {
      ...user,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.users.set(id, created);
    return created;
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async update(id: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const existing = this.users.get(id);
    if (!existing) {
      throw new Error(`User not found: ${id}`);
    }
    const updated: UserEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      version: existing.version + 1,
    };
    this.users.set(id, updated);
    return updated;
  }

  async createSession(
    session: Omit<UserSessionEntity, 'id' | 'createdAt'>,
  ): Promise<UserSessionEntity> {
    const id = uuidv4();
    const created: UserSessionEntity = {
      ...session,
      id,
      createdAt: new Date(),
    };
    this.sessions.set(id, created);
    return created;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<UserSessionEntity | null> {
    for (const session of this.sessions.values()) {
      if (session.refreshTokenHash === tokenHash && !session.isRevoked) {
        return session;
      }
    }
    return null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isRevoked = true;
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.isRevoked = true;
      }
    }
  }

  clear(): void {
    this.users.clear();
    this.sessions.clear();
  }
}
