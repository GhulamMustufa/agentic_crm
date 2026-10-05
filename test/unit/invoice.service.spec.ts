import { describe, it, expect, beforeEach } from 'vitest';

import {
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { InMemoryCounterpartyRepository } from '../../src/modules/counterparties/repositories/in-memory-counterparty.repository';
import { CounterpartyService } from '../../src/modules/counterparties/services/counterparty.service';
import { InMemoryInvoiceRepository } from '../../src/modules/invoices/repositories/in-memory-invoice.repository';
import { InvoiceService } from '../../src/modules/invoices/services/invoice.service';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

describe('InvoiceService (Phase 1 Accounting Invariants)', () => {
  let invoiceService: InvoiceService;
  let counterpartyService: CounterpartyService;
  let ledgerService: LedgerService;
  let invoiceRepo: InMemoryInvoiceRepository;
  let counterpartyRepo: InMemoryCounterpartyRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditService: AuditService;

  const tenantId = 'tenant-inv-001';
  const userId = 'user-inv-001';

  let customerId: string;
  let vendorId: string;
  let cashAccountId: string;
  let arAccountId: string;
  let apAccountId: string;
  let revenueAccountId: string;
  let expenseAccountId: string;

  beforeEach(async () => {
    invoiceRepo = new InMemoryInvoiceRepository();
    counterpartyRepo = new InMemoryCounterpartyRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditService = new AuditService(new InMemoryAuditRepository());

    ledgerService = new LedgerService(ledgerRepo, auditService);
    counterpartyService = new CounterpartyService(counterpartyRepo, auditService);
    invoiceService = new InvoiceService(invoiceRepo, counterpartyRepo, ledgerService, auditService);

    // 1. Seed Chart of Accounts
    await ledgerService.seedStandardChartOfAccounts(tenantId);

    // 2. Initialize 2026 fiscal year and 12 periods
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);

    // 3. Resolve accounts
    const cash = await ledgerService.findAccountByCode(tenantId, '1010');
    const ar = await ledgerService.findAccountByCode(tenantId, '1200');
    const ap = await ledgerService.findAccountByCode(tenantId, '2010');
    const rev = await ledgerService.findAccountByCode(tenantId, '4010');
    const exp = await ledgerService.findAccountByCode(tenantId, '5010');

    cashAccountId = cash!.id;
    arAccountId = ar!.id;
    apAccountId = ap!.id;
    revenueAccountId = rev!.id;
    expenseAccountId = exp!.id;

    // 4. Create customer & vendor
    const cust = await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'Acme Corp',
      type: 'CUSTOMER',
    });
    customerId = cust.id;

    const vend = await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'AWS Cloud Services',
      type: 'VENDOR',
    });
    vendorId = vend.id;
  });

  describe('Invoice Creation & Deterministic Line Math', () => {
    it('should create a customer draft invoice with deterministic integer cents calculation', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-001',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Platform seats (5 users @ $20.00)',
            quantity: 5,
            unitCostCents: 2000n, // $20.00 each = $100.00 total
          },
          {
            accountId: revenueAccountId,
            description: 'Implementation consulting (2.5 hrs @ $150.00)',
            quantity: 2.5,
            unitCostCents: 15000n, // $150.00 each = $375.00 total
          },
        ],
        taxCents: 2500n, // $25.00 sales tax
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.status).toBe('DRAFT');
      expect(invoice.subtotalCents).toBe(47500n); // $100 + $375 = $475.00
      expect(invoice.taxCents).toBe(2500n);
      expect(invoice.totalCents).toBe(50000n); // $500.00 total
      expect(invoice.amountDueCents).toBe(50000n);
      expect(invoice.lines).toHaveLength(2);
      expect(invoice.lines[0]?.totalCents).toBe(10000n);
      expect(invoice.lines[1]?.totalCents).toBe(37500n);
    });

    it('should throw NotFoundError if counterparty does not exist', async () => {
      await expect(
        invoiceService.createInvoice(tenantId, {
          counterpartyId: '00000000-0000-0000-0000-000000000000',
          invoiceType: 'INVOICE',
          invoiceNumber: 'INV-000',
          issueDate: '2026-03-01',
          dueDate: '2026-03-31',
          currency: 'USD',
          lines: [
            {
              accountId: revenueAccountId,
              description: 'Service',
              quantity: 1,
              unitCostCents: 1000n,
            },
          ],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if lines array is empty', async () => {
      await expect(
        invoiceService.createInvoice(tenantId, {
          counterpartyId: customerId,
          invoiceType: 'INVOICE',
          invoiceNumber: 'INV-000',
          issueDate: '2026-03-01',
          dueDate: '2026-03-31',
          currency: 'USD',
          lines: [],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Invoice Posting & Double-Entry Ledger Invariants', () => {
    it('should post customer invoice and create balanced AR journal entry in ledger', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-2026-002',
        issueDate: '2026-03-05',
        dueDate: '2026-04-05',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Annual Subscription',
            quantity: 1,
            unitCostCents: 120000n, // $1,200.00
          },
        ],
        taxCents: 6000n, // $60.00 sales tax
      });

      const posted = await invoiceService.postInvoice(tenantId, userId, invoice.id);
      expect(posted.status).toBe('POSTED');
      expect(posted.journalEntryId).toBeDefined();

      // Verify the generated Journal Entry in the ledger
      const entry = await ledgerService.getEntryById(tenantId, posted.journalEntryId!);
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('POSTED');
      expect(entry!.sourceType).toBe('INVOICE');
      expect(entry!.sourceId).toBe(invoice.id);

      // Invariant: Total Debits == Total Credits == Total Invoice ($1,260.00)
      const totalDebits = entry!.lines.reduce((sum, l) => sum + l.debitCents, 0n);
      const totalCredits = entry!.lines.reduce((sum, l) => sum + l.creditCents, 0n);
      expect(totalDebits).toBe(126000n);
      expect(totalCredits).toBe(126000n);

      // AR Line: Dr 1200 for $1,260.00
      const arLine = entry!.lines.find((l) => l.accountId === arAccountId);
      expect(arLine).toBeDefined();
      expect(arLine!.debitCents).toBe(126000n);
      expect(arLine!.creditCents).toBe(0n);

      // Revenue Line: Cr 4010 for $1,200.00
      const revLine = entry!.lines.find((l) => l.accountId === revenueAccountId);
      expect(revLine).toBeDefined();
      expect(revLine!.creditCents).toBe(120000n);

      // Tax Line: Cr 2200 for $60.00
      const taxLine = entry!.lines.find((l) => l.debitCents === 0n && l.creditCents === 6000n);
      expect(taxLine).toBeDefined();
    });

    it('should post vendor bill and create balanced AP journal entry in ledger', async () => {
      const bill = await invoiceService.createInvoice(tenantId, {
        counterpartyId: vendorId,
        invoiceType: 'BILL',
        invoiceNumber: 'BILL-AWS-001',
        issueDate: '2026-03-01',
        dueDate: '2026-03-15',
        currency: 'USD',
        lines: [
          {
            accountId: expenseAccountId,
            description: 'EC2 & RDS Cloud Hosting',
            quantity: 1,
            unitCostCents: 45000n, // $450.00
          },
        ],
      });

      const posted = await invoiceService.postInvoice(tenantId, userId, bill.id);
      expect(posted.status).toBe('POSTED');

      // Verify Journal Entry
      const entry = await ledgerService.getEntryById(tenantId, posted.journalEntryId!);
      expect(entry).not.toBeNull();
      expect(entry!.sourceType).toBe('BILL');

      // Expense Line: Dr 5010 for $450.00
      const expLine = entry!.lines.find((l) => l.accountId === expenseAccountId);
      expect(expLine?.debitCents).toBe(45000n);

      // AP Line: Cr 2010 for $450.00
      const apLine = entry!.lines.find((l) => l.accountId === apAccountId);
      expect(apLine?.creditCents).toBe(45000n);
    });

    it('should reject posting already posted invoice', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-DOUBLE-POST',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          { accountId: revenueAccountId, description: 'Test', quantity: 1, unitCostCents: 1000n },
        ],
      });

      await invoiceService.postInvoice(tenantId, userId, invoice.id);
      await expect(invoiceService.postInvoice(tenantId, userId, invoice.id)).rejects.toThrow(
        UnprocessableEntityError,
      );
    });
  });

  describe('Payments & Allocations', () => {
    it('should record full payment receipt, allocate to invoice, update status to PAID and update ledger', async () => {
      // 1. Create and post invoice for $300.00
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-PAY-001',
        issueDate: '2026-03-10',
        dueDate: '2026-04-10',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Services',
            quantity: 1,
            unitCostCents: 30000n,
          },
        ],
      });
      await invoiceService.postInvoice(tenantId, userId, invoice.id);

      // 2. Record full customer payment receipt
      const payment = await invoiceService.recordPayment(tenantId, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-15',
        amountCents: 30000n,
        paymentMethod: 'ACH',
        referenceNumber: 'ACH-12345',
        allocations: [
          {
            invoiceId: invoice.id,
            allocatedAmountCents: 30000n,
          },
        ],
      });

      expect(payment.id).toBeDefined();
      expect(payment.journalEntryId).toBeDefined();

      // Invariant: Invoice amount due is now 0 and status is PAID
      const updatedInv = await invoiceService.getInvoiceById(tenantId, invoice.id);
      expect(updatedInv?.amountDueCents).toBe(0n);
      expect(updatedInv?.status).toBe('PAID');

      // Invariant: Ledger shows Cash Debited ($300.00) and AR Credited ($300.00)
      const entry = await ledgerService.getEntryById(tenantId, payment.journalEntryId!);
      expect(entry).not.toBeNull();
      const cashLine = entry!.lines.find((l) => l.accountId === cashAccountId);
      const arLine = entry!.lines.find((l) => l.accountId === arAccountId);
      expect(cashLine?.debitCents).toBe(30000n);
      expect(arLine?.creditCents).toBe(30000n);
    });

    it('should record partial payment and correctly transition status to PARTIALLY_PAID', async () => {
      // Create and post $1,000.00 invoice
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-PARTIAL-001',
        issueDate: '2026-03-10',
        dueDate: '2026-04-10',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Project Phase 1',
            quantity: 1,
            unitCostCents: 100000n,
          },
        ],
      });
      await invoiceService.postInvoice(tenantId, userId, invoice.id);

      // Partial payment of $400.00
      await invoiceService.recordPayment(tenantId, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-12',
        paymentMethod: 'ACH',
        amountCents: 40000n,
        allocations: [{ invoiceId: invoice.id, allocatedAmountCents: 40000n }],
      });

      const partialInv = await invoiceService.getInvoiceById(tenantId, invoice.id);
      expect(partialInv?.amountDueCents).toBe(60000n); // $600.00 remaining
      expect(partialInv?.status).toBe('PARTIALLY_PAID');

      // Pay the remaining $600.00
      await invoiceService.recordPayment(tenantId, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-20',
        paymentMethod: 'ACH',
        amountCents: 60000n,
        allocations: [{ invoiceId: invoice.id, allocatedAmountCents: 60000n }],
      });

      const fullyPaidInv = await invoiceService.getInvoiceById(tenantId, invoice.id);
      expect(fullyPaidInv?.amountDueCents).toBe(0n);
      expect(fullyPaidInv?.status).toBe('PAID');
    });

    it('should reject allocation exceeding invoice amount due', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-EXCEED-001',
        issueDate: '2026-03-10',
        dueDate: '2026-04-10',
        currency: 'USD',
        lines: [
          { accountId: revenueAccountId, description: 'Test', quantity: 1, unitCostCents: 10000n },
        ], // $100.00
      });
      await invoiceService.postInvoice(tenantId, userId, invoice.id);

      await expect(
        invoiceService.recordPayment(tenantId, userId, {
          counterpartyId: customerId,
          paymentAccountId: cashAccountId,
          paymentType: 'RECEIPT',
          paymentDate: '2026-03-15',
          paymentMethod: 'ACH',
          amountCents: 15000n,
          allocations: [
            {
              invoiceId: invoice.id,
              allocatedAmountCents: 15000n, // $150.00 allocated against $100.00 invoice
            },
          ],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });

    it('should record vendor disbursement reducing AP balance', async () => {
      // Create and post $500.00 vendor bill
      const bill = await invoiceService.createInvoice(tenantId, {
        counterpartyId: vendorId,
        invoiceType: 'BILL',
        invoiceNumber: 'BILL-DISB-001',
        issueDate: '2026-03-01',
        dueDate: '2026-03-15',
        currency: 'USD',
        lines: [
          {
            accountId: expenseAccountId,
            description: 'Hosting',
            quantity: 1,
            unitCostCents: 50000n,
          },
        ],
      });
      await invoiceService.postInvoice(tenantId, userId, bill.id);

      // Pay bill: Debit AP, Credit Cash
      const payment = await invoiceService.recordPayment(tenantId, userId, {
        counterpartyId: vendorId,
        paymentAccountId: cashAccountId,
        paymentType: 'DISBURSEMENT',
        paymentDate: '2026-03-14',
        amountCents: 50000n,
        paymentMethod: 'WIRE',
        allocations: [{ invoiceId: bill.id, allocatedAmountCents: 5000n }],
      });

      expect(payment.id).toBeDefined();
      const updatedBill = await invoiceService.getInvoiceById(tenantId, bill.id);
      expect(updatedBill?.status).toBe('PARTIALLY_PAID');

      // Check journal entry for disbursement
      const entry = await ledgerService.getEntryById(tenantId, payment.journalEntryId!);
      expect(entry).not.toBeNull();
      const apLine = entry!.lines.find((l) => l.accountId === apAccountId);
      const cashLine = entry!.lines.find((l) => l.accountId === cashAccountId);
      expect(apLine?.debitCents).toBe(50000n); // Debit AP reduces liability
      expect(cashLine?.creditCents).toBe(50000n); // Credit Cash reduces asset
    });
  });

  describe('Invoice Voiding & Correction Workflows', () => {
    it('should void a draft invoice without creating journal reversals', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-DRAFT-VOID',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Mistake',
            quantity: 1,
            unitCostCents: 5000n,
          },
        ],
      });

      const voided = await invoiceService.voidInvoice(tenantId, userId, invoice.id, {
        reason: 'Customer cancelled project before start',
      });
      expect(voided.status).toBe('VOID');
      expect(voided.journalEntryId).toBeUndefined();
    });

    it('should void a posted invoice by triggering reversing journal entry in ledger', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-POSTED-VOID',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          {
            accountId: revenueAccountId,
            description: 'Incorrect billing',
            quantity: 1,
            unitCostCents: 20000n,
          },
        ],
      });
      const posted = await invoiceService.postInvoice(tenantId, userId, invoice.id);
      const originalEntryId = posted.journalEntryId!;

      const voided = await invoiceService.voidInvoice(tenantId, userId, invoice.id, {
        reason: 'Billing error, issued credit note',
      });
      expect(voided.status).toBe('VOID');

      // Original journal entry must now be marked REVERSED
      const originalEntry = await ledgerService.getEntryById(tenantId, originalEntryId);
      expect(originalEntry?.status).toBe('REVERSED');
      expect(originalEntry?.reversedByEntryId).toBeDefined();

      // Check the reversal entry in the ledger
      const reversalEntry = await ledgerService.getEntryById(
        tenantId,
        originalEntry!.reversedByEntryId!,
      );
      expect(reversalEntry).not.toBeNull();
      expect(reversalEntry?.description).toContain('Reversal');

      // Invariant: Trial balance net AR and Revenue for this voided invoice is 0
      const period = await ledgerService.getPeriodByDate(tenantId, '2026-03-01');
      const trialBalance = await ledgerService.getTrialBalance(tenantId, period!.id);
      const arBal = trialBalance.items.find((r) => r.accountId === arAccountId);
      const revBal = trialBalance.items.find((r) => r.accountId === revenueAccountId);
      expect(arBal?.debitBalanceCents).toBe(0n);
      expect(revBal?.creditBalanceCents).toBe(0n);
    });

    it('should reject voiding an invoice with payments applied', async () => {
      const invoice = await invoiceService.createInvoice(tenantId, {
        counterpartyId: customerId,
        invoiceType: 'INVOICE',
        invoiceNumber: 'INV-CANNOT-VOID',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        currency: 'USD',
        lines: [
          { accountId: revenueAccountId, description: 'Work', quantity: 1, unitCostCents: 10000n },
        ],
      });
      await invoiceService.postInvoice(tenantId, userId, invoice.id);
      await invoiceService.recordPayment(tenantId, userId, {
        counterpartyId: customerId,
        paymentAccountId: cashAccountId,
        paymentType: 'RECEIPT',
        paymentDate: '2026-03-05',
        paymentMethod: 'ACH',
        amountCents: 5000n,
        allocations: [{ invoiceId: invoice.id, allocatedAmountCents: 5000n }],
      });

      await expect(
        invoiceService.voidInvoice(tenantId, userId, invoice.id, {
          reason: 'Attempting void',
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    });
  });
});
