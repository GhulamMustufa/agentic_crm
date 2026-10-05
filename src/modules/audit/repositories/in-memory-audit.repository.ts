import { Injectable } from '@nestjs/common';

import type { AuditEventEntity } from '../domain/audit-event.entity';
import type { IAuditRepository } from '../domain/audit.repository.interface';

@Injectable()
export class InMemoryAuditRepository implements IAuditRepository {
  private readonly events: AuditEventEntity[] = [];

  async append(event: AuditEventEntity): Promise<AuditEventEntity> {
    this.events.push(Object.freeze({ ...event }));
    return event;
  }

  async getLatestEvent(tenantId: string): Promise<AuditEventEntity | null> {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e && e.tenantId === tenantId) {
        return e;
      }
    }
    return null;
  }

  async listEvents(
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<AuditEventEntity[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return this.events.filter((e) => e.tenantId === tenantId).slice(offset, offset + limit);
  }

  tamperEvent(eventId: string, corruptedHash: string): void {
    const index = this.events.findIndex((e) => e.id === eventId);
    if (index !== -1) {
      const e = this.events[index];
      if (e) {
        this.events[index] = { ...e, eventHash: corruptedHash };
      }
    }
  }

  async countEvents(tenantId: string): Promise<number> {
    return this.events.filter((e) => e.tenantId === tenantId).length;
  }

  clear(): void {
    this.events.length = 0;
  }
}
