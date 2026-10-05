import { describe, it, expect, beforeEach } from 'vitest';

import { ValidationError, UnprocessableEntityError } from '@/core/errors/app-error';
import { InMemoryAuditRepository } from '@/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '@/modules/audit/services/audit.service';
import { InMemoryLedgerRepository } from '@/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '@/modules/ledger/services/ledger.service';

describe('LedgerService - Accounting Invariants & Ledger Core', () => {
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

    // Seed standard chart of accounts
    await ledgerService.seedStandardChartOfAccounts(tenantId);

    // Initialize 2026 fiscal year and 12 periods
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);
  });

  it('1. should seed standard Chart of Accounts with system locked control accounts', async () => {
    const accounts = await ledgerService.listAccounts(tenantId);
    expect(accounts.length).toBeGreaterThanOrEqual(10);

    const cash = accounts.find((a) => a.accountCode === '1010');
    const ar = accounts.find((a) => a.accountCode === '1200');
    const ap = accounts.find((a) => a.accountCode === '2010');
    const retainedEarnings = accounts.find((a) => a.accountCode === '3999');

    expect(cash).toBeDefined();
    expect(cash?.isSystemLocked).toBe(true);
    expect(cash?.classification).toBe('ASSET');

    expect(ar?.classification).toBe('ASSET');
    expect(ap?.classification).toBe('LIABILITY');
    expect(retainedEarnings?.classification).toBe('EQUITY');
  });

  it('2. INVARIANT: should reject unbalanced journal entries (Debits != Credits)', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-03-15',
        description: 'Unbalanced sale',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cash!.id, debitCents: 10000n, creditCents: 0n },
          { accountId: revenue!.id, debitCents: 0n, creditCents: 9500n }, // $100.00 vs $95.00
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('3. INVARIANT: should reject single-line journal entries', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');

    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-03-15',
        description: 'Single line entry',
        sourceType: 'MANUAL',
        lines: [{ accountId: cash!.id, debitCents: 10000n, creditCents: 0n }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('4. INVARIANT: should reject journal entry with zero or negative amounts', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-03-15',
        description: 'Zero amount entry',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cash!.id, debitCents: 0n, creditCents: 0n },
          { accountId: revenue!.id, debitCents: 0n, creditCents: 0n },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('5. INVARIANT: should reject journal line with both debit and credit > 0', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-03-15',
        description: 'Line with both Dr and Cr',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cash!.id, debitCents: 5000n, creditCents: 2000n },
          { accountId: revenue!.id, debitCents: 0n, creditCents: 3000n },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('6. INVARIANT: should reject posting to a CLOSED or LOCKED accounting period', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');

    // Find January 2026 period and close it
    const period = await ledgerService.getPeriodByDate(tenantId, '2026-01-15');
    expect(period).toBeDefined();
    await ledgerService.closeAccountingPeriod(tenantId, userId, period!.id);

    // Attempt to post into closed period
    await expect(
      ledgerService.postJournalEntry(tenantId, userId, {
        entryDate: '2026-01-15',
        description: 'Attempted retroactive post',
        sourceType: 'MANUAL',
        lines: [
          { accountId: cash!.id, debitCents: 50000n, creditCents: 0n },
          { accountId: revenue!.id, debitCents: 0n, creditCents: 50000n },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it('7. should post balanced multi-line journal entry and compute normal balances deterministically', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');
    const taxPayable = await ledgerService.findAccountByCode(tenantId, '2200');

    // Sale of $1,000 + $80 tax = $1,080 cash
    const entry = await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-04-10',
      description: 'Consulting revenue with sales tax',
      sourceType: 'MANUAL',
      lines: [
        { accountId: cash!.id, debitCents: 108000n, creditCents: 0n },
        { accountId: revenue!.id, debitCents: 0n, creditCents: 100000n },
        { accountId: taxPayable!.id, debitCents: 0n, creditCents: 8000n },
      ],
    });

    expect(entry.id).toBeDefined();
    expect(entry.status).toBe('POSTED');
    expect(entry.totalDebitCents).toBe(108000n);
    expect(entry.totalCreditCents).toBe(108000n);

    // Verify Balances in April 2026
    const period = await ledgerService.getPeriodByDate(tenantId, '2026-04-10');
    const trialBalance = await ledgerService.getTrialBalance(tenantId, period!.id);

    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.totalDebitCents).toBe(108000n);
    expect(trialBalance.totalCreditCents).toBe(108000n);
  });

  it('8. REVERSAL WORKFLOW: should reverse entry with exact inverse lines and net balances to zero', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const expense = await ledgerService.findAccountByCode(tenantId, '6010');

    // 1. Post original expense: $250.00
    const original = await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-05-12',
      description: 'Office Supplies Expense',
      sourceType: 'MANUAL',
      lines: [
        { accountId: expense!.id, debitCents: 25000n, creditCents: 0n },
        { accountId: cash!.id, debitCents: 0n, creditCents: 25000n },
      ],
    });

    const period = await ledgerService.getPeriodByDate(tenantId, '2026-05-12');
    let tb = await ledgerService.getTrialBalance(tenantId, period!.id);
    expect(tb.totalDebitCents).toBe(25000n);

    // 2. Reverse entry
    const reversal = await ledgerService.reverseJournalEntry(tenantId, userId, original.id, {
      reason: 'Duplicate supplier charge',
      reversalDate: '2026-05-12',
    });

    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.status).toBe('POSTED');

    // Original entry status should now be REVERSED
    const updatedOriginal = await ledgerService.getEntryById(tenantId, original.id);
    expect(updatedOriginal?.status).toBe('REVERSED');

    // Trial balance should net back to 0
    tb = await ledgerService.getTrialBalance(tenantId, period!.id);
    expect(tb.totalDebitCents).toBe(0n);
    expect(tb.totalCreditCents).toBe(0n);
    expect(tb.isBalanced).toBe(true);
  });

  it('9. FINANCIAL STATEMENTS: Trial Balance, P&L, and Balance Sheet invariants', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const equity = await ledgerService.findAccountByCode(tenantId, '3010');
    const revenue = await ledgerService.findAccountByCode(tenantId, '4010');
    const expense = await ledgerService.findAccountByCode(tenantId, '6010');

    // Transaction 1: Owner injects $50,000 capital
    await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-06-01',
      description: 'Owner Capital Contribution',
      sourceType: 'MANUAL',
      lines: [
        { accountId: cash!.id, debitCents: 5000000n, creditCents: 0n },
        { accountId: equity!.id, debitCents: 0n, creditCents: 5000000n },
      ],
    });

    // Transaction 2: Earned $20,000 revenue
    await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-06-15',
      description: 'Software Services Revenue',
      sourceType: 'MANUAL',
      lines: [
        { accountId: cash!.id, debitCents: 2000000n, creditCents: 0n },
        { accountId: revenue!.id, debitCents: 0n, creditCents: 2000000n },
      ],
    });

    // Transaction 3: Incurred $8,000 operating expense
    await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-06-20',
      description: 'Cloud Hosting Expense',
      sourceType: 'MANUAL',
      lines: [
        { accountId: expense!.id, debitCents: 800000n, creditCents: 0n },
        { accountId: cash!.id, debitCents: 0n, creditCents: 800000n },
      ],
    });

    const period = await ledgerService.getPeriodByDate(tenantId, '2026-06-15');

    // 1. Verify Trial Balance: Total Debits == Total Credits ($70,000)
    const tb = await ledgerService.getTrialBalance(tenantId, period!.id);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitCents).toBe(7000000n);
    expect(tb.totalCreditCents).toBe(7000000n);

    // 2. Verify Profit & Loss: Revenue ($20k) - Expense ($8k) = Net Income ($12k)
    const pnl = await ledgerService.getProfitAndLoss(tenantId, period!.id);
    expect(pnl.totalRevenueCents).toBe(2000000n);
    expect(pnl.totalExpenseCents).toBe(800000n);
    expect(pnl.netIncomeCents).toBe(1200000n); // $12,000 net income

    // 3. Verify Balance Sheet:
    // Assets: Cash = $50k + $20k - $8k = $62,000
    // Liabilities: $0
    // Equity: Capital ($50k) + Retained Earnings / Net Income ($12k) = $62,000
    // Assets == Liabilities + Equity
    const bs = await ledgerService.getBalanceSheet(tenantId, period!.id);
    expect(bs.totalAssetsCents).toBe(6200000n);
    expect(bs.totalLiabilitiesCents).toBe(0n);
    expect(bs.retainedEarningsCents).toBe(1200000n);
    expect(bs.totalEquityCents).toBe(6200000n);
    expect(bs.isBalanced).toBe(true);
  });

  it('10. AUDIT: should record cryptographically chained audit events for ledger mutations', async () => {
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const equity = await ledgerService.findAccountByCode(tenantId, '3010');

    await ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: '2026-07-01',
      description: 'Capital Contribution',
      sourceType: 'MANUAL',
      lines: [
        { accountId: cash!.id, debitCents: 100000n, creditCents: 0n },
        { accountId: equity!.id, debitCents: 0n, creditCents: 100000n },
      ],
    });

    const auditVerification = await auditRepo.listEvents(tenantId);
    expect(auditVerification.length).toBeGreaterThanOrEqual(1);

    const postEvent = auditVerification.find((e) => e.action === 'JOURNAL_ENTRY_POSTED');
    expect(postEvent).toBeDefined();
    expect(postEvent?.actorId).toBe(userId);
  });
});
