import type { AuditEventEntity } from './audit-event.entity';

export interface IAuditRepository {
  append(event: AuditEventEntity): Promise<AuditEventEntity>;
  getLatestEvent(tenantId: string): Promise<AuditEventEntity | null>;
  listEvents(
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<AuditEventEntity[]>;
  countEvents(tenantId: string): Promise<number>;
}

export const AUDIT_REPOSITORY_TOKEN = Symbol('IAuditRepository');
