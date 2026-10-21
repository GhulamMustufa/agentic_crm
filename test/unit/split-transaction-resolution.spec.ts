import { describe, it, expect, beforeEach } from 'vitest';

import { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
import { ValidationError } from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { AiStatementParser } from '../../src/modules/banking/parsers/ai-statement.parser';
import { CsvStatementParser } from '../../src/modules/banking/parsers/csv-statement.parser';
import { PdfStatementParser } from '../../src/modules/banking/parsers/pdf-statement.parser';
import { InMemoryBankingRepository } from '../../src/modules/banking/repositories/in-memory-banking.repository';
import { AiAccountantService } from '../../src/modules/banking/services/ai-accountant.service';
import { BankProcessingService } from '../../src/modules/banking/services/bank-processing.service';
import { InMemoryCounterpartyRepository } from '../../src/modules/counterparties/repositories/in-memory-counterparty.repository';
import { InMemoryInvoiceRepository } from '../../src/modules/invoices/repositories/in-memory-invoice.repository';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

describe('Split Transaction Multi-Category Allocation in Exception Center', () => {
  const tenantId = 'tenant-split-test';
  const userId = 'user-supervisor-1';

  let bankProcessingService: BankProcessingService;
  let bankingRepo: InMemoryBankingRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let ledgerService: LedgerService;
  let operatingBankAccId: string;

  beforeEach(async () => {
    bankingRepo = new InMemoryBankingRepository();
    const counterpartyRepo = new InMemoryCounterpartyRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    const auditService = new AuditService(new InMemoryAuditRepository());

    ledgerService = new LedgerService(ledgerRepo, auditService);
    const aiGateway = new AiGatewayService();
    const aiAccountantService = new AiAccountantService(aiGateway);
    const csvParser = new CsvStatementParser();
    const pdfParser = new PdfStatementParser({} as unknown as AiStatementParser);

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

    // Seed Chart of Accounts and Fiscal Calendar
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);

    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');
    expect(cashAcc).toBeDefined();

    const bankAccount = await bankProcessingService.createBankAccount(tenantId, userId, {
      ledgerAccountId: cashAcc!.id,
      accountName: 'Operating Checking Account',
      institutionName: 'Mercury Bank',
      accountType: 'CHECKING',
      currency: 'USD',
      accountNumberLast4: '5566',
    });
    operatingBankAccId = bankAccount.id;
  });

  it('should successfully split a $650.00 transaction across multiple accounts with balanced double-entry GL entry', async () => {
    // 1. Ingest a $650.00 outflow store receipt (e.g. Costco / Amazon)
    const [createdTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-split-1',
        bankAccountId: operatingBankAccId,
        pageNumber: 1,
        sourceSequence: 1,
        sourceRowIndex: 0,
        transactionDate: '2026-03-15',
        direction: 'DEBIT',
        amountCents: 65000n, // $650.00
        signedAmountCents: -65000n,
        rawDescription: 'COSTCO WHOLESALE WAREHOUSE #482',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'MEDIUM',
        transactionHash: 'hash-costco-split-1',
      },
    ]);
    expect(createdTx).toBeDefined();

    // 2. Create ambiguous accounting proposal that generated an exception
    const defaultExpenseAcc = await ledgerService.findAccountByCode(tenantId, '6020');
    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');

    const proposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: createdTx!.id,
      proposalType: 'EXPENSE_CLASSIFICATION',
      debitAccountId: defaultExpenseAcc!.id,
      creditAccountId: cashAcc!.id,
      amountCents: 65000n,
      confidenceScore: 0.65,
      evidence: [],
      rationale: 'Ambiguous multi-item warehouse receipt',
      autoPostEligible: false,
    });

    const exceptionItem = await bankingRepo.createExceptionItem({
      tenantId,
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      exceptionType: 'AMBIGUOUS_TRANSACTION',
      severity: 'MEDIUM',
      reason: 'Costco purchase requires multi-item verification',
    });

    // 3. User splits the $650 into:
    //    - $450.00 (45000 cents) -> Account 6020 (Office Supplies & Equipment)
    //    - $200.00 (20000 cents) -> Account 6010 (Software, Cloud & SaaS Subscriptions)
    const resolvedException = await bankProcessingService.resolveException(
      tenantId,
      userId,
      exceptionItem.id,
      {
        status: 'RESOLVED',
        resolutionNotes: 'Split between equipment and software licenses',
        splits: [
          { accountCode: '6020', amountCents: 45000, memo: 'Dell 4K Monitors' },
          { accountCode: '6010', amountCents: 20000, memo: 'Software Licenses' },
        ],
      },
    );

    expect(resolvedException.status).toBe('RESOLVED');

    // 4. Verify proposal is marked APPROVED with posted journal entry ID
    const updatedProposal = await bankingRepo.findProposalById(tenantId, proposal.id);
    expect(updatedProposal?.status).toBe('APPROVED');
    expect(updatedProposal?.postedJournalEntryId).toBeDefined();

    // 5. Verify bank transaction is marked RECONCILED
    const updatedTx = await bankingRepo.findBankTransactionById(tenantId, createdTx!.id);
    expect(updatedTx?.status).toBe('RECONCILED');

    // 6. Verify 3-line General Ledger Journal Entry
    const entry = await ledgerRepo.findEntryById(tenantId, updatedProposal!.postedJournalEntryId!);
    expect(entry).toBeDefined();
    expect(entry?.lines).toHaveLength(3);

    const monitorLine = entry?.lines.find((l) => l.debitCents === 45000n);
    const softwareLine = entry?.lines.find((l) => l.debitCents === 20000n);
    const cashCreditLine = entry?.lines.find((l) => l.creditCents === 65000n);

    expect(monitorLine).toBeDefined();
    expect(monitorLine?.memo).toBe('Dell 4K Monitors');

    expect(softwareLine).toBeDefined();
    expect(softwareLine?.memo).toBe('Software Licenses');

    expect(cashCreditLine).toBeDefined();

    // 7. Authoritative Mathematical Invariant Check: Sum(Debits) === Sum(Credits) === 65000n
    const sumDebits = entry?.lines.reduce((s, l) => s + l.debitCents, 0n);
    const sumCredits = entry?.lines.reduce((s, l) => s + l.creditCents, 0n);
    expect(sumDebits).toBe(65000n);
    expect(sumCredits).toBe(65000n);
  });

  it('should reject split resolution when sum of split amounts does not equal total transaction amount', async () => {
    const [createdTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-split-2',
        bankAccountId: operatingBankAccId,
        pageNumber: 1,
        sourceSequence: 2,
        sourceRowIndex: 0,
        transactionDate: '2026-03-16',
        direction: 'DEBIT',
        amountCents: 65000n, // $650.00
        signedAmountCents: -65000n,
        rawDescription: 'AMAZON.COM RETAIL',
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'MEDIUM',
        transactionHash: 'hash-amazon-split-2',
      },
    ]);
    expect(createdTx).toBeDefined();

    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');
    const expenseAcc = await ledgerService.findAccountByCode(tenantId, '6020');

    const proposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: createdTx!.id,
      proposalType: 'EXPENSE_CLASSIFICATION',
      debitAccountId: expenseAcc!.id,
      creditAccountId: cashAcc!.id,
      amountCents: 65000n,
      confidenceScore: 0.65,
      evidence: [],
      rationale: 'Ambiguous retail order',
      autoPostEligible: false,
    });

    const exceptionItem = await bankingRepo.createExceptionItem({
      tenantId,
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      exceptionType: 'AMBIGUOUS_TRANSACTION',
      severity: 'MEDIUM',
      reason: 'Amazon order needs itemized category breakdown',
    });

    // Intentionally provide unbalanced splits: $400 + $200 = $600 != $650
    await expect(
      bankProcessingService.resolveException(tenantId, userId, exceptionItem.id, {
        status: 'RESOLVED',
        splits: [
          { accountCode: '6020', amountCents: 40000 },
          { accountCode: '6010', amountCents: 20000 },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });
});
