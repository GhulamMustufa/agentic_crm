export interface AuditEventEntity {
  id: string;
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
  previousHash: string;
  eventHash: string;
  createdAt: Date;
}
