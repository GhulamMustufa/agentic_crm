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

  private redactState(state: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!state) {return state;}
    const redacted = structuredClone(state);
    const sensitiveKeys = ['password', 'ssn', 'routingNumber', 'accountNumber', 'salary', 'salaryRate'];
    
    const redactDeep = (obj: any) => {
      if (!obj || typeof obj !== 'object') {return;}
      for (const key in obj) {
        if (sensitiveKeys.includes(key)) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object') {
          redactDeep(obj[key]);
        }
      }
    };
    redactDeep(redacted);
    return redacted;
  }

  async log(input: CreateAuditEventInput): Promise<AuditEventEntity> {
    const id = uuidv4();
    const createdAt = new Date();

    const previousState = this.redactState(input.previousState);
    const newState = this.redactState(input.newState);
    const diff = this.redactState(input.diff);

    const latestEvent = await this.auditRepo.getLatestEvent(input.tenantId);
    const previousHash = latestEvent ? latestEvent.eventHash : GENESIS_HASH;

    const eventHash = this.computeHash(
      previousHash,
      id,
      input.tenantId,
      input.action,
      newState ?? null,
      createdAt.toISOString(),
    );

    const event: AuditEventEntity = {
      ...input,
      previousState,
      newState,
      diff,
      id,
      previousHash,
      eventHash,
      createdAt,
    };

    return this.auditRepo.append(event);
  }

  async recordEvent(input: CreateAuditEventInput): Promise<AuditEventEntity> {
    return this.log(input);
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
    const stringifiedState = JSON.stringify(state, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    const payload = `${previousHash}|${id}|${tenantId}|${action}|${stringifiedState}|${timestamp}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
