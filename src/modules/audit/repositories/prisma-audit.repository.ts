import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/prisma/prisma.service';

import type { AuditEventEntity } from '../domain/audit-event.entity';
import type { IAuditRepository } from '../domain/audit.repository.interface';
import type { AuditEvent } from '@prisma/client';

@Injectable()
export class PrismaAuditRepository implements IAuditRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        slug: tenantId,
        legalName: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  private toEntity(model: AuditEvent): AuditEventEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      action: model.action,
      entityType: model.entityType,
      entityId: model.entityId,
      actorType: model.actorType as 'USER' | 'AI_AGENT' | 'SYSTEM',
      actorId: model.actorId,
      correlationId: model.correlationId ?? undefined,
      previousState: (model.previousState as Record<string, unknown>) ?? undefined,
      newState: (model.newState as Record<string, unknown>) ?? undefined,
      diff: (model.diff as Record<string, unknown>) ?? undefined,
      ipAddress: model.ipAddress ?? undefined,
      previousHash: model.previousHash,
      eventHash: model.eventHash,
      createdAt: model.createdAt,
    };
  }

  private sortChain(events: AuditEventEntity[]): AuditEventEntity[] {
    if (events.length <= 1) {
      return events;
    }

    const byPrevHash = new Map<string, AuditEventEntity>();
    for (const event of events) {
      byPrevHash.set(event.previousHash, event);
    }

    const genesisHash = '0'.repeat(64);
    let current =
      events.find((e) => e.previousHash === genesisHash) ??
      events.find((e) => !events.some((other) => other.eventHash === e.previousHash));
    if (!current) {
      return events;
    }

    const sorted: AuditEventEntity[] = [];
    while (current) {
      sorted.push(current);
      current = byPrevHash.get(current.eventHash);
    }

    if (sorted.length < events.length) {
      const addedIds = new Set(sorted.map((e) => e.id));
      for (const e of events) {
        if (!addedIds.has(e.id)) {
          sorted.push(e);
        }
      }
    }

    return sorted;
  }

  async append(event: AuditEventEntity): Promise<AuditEventEntity> {
    await this.ensureTenantExists(event.tenantId);

    const record = await this.prisma.auditEvent.create({
      data: {
        id: event.id,
        tenantId: event.tenantId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorType: event.actorType,
        actorId: event.actorId,
        correlationId: event.correlationId,
        previousState:
          event.previousState !== undefined
            ? (event.previousState as Prisma.InputJsonValue)
            : undefined,
        newState:
          event.newState !== undefined ? (event.newState as Prisma.InputJsonValue) : undefined,
        diff: event.diff !== undefined ? (event.diff as Prisma.InputJsonValue) : undefined,
        ipAddress: event.ipAddress,
        previousHash: event.previousHash,
        eventHash: event.eventHash,
        createdAt: event.createdAt,
      },
    });

    return this.toEntity(record);
  }

  async getLatestEvent(tenantId: string): Promise<AuditEventEntity | null> {
    const records = await this.prisma.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (records.length === 0) {
      return null;
    }
    if (records.length === 1 && records[0]) {
      return this.toEntity(records[0]);
    }

    const previousHashes = new Set(records.map((r) => r.previousHash));
    const tip = records.find((r) => !previousHashes.has(r.eventHash));
    const chosen = tip ?? records[0];

    return chosen ? this.toEntity(chosen) : null;
  }

  async listEvents(
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<AuditEventEntity[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const records = await this.prisma.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
    });

    const entities = records.map((r) => this.toEntity(r));
    return this.sortChain(entities);
  }

  async countEvents(tenantId: string): Promise<number> {
    return this.prisma.auditEvent.count({
      where: { tenantId },
    });
  }

  async tamperEvent(eventId: string, corruptedHash: string): Promise<void> {
    await this.prisma.auditEvent.update({
      where: { id: eventId },
      data: { eventHash: corruptedHash },
    });
  }
}
