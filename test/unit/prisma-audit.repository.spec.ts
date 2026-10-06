import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { PrismaService } from '@/core/prisma/prisma.service';
import { PrismaAuditRepository } from '@/modules/audit/repositories/prisma-audit.repository';
import { AuditService, GENESIS_HASH } from '@/modules/audit/services/audit.service';

describe('PrismaAuditRepository (Live PostgreSQL Integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaAuditRepository;
  let auditService: AuditService;

  const tenantId = `tenant-audit-test-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    repository = new PrismaAuditRepository(prisma);
    auditService = new AuditService(repository);

    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        legalName: `Audit Test Org ${tenantId}`,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.auditEvent.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    } finally {
      await prisma.onModuleDestroy();
    }
  });

  it('initializes first event with GENESIS_HASH and saves to database', async () => {
    const event = await auditService.log({
      tenantId,
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: tenantId,
      actorType: 'USER',
      actorId: 'user_1',
      newState: { slug: tenantId, legalName: 'Audit Test Org' },
    });

    expect(event.id).toBeDefined();
    expect(event.previousHash).toBe(GENESIS_HASH);
    expect(event.eventHash).toHaveLength(64);

    const latest = await repository.getLatestEvent(tenantId);
    expect(latest).not.toBeNull();
    expect(latest?.id).toBe(event.id);
    expect(latest?.eventHash).toBe(event.eventHash);
  });

  it('chains sequential events cryptographically in database', async () => {
    const event1 = await repository.getLatestEvent(tenantId);
    expect(event1).not.toBeNull();

    const event2 = await auditService.log({
      tenantId,
      action: 'USER_INVITED',
      entityType: 'User',
      entityId: 'user_2',
      actorType: 'USER',
      actorId: 'user_1',
    });

    const event3 = await auditService.log({
      tenantId,
      action: 'ROLE_ASSIGNED',
      entityType: 'Role',
      entityId: 'role_controller',
      actorType: 'USER',
      actorId: 'user_1',
    });

    expect(event2.previousHash).toBe(event1?.eventHash);
    expect(event3.previousHash).toBe(event2.eventHash);

    const verification = await auditService.verifyChain(tenantId);
    expect(verification.isValid).toBe(true);
    expect(verification.totalVerified).toBe(3);
  });

  it('lists events and supports countEvents query', async () => {
    const count = await repository.countEvents(tenantId);
    expect(count).toBe(3);

    const events = await repository.listEvents(tenantId, { limit: 10, offset: 0 });
    expect(events.length).toBe(3);
    expect(events[0]?.previousHash).toBe(GENESIS_HASH);
  });

  it('detects tampering when database event record hash is modified', async () => {
    const events = await repository.listEvents(tenantId, { limit: 10 });
    const secondEvent = events[1];
    expect(secondEvent).toBeDefined();

    if (!secondEvent) {
      throw new Error('Second event not found');
    }

    const corruptedHash = 'tampered_hash_value_1234567890abcdef1234567890abcdef1234567890abcdef';
    await repository.tamperEvent(secondEvent.id, corruptedHash);

    const verification = await auditService.verifyChain(tenantId);
    expect(verification.isValid).toBe(false);
    expect(verification.brokenAtEventId).toBe(secondEvent.id);

    // Restore original hash for clean state
    await repository.tamperEvent(secondEvent.id, secondEvent.eventHash);
    const restoredVerification = await auditService.verifyChain(tenantId);
    expect(restoredVerification.isValid).toBe(true);
  });
});
