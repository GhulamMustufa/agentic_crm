import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
import {
  ConflictError,
  UnprocessableEntityError,
  ValidationError,
} from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { AiStatementParser } from '../../src/modules/banking/parsers/ai-statement.parser';
import { CsvStatementParser } from '../../src/modules/banking/parsers/csv-statement.parser';
import { PdfStatementParser } from '../../src/modules/banking/parsers/pdf-statement.parser';
import { InMemoryBankingRepository } from '../../src/modules/banking/repositories/in-memory-banking.repository';
import { AiAccountantService } from '../../src/modules/banking/services/ai-accountant.service';
import { BankProcessingService } from '../../src/modules/banking/services/bank-processing.service';
import { InMemoryCounterpartyRepository } from '../../src/modules/counterparties/repositories/in-memory-counterparty.repository';
import { CounterpartyService } from '../../src/modules/counterparties/services/counterparty.service';
import { InMemoryInvoiceRepository } from '../../src/modules/invoices/repositories/in-memory-invoice.repository';
import { InvoiceService } from '../../src/modules/invoices/services/invoice.service';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

async function expectTrialBalanceBalanced(
  ledgerService: LedgerService,
  tenantId: string,
  date: string,
): Promise<void> {
  const period = await ledgerService.getPeriodByDate(tenantId, date);
  expect(period).toBeDefined();
  const tb = await ledgerService.getTrialBalance(tenantId, period!.id);
  expect(tb.isBalanced).toBe(true);
}

describe('BankProcessingService - AI Accountant Workflow', () => {
  let bankProcessingService: BankProcessingService;
  let aiAccountantService: AiAccountantService;
  let bankingRepo: InMemoryBankingRepository;
  let counterpartyRepo: InMemoryCounterpartyRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditService: AuditService;
  let ledgerService: LedgerService;
  let counterpartyService: CounterpartyService;
  let invoiceService: InvoiceService;
  let pdfParser: PdfStatementParser;
  let csvParser: CsvStatementParser;

  const tenantId = 'tenant-bank-001';
  const userId = 'user-bank-001';

  let operatingBankAccountId: string;
  let checkingLedgerAccId: string;
  let savingsLedgerAccId: string;
  let customerCounterpartyId: string;
  let openInvoiceId: string;

  beforeEach(async () => {
    bankingRepo = new InMemoryBankingRepository();
    counterpartyRepo = new InMemoryCounterpartyRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditService = new AuditService(new InMemoryAuditRepository());

    ledgerService = new LedgerService(ledgerRepo, auditService);
    counterpartyService = new CounterpartyService(counterpartyRepo, auditService);
    invoiceService = new InvoiceService(invoiceRepo, counterpartyRepo, ledgerService, auditService);

    const aiGateway = new AiGatewayService();
    aiAccountantService = new AiAccountantService(aiGateway);
    csvParser = new CsvStatementParser();
    pdfParser = new PdfStatementParser({} as unknown as AiStatementParser);

    bankProcessingService = new BankProcessingService(
      bankingRepo,
      counterpartyRepo,
      invoiceRepo,
      ledgerService,
      auditService,
      aiAccountantService,
      csvParser,
      pdfParser,
    );

    // 1. Seed COA and Fiscal Periods
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);

    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');
    checkingLedgerAccId = cashAcc!.id;

    // Create a secondary cash account for savings
    const savingsAcc = await ledgerService.createAccount(tenantId, {
      accountCode: '1020',
      name: 'Business Savings Account',
      classification: 'ASSET',
      subClassification: 'CASH_AND_EQUIVALENTS',
    });
    savingsLedgerAccId = savingsAcc.id;

    // 2. Create Bank Accounts
    const opBank = await bankProcessingService.createBankAccount(tenantId, userId, {
      ledgerAccountId: checkingLedgerAccId,
      accountName: 'Operating Checking',
      institutionName: 'First National Bank',
      accountType: 'CHECKING',
      currency: 'USD',
      accountNumberLast4: '1234',
    });
    operatingBankAccountId = opBank.id;

    await bankProcessingService.createBankAccount(tenantId, userId, {
      ledgerAccountId: savingsLedgerAccId,
      accountName: 'Reserve Savings',
      institutionName: 'First National Bank',
      accountType: 'SAVINGS',
      currency: 'USD',
      accountNumberLast4: '4321',
    });

    // 3. Counterparties
    const customer = await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'Acme Corporation',
      type: 'CUSTOMER',
    });
    customerCounterpartyId = customer.id;

    await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'AWS Cloud Services',
      type: 'VENDOR',
    });

    // 4. Create and Post Open Customer Invoice for $1,500.00
    const inv = await invoiceService.createInvoice(tenantId, {
      counterpartyId: customerCounterpartyId,
      invoiceType: 'INVOICE',
      invoiceNumber: 'INV-2026-001',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      currency: 'USD',
      lines: [
        {
          accountId: (await ledgerService.findAccountByCode(tenantId, '4010'))!.id,
          description: 'SaaS Platform Subscription Q1',
          quantity: 1,
          unitCostCents: 150000n,
        },
      ],
    });
    await invoiceService.postInvoice(tenantId, userId, inv.id);
    openInvoiceId = inv.id;
  });

  // =========================================================================
  // 1. DUPLICATE STATEMENTS TEST
  // =========================================================================
  it('should reject duplicate bank statements by cryptographic hash and period overlap', async () => {
    const csvContent = `Date,Description,Amount
2026-03-01,Opening Deposit,5000.00
2026-03-05,Office Supplies,-150.00`;

    // 1st Upload succeeds
    const firstUpload = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'statement_march_2026.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    expect(firstUpload.statement).toBeDefined();
    expect(firstUpload.statement.status).toBe('PARSED');

    // 2nd Upload with exact same content -> ConflictError (SHA-256 match)
    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'statement_march_copy.csv',
        mimeType: 'text/csv',
        content: csvContent,
      }),
    ).rejects.toThrow(ConflictError);

    const exceptions = await bankProcessingService.listExceptions(tenantId, {
      status: 'OPEN',
    });
    const dupExc = exceptions.find((e) => e.exceptionType === 'DUPLICATE_STATEMENT');
    expect(dupExc).toBeDefined();
    expect(dupExc?.severity).toBe('HIGH');
  });

  // =========================================================================
  // 2. DUPLICATE TRANSACTIONS TEST
  // =========================================================================
  it('should detect duplicate transaction lines, exclude them from batch, and generate exceptions', async () => {
    // Statement has 2 identical transaction lines
    const csvContent = `Date,Description,Amount
2026-03-02,Client Retainer Fee,2000.00
2026-03-02,Client Retainer Fee,2000.00
2026-03-10,Software License,-80.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'march_duplicates.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    // Only 2 distinct transactions should be persisted
    expect(result.transactions.length).toBe(2);

    // Duplicate exception should be recorded
    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const dupTxExc = exceptions.find((e) => e.exceptionType === 'DUPLICATE_TRANSACTION');
    expect(dupTxExc).toBeDefined();
    expect(dupTxExc?.reason).toContain('Client Retainer Fee');
  });

  it('should preserve legitimate repeated transactions on the same day when sourceSequence is provided', async () => {
    vi.spyOn(pdfParser, 'parse').mockResolvedValueOnce({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      openingBalanceCents: 1000000n,
      closingBalanceCents: 990000n,
      totalDebitsCents: 10000n,
      totalCreditsCents: 0n,
      pageCount: 1,
      extractionMode: 'NATIVE_LAYOUT',
      bankDetected: 'MAYBANK_ISLAMIC',
      transactions: [
        {
          date: '2026-03-05',
          description: 'Grab Transport Kuala Lumpur',
          amountCents: -5000n,
          pageNumber: 1,
          sourceSequence: 1,
          sourceRowIndex: 0,
          runningBalanceCents: 995000n,
          rawPrimaryText: 'Grab Transport Kuala Lumpur',
          bankReference: 'GRAB-001',
        },
        {
          date: '2026-03-05',
          description: 'Grab Transport Kuala Lumpur',
          amountCents: -5000n,
          pageNumber: 1,
          sourceSequence: 2,
          sourceRowIndex: 1,
          runningBalanceCents: 990000n,
          rawPrimaryText: 'Grab Transport Kuala Lumpur',
          bankReference: 'GRAB-002',
        },
      ],
    });

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'maybank_grab_rides.pdf',
      mimeType: 'application/pdf',
      content: '%PDF-1.4 mock content %%EOF',
    });

    // Both legitimate repeated transactions must be preserved!
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0]?.sourceSequence).toBe(1);
    expect(result.transactions[1]?.sourceSequence).toBe(2);
    expect(result.transactions[0]?.bankReference).toBe('GRAB-001');
    expect(result.transactions[1]?.bankReference).toBe('GRAB-002');
    expect(result.transactions[0]?.pageNumber).toBe(1);
    expect(result.transactions[1]?.pageNumber).toBe(1);
    expect(result.statement.pageCount).toBe(1);
    expect(result.statement.bankDetected).toBe('MAYBANK_ISLAMIC');

    // No duplicate transaction exception should be created
    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const dupExc = exceptions.find(
      (e) => e.exceptionType === 'DUPLICATE_TRANSACTION' && e.reason.includes('Grab Transport'),
    );
    expect(dupExc).toBeUndefined();
  });

  // =========================================================================
  // 3. MALFORMED PDF TEST
  // =========================================================================
  it('should catch malformed PDF statements, fail ingestion, and create a MALFORMED_PDF exception', async () => {
    // PDF missing %PDF- header
    const badPdfContent = 'CORRUPTED FILE NOT A PDF HEADER %%EOF';

    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'corrupted.pdf',
        mimeType: 'application/pdf',
        content: badPdfContent,
      }),
    ).rejects.toThrow(ValidationError);

    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const pdfExc = exceptions.find((e) => e.exceptionType === 'MALFORMED_PDF');
    expect(pdfExc).toBeDefined();
    expect(pdfExc?.severity).toBe('HIGH');
  });

  // =========================================================================
  // 4. MISSING FIELDS TEST
  // =========================================================================
  it('should reject statement with missing required columns and raise MISSING_FIELDS exception', async () => {
    // CSV missing Description column
    const invalidCsv = `Date,Amount
2026-03-01,1000.00
2026-03-02,-50.00`;

    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'missing_desc.csv',
        mimeType: 'text/csv',
        content: invalidCsv,
      }),
    ).rejects.toThrow(ValidationError);

    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const missingExc = exceptions.find((e) => e.exceptionType === 'MISSING_FIELDS');
    expect(missingExc).toBeDefined();
  });

  // =========================================================================
  // 5. AMBIGUOUS TRANSACTION TEST
  // =========================================================================
  it('should flag ambiguous transaction, prevent autonomous posting, and route to Exception Center for human review', async () => {
    const csvContent = `Date,Description,Amount
2026-03-12,MISC WIRE 99241 REF X,-350.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'ambiguous_tx.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe('PROPOSED');
    expect(proposal!.confidenceScore).toBeLessThan(0.6);

    // Verify Exception created
    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const ambExc = exceptions.find((e) => e.exceptionType === 'AMBIGUOUS_TRANSACTION');
    expect(ambExc).toBeDefined();

    // Human operator corrects and approves proposal to 6010 G&A Expense
    const expenseAcc = await ledgerService.findAccountByCode(tenantId, '6010');
    const corrected = await bankProcessingService.correctAndApproveProposal(
      tenantId,
      userId,
      proposal!.id,
      {
        debitAccountId: expenseAcc!.id,
        notes: 'Reviewed: wire transfer was for legal consult fees',
      },
    );

    expect(corrected.status).toBe('APPROVED');
    expect(corrected.postedJournalEntryId).toBeDefined();

    // Ledger balance should be updated
    await expectTrialBalanceBalanced(ledgerService, tenantId, '2026-03-31');
  });

  // =========================================================================
  // 6. INTERNAL TRANSFER TEST
  // =========================================================================
  it('should identify internal transfer between bank accounts and autonomously post transfer journal entry', async () => {
    // Outflow from Checking with description mentioning Savings last 4 digits
    const csvContent = `Date,Description,Amount
2026-03-15,ONLINE TRANSFER TO RESERVE SAVINGS 4321,-2000.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'transfer_statement.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal!.proposalType).toBe('TRANSFER');
    expect(proposal!.confidenceScore).toBe(0.98);
    expect(proposal!.status).toBe('APPROVED'); // Auto-posted!

    // Verify Journal Entry posted between the two bank cash accounts:
    // Debit Savings (1020), Credit Checking (1010)
    expect(proposal!.debitAccountId).toBe(savingsLedgerAccId);
    expect(proposal!.creditAccountId).toBe(checkingLedgerAccId);

    await expectTrialBalanceBalanced(ledgerService, tenantId, '2026-03-31');
  });

  // =========================================================================
  // 7. REFUND TEST
  // =========================================================================
  it('should classify vendor refund, credit expense, and pass deterministic validation', async () => {
    // Inflow from AWS with REFUND in description
    const csvContent = `Date,Description,Amount
2026-03-18,AWS CLOUD SERVICES REFUND BILL-OVERCHARGE,75.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'refund_statement.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal!.proposalType).toBe('REFUND');
    expect(proposal!.confidenceScore).toBe(0.95);
    expect(proposal!.status).toBe('APPROVED');

    // Debit Operating Cash, Credit Expense
    expect(proposal!.debitAccountId).toBe(checkingLedgerAccId);

    await expectTrialBalanceBalanced(ledgerService, tenantId, '2026-03-31');
  });

  // =========================================================================
  // 8. INVOICE MATCH TEST
  // =========================================================================
  it('should accurately match customer deposit to open invoice, auto-post reconciliation, and update invoice status', async () => {
    // Deposit matching open invoice INV-2026-001 for $1,500.00
    const csvContent = `Date,Description,Amount
2026-03-20,ACME CORP PAYMENT FOR INV-2026-001,1500.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'invoice_match.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal!.proposalType).toBe('INVOICE_MATCH');
    expect(proposal!.invoiceId).toBe(openInvoiceId);
    expect(proposal!.confidenceScore).toBeGreaterThanOrEqual(0.95);
    expect(proposal!.status).toBe('APPROVED');

    // Verify invoice is marked PAID and amount due is 0
    const inv = await invoiceRepo.findInvoiceById(tenantId, openInvoiceId);
    expect(inv?.status).toBe('PAID');
    expect(inv?.amountDueCents).toBe(0n);

    // Verify ReconciledTransaction record
    const tx = result.transactions[0];
    expect(tx!.status).toBe('RECONCILED');
  });

  // =========================================================================
  // 9. UNMATCHED PAYMENT TEST
  // =========================================================================
  it('should handle payment with unknown invoice reference, creating an UNMATCHED_PAYMENT exception', async () => {
    // Deposit for $999.00 with no corresponding open invoice
    const csvContent = `Date,Description,Amount
2026-03-22,CUSTOMER WIRE DEPOSIT INV-99999,999.00`;

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'unmatched_deposit.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    // Confidence below auto-post threshold
    expect(proposal!.status).toBe('PROPOSED');

    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const unmatchedExc = exceptions.find((e) => e.exceptionType === 'UNMATCHED_PAYMENT');
    expect(unmatchedExc).toBeDefined();
  });

  // =========================================================================
  // 10. AI TIMEOUT TEST
  // =========================================================================
  it('should handle AI provider timeout gracefully, mark statement FAILED, and raise AI_TIMEOUT exception', async () => {
    const csvContent = `Date,Description,Amount
2026-03-24,Office Supplies Expense,-120.00`;

    await expect(
      bankProcessingService.processStatementUpload(
        tenantId,
        userId,
        {
          bankAccountId: operatingBankAccountId,
          fileName: 'timeout_test.csv',
          mimeType: 'text/csv',
          content: csvContent,
        },
        { simulateAiTimeout: true },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const timeoutExc = exceptions.find((e) => e.exceptionType === 'AI_TIMEOUT');
    expect(timeoutExc).toBeDefined();
    expect(timeoutExc?.severity).toBe('HIGH');
  });

  // =========================================================================
  // 11. AI FAILURE TEST
  // =========================================================================
  it('should handle AI provider 500 failure gracefully, mark statement FAILED, and raise AI_FAILURE exception', async () => {
    const csvContent = `Date,Description,Amount
2026-03-25,Marketing Advertising,-500.00`;

    await expect(
      bankProcessingService.processStatementUpload(
        tenantId,
        userId,
        {
          bankAccountId: operatingBankAccountId,
          fileName: 'failure_test.csv',
          mimeType: 'text/csv',
          content: csvContent,
        },
        { simulateAiFailure: true },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const failExc = exceptions.find((e) => e.exceptionType === 'AI_FAILURE');
    expect(failExc).toBeDefined();
    expect(failExc?.severity).toBe('HIGH');
  });

  // =========================================================================
  // 12. RETRY TEST
  // =========================================================================
  it('should allow retrying statement processing after transient failure, resolving unreconciled items', async () => {
    const csvContent = `Date,Description,Amount
2026-03-26,Software Subscription Cloud,-60.00`;

    // 1st attempt fails with simulated timeout
    await expect(
      bankProcessingService.processStatementUpload(
        tenantId,
        userId,
        {
          bankAccountId: operatingBankAccountId,
          fileName: 'retry_candidate.csv',
          mimeType: 'text/csv',
          content: csvContent,
        },
        { simulateAiTimeout: true },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    const statements = await bankProcessingService.listStatements(tenantId, operatingBankAccountId);
    const failedStatement = statements.find((s) => s.fileName === 'retry_candidate.csv');
    expect(failedStatement).toBeDefined();
    expect(failedStatement?.status).toBe('FAILED');

    // Retry processing
    const retryResult = await bankProcessingService.retryStatementProcessing(
      tenantId,
      userId,
      failedStatement!.id,
    );

    expect(retryResult.statement.retryCount).toBe(1);
    expect(retryResult.statement.status).toBe('PARSED');
  });

  // =========================================================================
  // 13. CONCURRENT PROCESSING TEST
  // =========================================================================
  it('should maintain isolation and prevent double-posting during concurrent upload attempts', async () => {
    const csvContentA = `Date,Description,Amount
2026-03-28,Consulting Revenue Batch A,3000.00`;

    const csvContentB = `Date,Description,Amount
2026-03-28,Consulting Revenue Batch B,4000.00`;

    // Concurrent upload attempts for the same bank account and period
    const results = await Promise.allSettled([
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'concurrent_a.csv',
        mimeType: 'text/csv',
        content: csvContentA,
      }),
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'concurrent_b.csv',
        mimeType: 'text/csv',
        content: csvContentB,
      }),
    ]);

    // One should succeed, the other should be rejected due to period collision
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify trial balance remains balanced
    await expectTrialBalanceBalanced(ledgerService, tenantId, '2026-03-31');
  });

  // =========================================================================
  // 14. HUMAN APPROVAL & REJECTION TEST
  // =========================================================================
  it('should support human approval and rejection workflows with complete audit trail', async () => {
    const csvContent = `Date,Description,Amount
2026-03-29,Vendor Pending Approval,-400.00`;

    const upload = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'approval_test.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = upload.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal!.status).toBe('PROPOSED');

    // Approve proposal
    const approved = await bankProcessingService.approveProposal(tenantId, userId, proposal!.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.postedJournalEntryId).toBeDefined();

    // Verify double-entry ledger is updated and balanced
    await expectTrialBalanceBalanced(ledgerService, tenantId, '2026-03-31');
  });

  it('should support human rejection of proposal and exclude transaction from ledger', async () => {
    const csvContent = `Date,Description,Amount
2026-03-30,Personal Non-Business Expense,-250.00`;

    const upload = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'reject_test.csv',
      mimeType: 'text/csv',
      content: csvContent,
    });

    const proposal = upload.proposals[0];
    expect(proposal).toBeDefined();

    // Reject proposal
    const rejected = await bankProcessingService.rejectProposal(tenantId, userId, proposal!.id, {
      reason: 'Personal expense drawn on business card - owner will reimburse outside ledger',
    });

    expect(rejected.status).toBe('REJECTED');

    // Associated bank transaction should be EXCLUDED
    const tx = await bankingRepo.findBankTransactionById(tenantId, proposal!.bankTransactionId);
    expect(tx?.status).toBe('EXCLUDED');

    // No ledger entry posted
    expect(rejected.postedJournalEntryId).toBeUndefined();
  });

  // =========================================================================
  // 15. DETERMINISTIC FINANCIAL VALIDATION GATE (PHASE 6)
  // =========================================================================
  it('should reject statement when mathematical checksum fails, mark FAILED, and route to Exception Center', async () => {
    // Mock pdfParser to return a statement with a broken checksum
    // Opening 1,000,000 + Credits 0 - Debits 5,000 = 995,000 cents
    // But closing balance is reported as 950,000 cents (diff: -45,000 cents)
    vi.spyOn(pdfParser, 'parse').mockResolvedValueOnce({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      openingBalanceCents: 1000000n,
      closingBalanceCents: 950000n, // Tampered / mismatched closing balance!
      totalDebitsCents: 5000n,
      totalCreditsCents: 0n,
      pageCount: 1,
      extractionMode: 'NATIVE_LAYOUT',
      bankDetected: 'CIMB',
      transactions: [
        {
          date: '2026-03-05',
          description: 'Payment to Vendor ABC',
          amountCents: -5000n,
          pageNumber: 1,
          sourceSequence: 1,
          runningBalanceCents: 995000n,
          rawPrimaryText: 'Payment to Vendor ABC',
        },
      ],
    });

    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'corrupted_checksum.pdf',
        mimeType: 'application/pdf',
        content: '%PDF-1.4 mock corrupted %%EOF',
      }),
    ).rejects.toThrow(ValidationError);

    // Verify statement was saved in FAILED status
    const statements = await bankProcessingService.listStatements(tenantId, operatingBankAccountId);
    const failed = statements.find((s) => s.fileName === 'corrupted_checksum.pdf');
    expect(failed).toBeDefined();
    expect(failed?.status).toBe('FAILED');
    expect(failed?.metadata?.validationIssues).toBeDefined();

    // Verify Exception Center received RECONCILIATION_EXCEPTION
    const exceptions = await bankProcessingService.listExceptions(tenantId);
    const recExc = exceptions.find(
      (e) => e.exceptionType === 'RECONCILIATION_EXCEPTION' && e.entityId === failed?.id,
    );
    expect(recExc).toBeDefined();
    expect(recExc?.severity).toBe('HIGH');
    expect(recExc?.reason).toContain('Mathematical checksum failed');

    // Critical invariant: ZERO bank transactions must be persisted
    const txs = await bankingRepo.listTransactionsByStatementId(tenantId, failed!.id);
    expect(txs.length).toBe(0);
  });
});
