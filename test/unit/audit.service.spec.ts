import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryAuditRepository } from '@/modules/audit/repositories/in-memory-audit.repository';
import { AuditService, GENESIS_HASH } from '@/modules/audit/services/audit.service';

describe('AuditService', () => {
  let auditService: AuditService;
  let auditRepo: InMemoryAuditRepository;

  beforeEach(() => {
    auditRepo = new InMemoryAuditRepository();
    auditService = new AuditService(auditRepo);
  });

  it('should initialize first event with GENESIS_HASH and compute SHA-256 eventHash', async () => {
    const event = await auditService.log({
      tenantId: 'tenant_1',
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: 'tenant_1',
      actorType: 'USER',
      actorId: 'user_1',
      newState: { slug: 'acme' },
    });

    expect(event.previousHash).toBe(GENESIS_HASH);
    expect(event.eventHash).toHaveLength(64);
    expect(event.action).toBe('ORGANIZATION_CREATED');
  });

  it('should chain sequential events cryptographically', async () => {
    const event1 = await auditService.log({
      tenantId: 'tenant_1',
      action: 'USER_INVITED',
      entityType: 'User',
      entityId: 'user_2',
      actorType: 'USER',
      actorId: 'user_1',
    });

    const event2 = await auditService.log({
      tenantId: 'tenant_1',
      action: 'ROLE_ASSIGNED',
      entityType: 'Role',
      entityId: 'role_controller',
      actorType: 'USER',
      actorId: 'user_1',
    });

    expect(event2.previousHash).toBe(event1.eventHash);
    expect(event2.eventHash).not.toBe(event1.eventHash);

    const verification = await auditService.verifyChain('tenant_1');
    expect(verification.isValid).toBe(true);
    expect(verification.totalVerified).toBe(2);
  });

  it('should detect tampering if an event hash is corrupted', async () => {
    await auditService.log({
      tenantId: 'tenant_1',
      action: 'EVENT_1',
      entityType: 'Test',
      entityId: '1',
      actorType: 'USER',
      actorId: 'user_1',
    });

    const event2 = await auditService.log({
      tenantId: 'tenant_1',
      action: 'EVENT_2',
      entityType: 'Test',
      entityId: '2',
      actorType: 'USER',
      actorId: 'user_1',
    });

    // Adversary tampers with event2's hash in storage
    auditRepo.tamperEvent(
      event2.id,
      'tampered_hash_value_1234567890abcdef1234567890abcdef1234567890abcdef',
    );

    const verification = await auditService.verifyChain('tenant_1');
    expect(verification.isValid).toBe(false);
    expect(verification.brokenAtEventId).toBe(event2.id);
  });
});
