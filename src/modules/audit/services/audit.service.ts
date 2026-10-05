import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import {
  AUDIT_REPOSITORY_TOKEN,
  type IAuditRepository,
} from '../domain/audit.repository.interface';

import type { AuditEventEntity } from '../domain/audit-event.entity';

export const GENESIS_HASH = '0'.repeat(64);

export interface CreateAuditEventInput {
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: 'USER' | 'AI_AGENT' | 'SYSTEM';
  actorId: string;
  correlationId?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY_TOKEN)
    private readonly auditRepo: IAuditRepository,
  ) {}

  async log(input: CreateAuditEventInput): Promise<AuditEventEntity> {
    const id = uuidv4();
    const createdAt = new Date();

    const latestEvent = await this.auditRepo.getLatestEvent(input.tenantId);
    const previousHash = latestEvent ? latestEvent.eventHash : GENESIS_HASH;

    const eventHash = this.computeHash(
      previousHash,
      id,
      input.tenantId,
      input.action,
      input.newState ?? null,
      createdAt.toISOString(),
    );

    const event: AuditEventEntity = {
      ...input,
      id,
      previousHash,
      eventHash,
      createdAt,
    };

    return this.auditRepo.append(event);
  }

  async verifyChain(
    tenantId: string,
  ): Promise<{ isValid: boolean; brokenAtEventId?: string; totalVerified: number }> {
    const events = await this.auditRepo.listEvents(tenantId, { limit: 10000 });
    let expectedPreviousHash = GENESIS_HASH;

    for (const event of events) {
      if (event.previousHash !== expectedPreviousHash) {
        return { isValid: false, brokenAtEventId: event.id, totalVerified: events.indexOf(event) };
      }

      const recalculatedHash = this.computeHash(
        event.previousHash,
        event.id,
        event.tenantId,
        event.action,
        event.newState ?? null,
        event.createdAt.toISOString(),
      );

      if (event.eventHash !== recalculatedHash) {
        return { isValid: false, brokenAtEventId: event.id, totalVerified: events.indexOf(event) };
      }

      expectedPreviousHash = event.eventHash;
    }

    return { isValid: true, totalVerified: events.length };
  }

  private computeHash(
    previousHash: string,
    id: string,
    tenantId: string,
    action: string,
    state: unknown,
    timestamp: string,
  ): string {
    const payload = `${previousHash}|${id}|${tenantId}|${action}|${JSON.stringify(state)}|${timestamp}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
