import { Injectable } from '@nestjs/common';
import type { User, UserSession } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type { UserEntity, UserSessionEntity } from '../domain/user.entity';
import type { IUserRepository } from '../domain/user.repository.interface';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toUserEntity(model: User): UserEntity {
    return {
      id: model.id,
      email: model.email,
      passwordHash: model.passwordHash,
      fullName: model.fullName,
      isSuperadmin: model.isSuperadmin,
      status: model.status as 'ACTIVE' | 'SUSPENDED' | 'INVITED',
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toSessionEntity(model: UserSession): UserSessionEntity {
    return {
      id: model.id,
      userId: model.userId,
      refreshTokenHash: model.refreshTokenHash,
      userAgent: model.userAgent || undefined,
      ipAddress: model.ipAddress || undefined,
      expiresAt: model.expiresAt,
      isRevoked: model.isRevoked,
      createdAt: model.createdAt,
    };
  }

  async create(
    user: Omit<UserEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<UserEntity> {
    const existing = await this.findByEmail(user.email);
    if (existing) {
      throw new ConflictError(`User with email '${user.email}' already exists`);
    }

    const created = await this.prisma.user.create({
      data: {
        email: user.email.toLowerCase().trim(),
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        isSuperadmin: user.isSuperadmin ?? false,
        status: user.status ?? 'ACTIVE',
      },
    });

    return this.toUserEntity(created);
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    return user ? this.toUserEntity(user) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    return user ? this.toUserEntity(user) : null;
  }

  async update(id: string, updates: Partial<UserEntity>): Promise<UserEntity> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('User', id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updates.email ? { email: updates.email.toLowerCase().trim() } : {}),
        ...(updates.passwordHash ? { passwordHash: updates.passwordHash } : {}),
        ...(updates.fullName ? { fullName: updates.fullName } : {}),
        ...(updates.isSuperadmin !== undefined ? { isSuperadmin: updates.isSuperadmin } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        version: { increment: 1 },
      },
    });

    return this.toUserEntity(updated);
  }

  async createSession(
    session: Omit<UserSessionEntity, 'id' | 'createdAt'>,
  ): Promise<UserSessionEntity> {
    const created = await this.prisma.userSession.create({
      data: {
        userId: session.userId,
        refreshTokenHash: session.refreshTokenHash,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        expiresAt: session.expiresAt,
        isRevoked: session.isRevoked ?? false,
      },
    });

    return this.toSessionEntity(created);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<UserSessionEntity | null> {
    const session = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        isRevoked: false,
      },
    });
    return session ? this.toSessionEntity(session) : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }
}
