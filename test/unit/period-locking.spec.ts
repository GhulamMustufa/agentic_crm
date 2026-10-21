import { describe, it, expect, beforeEach } from 'vitest';

import { UnprocessableEntityError, NotFoundError } from '@/core/errors/app-error';
import { InMemoryAuditRepository } from '@/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '@/modules/audit/services/audit.service';
import { InMemoryLedgerRepository } from '@/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '@/modules/ledger/services/ledger.service';

describe('Accounting Period Locking & GAAP Compliance', () => {
  let ledgerService: LedgerService;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditRepository;
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000099';

  beforeEach(async () => {
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditRepository();
    const auditService = new AuditService(auditRepo);
    ledgerService = new LedgerService(ledgerRepo, auditService);

    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);
  });

  it('1. should initialize 12 open accounting periods for the fiscal year', async () => {
    const periods = await ledgerService.listPeriods(tenantId);
    expect(periods).toHaveLength(12);

    for (const p of periods) {
      expect(p.status).toBe('OPEN');
      expect(p.tenantId).toBe(tenantId);
      expect(p.periodNumber).toBeGreaterThanOrEqual(1);
      expect(p.periodNumber).toBeLessThanOrEqual(12);
    }
  });

  it('2. should lock a period and update its status to CLOSED with closedByUserId', async () => {
    const periodJan = await ledgerService.getPeriodByDate(tenantId, '2026-01-15');
    expect(periodJan).toBeDefined();
    expect(periodJan?.status).toBe('OPEN');

    const updated = await ledgerService.updatePeriodStatus(
      tenantId,
      userId,
      periodJan!.id,
      'CLOSED',
    );

    expect(updated.status).toBe('CLOSED');
    expect(updated.closedByUserId).toBe(userId);
    expect(updated.closedAt).toBeDefined();

    // Verify lookup reflects updated status
    const retrieved = await ledgerRepo.findPeriodById(tenantId, periodJan!.id);
    expect(retrieved?.status).toBe('CLOSED');

    // Verify audit event
    const auditEvents = await auditRepo.listEvents(tenantId);
    const closeEvent = auditEvents.find((e) => e.action === 'PERIOD_CLOSED');
    expect(closeEvent).toBeDefined();
    expect(closeEvent?.actorId).toBe(userId);
    expect(closeEvent?.entityType).toBe('ACCOUNTING_PERIOD');
    expect(closeEvent?.entityId).toBe(periodJan!.id);
  });

  it('3. INVARIANT: should reject journal entry posting into a CLOSED accounting period', async () => {
    const periodJan = await ledgerService.getPeriodByDate(tenantId, '2026-01-15');
    await ledgerService.updatePeriodStatus(tenantId, userId, periodJan!.id, 'CLOSED');

    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-01-20',
        description: 'Unauthorized retroactive journal entry in closed period',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cash!.id, debitCents: 50000n, creditCents: 0n },
          { accountId: revenue!.id, debitCents: 0n, creditCents: 50000n },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it('4. should allow reopening a CLOSED period and subsequently allow journal entries', async () => {
    const periodJan = await ledgerService.getPeriodByDate(tenantId, '2026-01-15');
    await ledgerService.updatePeriodStatus(tenantId, userId, periodJan!.id, 'CLOSED');

    // Reopen period
    const reopened = await ledgerService.updatePeriodStatus(
      tenantId,
      userId,
      periodJan!.id,
      'OPEN',
    );
    expect(reopened.status).toBe('OPEN');

    // Verify reopen audit event
    const auditEvents = await auditRepo.listEvents(tenantId);
    const reopenEvent = auditEvents.find((e) => e.action === 'PERIOD_REOPENED');
    expect(reopenEvent).toBeDefined();
    expect(reopenEvent?.actorId).toBe(userId);

    // Journal entry posting should now succeed
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    const entry = await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-01-20',
      description: 'Permitted post after period reopening',
      sourceType: 'MANUAL',
      lines: [
        { accountId: cash!.id, debitCents: 50000n, creditCents: 0n },
        { accountId: revenue!.id, debitCents: 0n, creditCents: 50000n },
      ],
    });

    expect(entry).toBeDefined();
    expect(entry.status).toBe('POSTED');
  });

  it('5. should throw NotFoundError when attempting to update non-existent period', async () => {
    await expect(
      ledgerService.updatePeriodStatus(
        tenantId,
        userId,
        '00000000-0000-0000-0000-999999999999',
        'CLOSED',
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
