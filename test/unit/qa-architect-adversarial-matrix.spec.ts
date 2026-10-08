import { describe, it, expect, beforeEach } from 'vitest';

import {
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { StatementValidationService } from '../../src/modules/banking/services/statement-validation.service';
import { InMemoryCounterpartyRepository } from '../../src/modules/counterparties/repositories/in-memory-counterparty.repository';
import { CounterpartyService } from '../../src/modules/counterparties/services/counterparty.service';
import { InMemoryInvoiceRepository } from '../../src/modules/invoices/repositories/in-memory-invoice.repository';
import { InvoiceService } from '../../src/modules/invoices/services/invoice.service';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

import type { ParsedStatementResult } from '../../src/modules/banking/parsers/statement-parser.interface';

/**
 * ==============================================================================
 * ENTERPRISE QA ARCHITECT ADVERSARIAL MATRIX (EvidenceQA & Reality-Checker Mode)
 * ==============================================================================
 * Rigorously attempts to break system invariants:
 * 1. Statement Mathematical Checksum Tampering
 * 2. General Ledger Double-Entry Imbalance Rejection
 * 3. Closed Accounting Period Posting Lockout
 * 4. Invoice Over-Allocation & Partial Bounds Safety
 * 5. Negative / Zero Line Item Injection Prevention
 * 6. Voiding Posted Invoices via Immutable Reversing Journals
 * 7. Multi-Tenant Isolation & Cross-Tenant Leak Prevention
 * 8. Running Balance Sequence Continuity & Gap Detection
 * ==============================================================================
 */
describe('Enterprise QA Architect: System Invariant Stress Test Suite', () => {
  let statementValidator: StatementValidationService;
  let ledgerService: LedgerService;
  let invoiceService: InvoiceService;
  let counterpartyService: CounterpartyService;
  let auditService: AuditService;

  let ledgerRepo: InMemoryLedgerRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let counterpartyRepo: InMemoryCounterpartyRepository;
  let auditRepo: InMemoryAuditRepository;

  const tenantA = 'tenant-qa-alpha-001';
  const tenantB = 'tenant-qa-bravo-002';
  const userId = 'qa-engineer-001';

  let cashAccountId: string;
  let revenueAccountId: string;
  let customerId: string;

  beforeEach(async () => {
    statementValidator = new StatementValidationService();
    ledgerRepo = new InMemoryLedgerRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    counterpartyRepo = new InMemoryCounterpartyRepository();
    auditRepo = new InMemoryAuditRepository();

    auditService = new AuditService(auditRepo);
    ledgerService = new LedgerService(ledgerRepo, auditService);
    counterpartyService = new CounterpartyService(counterpartyRepo, auditService);
    invoiceService = new InvoiceService(invoiceRepo, counterpartyRepo, ledgerService, auditService);

    // Setup Tenant A Ledger & COA
    await ledgerService.seedStandardChartOfAccounts(tenantA);
    await ledgerService.createFiscalYearAndPeriods(tenantA, 2026);

    const cash = await ledgerService.findAccountByCode(tenantA, '1010');
    const rev = await ledgerService.findAccountByCode(tenantA, '4010');

    if (!cash || !rev) {
      throw new Error('Default accounts not initialized');
    }
    cashAccountId = cash.id;
    revenueAccountId = rev.id;

    // Setup Counterparties
    const cust = await counterpartyService.createCounterparty(tenantA, userId, {
      legalName: 'Alpha Customer Ltd',
      type: 'CUSTOMER',
    });
    customerId = cust.id;
  });

  /* -------------------------------------------------------------------------- */
  /* SCENARIO 1: BANK STATEMENT MATHEMATICAL INTEGRITY & TAMPERING               */
  /* -------------------------------------------------------------------------- */
  describe('Scenario 1: Statement Mathematical Checksum Tampering', () => {
    it('QA-FAIL-01: Rejects statement when closing balance has been tampered with', () => {
      const tamperedStatement: ParsedStatementResult = {
        bankName: 'Maybank',
        accountNumberLast4: '1234',
        openingBalanceCents: 100000n, // $1,000.00
        closingBalanceCents: 150000n, // Claimed: $1,500.00
        totalDebitsCents: 20000n, // -$200.00
        totalCreditsCents: 30000n, // +$300.00 -> True closing should be $1,100.00 (110000n)
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        transactions: [
          {
            date: '2026-01-10',
            description: 'Customer Payment In',
            amountCents: 30000n,
            runningBalanceCents: 130000n,
            pageNumber: 1,
            sourceSequence: 1,
          },
          {
            date: '2026-01-20',
            description: 'Software Fee',
            amountCents: -20000n,
            runningBalanceCents: 110000n,
            pageNumber: 1,
            sourceSequence: 2,
          },
        ],
      };

      const result = statementValidator.validate(tamperedStatement);

      expect(result.isValid).toBe(false);
      expect(result.checksumMatches).toBe(false);
      expect(result.checksumDiscrepancyCents).toBe(40000n); // $400.00 discrepancy
      expect(result.issues.some((i) => i.type === 'CHECKSUM_MISMATCH')).toBe(true);
    });

    it('QA-FAIL-02: Detects running balance discontinuity between sequential rows', () => {
      const brokenSequenceStatement: ParsedStatementResult = {
        bankName: 'CIMB',
        accountNumberLast4: '9999',
        openingBalanceCents: 500000n,
        closingBalanceCents: 550000n,
        totalDebitsCents: 50000n,
        totalCreditsCents: 100000n,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        transactions: [
          {
            date: '2026-02-05',
            description: 'Deposit 1',
            amountCents: 100000n,
            runningBalanceCents: 600000n, // Row 1 End: 600000
            pageNumber: 1,
            sourceSequence: 1,
          },
          {
            date: '2026-02-10',
            description: 'Withdrawal 1',
            amountCents: -50000n,
            runningBalanceCents: 520000n, // Discontinuity! 600000 - 50000 = 550000, NOT 520000
            pageNumber: 1,
            sourceSequence: 2,
          },
        ],
      };

      const result = statementValidator.validate(brokenSequenceStatement);

      expect(result.isValid).toBe(false);
      expect(result.runningBalanceContinuous).toBe(false);
      expect(result.issues.some((i) => i.type === 'RUNNING_BALANCE_BREAK')).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SCENARIO 2: GENERAL LEDGER DOUBLE-ENTRY BALANCING INVARIANTS               */
  /* -------------------------------------------------------------------------- */
  describe('Scenario 2: General Ledger Double-Entry Invariants', () => {
    it('QA-FAIL-03: Strictly rejects unbalanced journal entries (sum(Debits) != sum(Credits))', async () => {
      await expect(
        ledgerService.postJournalEntry(tenantA, userId, {
          entryDate: '2026-01-15',
          description: 'Adversarial Unbalanced Entry',
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccountId, debitCents: 10000n, creditCents: 0n },
            { accountId: revenueAccountId, debitCents: 0n, creditCents: 8500n }, // $15.00 missing credit!
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('QA-FAIL-04: Rejects journal entry with negative amounts on lines', async () => {
      await expect(
        ledgerService.postJournalEntry(tenantA, userId, {
          entryDate: '2026-01-15',
          description: 'Adversarial Negative Line',
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccountId, debitCents: -5000n, creditCents: 0n },
            { accountId: revenueAccountId, debitCents: 0n, creditCents: -5000n },
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('QA-FAIL-05: Rejects posting to a LOCKED or CLOSED accounting period', async () => {
      const periods = await ledgerRepo.listPeriods(tenantA);
      const janPeriod = periods[0];
      if (!janPeriod) {
        throw new Error('Jan period not found');
      }

      // Lock the period
      await ledgerService.closeAccountingPeriod(tenantA, userId, janPeriod.id);

      await expect(
        ledgerService.postJournalEntry(tenantA, userId, {
          entryDate: '2026-01-15',
          description: 'Posting to closed period',
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccountId, debitCents: 5000n, creditCents: 0n },
            { accountId: revenueAccountId, debitCents: 0n, creditCents: 5000n },
          ],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SCENARIO 3: INVOICE LIFECYCLE, ALLOCATIONS & OVERPAYMENT DEFENSE           */
  /* -------------------------------------------------------------------------- */
  describe('Scenario 3: Invoice Lifecycle & Payment Allocation Bounds', () => {
    it('QA-FAIL-06: Prevents over-allocating payment beyond invoice amount due', async () => {
      // 1. Create Invoice for $100.00
      const invoice = await invoiceService.createInvoice(tenantA, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-QA-OVERPAY',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Widget Sales',
            quantity: 1,
            unitCostCents: 10000n, // $100.00
          },
        ],
      });

      // 2. Post the invoice
      await invoiceService.postInvoice(tenantA, userId, invoice.id);

      // 3. Attempt to allocate $150.00 payment to $100.00 invoice
      await expect(
        invoiceService.recordPayment(tenantA, userId, {
          counterpartyId: customerId,
          paymentAccountId: cashAccountId,
          paymentType: 'RECEIPT',
          paymentDate: '2026-03-05',
          paymentMethod: 'ACH',
          amountCents: 15000n,
          allocations: [
            {
              invoiceId: invoice.id,
              allocatedAmountCents: 15000n, // $50.00 over the limit!
            },
          ],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    it('QA-PASS-01: Successfully supports partial payments with exact balance reduction', async () => {
      // 1. Create Invoice for $200.00
      const invoice = await invoiceService.createInvoice(tenantA, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-QA-PARTIAL',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Retainer Fee',
            quantity: 2,
            unitCostCents: 10000n, // $200.00 total
          },
        ],
      });

      await invoiceService.postInvoice(tenantA, userId, invoice.id);

      // 2. Pay $80.00 (First installment)
      await invoiceService.recordPayment(tenantA, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-10',
        paymentMethod: 'ACH',
        amountCents: 8000n,
        allocations: [{ invoiceId: invoice.id, allocatedAmountCents: 8000n }],
      });

      const invAfterPay1 = await invoiceService.getInvoiceById(tenantA, invoice.id);
      expect(invAfterPay1).not.toBeNull();
      expect(invAfterPay1?.status).toBe('PARTIALLY_PAID');
      expect(invAfterPay1?.amountDueCents).toBe(12000n); // $120.00 remaining

      // 3. Pay $120.00 (Final installment)
      await invoiceService.recordPayment(tenantA, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-25',
        paymentMethod: 'ACH',
        amountCents: 12000n,
        allocations: [{ invoiceId: invoice.id, allocatedAmountCents: 12000n }],
      });

      const invAfterPay2 = await invoiceService.getInvoiceById(tenantA, invoice.id);
      expect(invAfterPay2).not.toBeNull();
      expect(invAfterPay2?.status).toBe('PAID');
      expect(invAfterPay2?.amountDueCents).toBe(0n);
    });

    it('QA-PASS-02: Voiding a posted invoice creates an immutable reversing journal entry', async () => {
      // 1. Create and Post Invoice for $500.00
      const invoice = await invoiceService.createInvoice(tenantA, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-QA-VOID-TEST',
        issueDate: '2026-04-01',
        dueDate: '2026-04-30',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Architecture Review',
            quantity: 1,
            unitCostCents: 50000n,
          },
        ],
      });

      const postedInvoice = await invoiceService.postInvoice(tenantA, userId, invoice.id);
      expect(postedInvoice.journalEntryId).toBeDefined();

      const jeId = postedInvoice.journalEntryId ?? '';

      // Check original journal entry is POSTED
      const originalJe = await ledgerRepo.findEntryById(tenantA, jeId);
      expect(originalJe).not.toBeNull();
      expect(originalJe?.status).toBe('POSTED');

      // 2. Void the posted invoice
      const voided = await invoiceService.voidInvoice(tenantA, userId, invoice.id, {
        reason: 'Client cancelled project',
      });

      expect(voided.status).toBe('VOID');

      // Verify that a Reversing Journal Entry was posted
      const updatedOriginalJe = await ledgerRepo.findEntryById(tenantA, jeId);
      expect(updatedOriginalJe?.status).toBe('REVERSED');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SCENARIO 4: MULTI-TENANT ISOLATION & CROSS-TENANT DEFENSE                  */
  /* -------------------------------------------------------------------------- */
  describe('Scenario 4: Multi-Tenant Isolation (Tenant B cannot tamper with Tenant A)', () => {
    it('QA-FAIL-07: Tenant B cannot view, allocate, or modify Tenant A invoices', async () => {
      // 1. Create Invoice in Tenant A
      const invA = await invoiceService.createInvoice(tenantA, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-TENANT-A-SECRET',
        issueDate: '2026-05-01',
        dueDate: '2026-05-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Secret Project',
            quantity: 1,
            unitCostCents: 100000n,
          },
        ],
      });

      // 2. Tenant B attempts to read Tenant A invoice -> Must return null
      const tenantBView = await invoiceService.getInvoiceById(tenantB, invA.id);
      expect(tenantBView).toBeNull();

      // 3. Tenant B attempts to post Tenant A invoice -> Must throw NotFoundError
      await expect(invoiceService.postInvoice(tenantB, userId, invA.id)).rejects.toThrow(
        NotFoundError,
      );

      // 4. Tenant B attempts to void Tenant A invoice -> Must throw NotFoundError
      await expect(
        invoiceService.voidInvoice(tenantB, userId, invA.id, { reason: 'Malicious Void Attempt' }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
