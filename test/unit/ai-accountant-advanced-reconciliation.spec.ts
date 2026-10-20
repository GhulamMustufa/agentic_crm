import { describe, it, expect, beforeEach } from 'vitest';

import { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
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

import type { BankAccountEntity } from '../../src/modules/banking/domain/bank-account.entity';
import type { BankTransactionEntity } from '../../src/modules/banking/domain/bank-transaction.entity';

describe('Phase B: Advanced Reconciliation Math (Gateway Net Payouts, Batches & Partial Payments)', () => {
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

  const tenantId = 'tenant-adv-recon-001';
  const userId = 'user-adv-recon-001';

  let operatingBankAcc: BankAccountEntity;
  let customerAcmeId: string;
  let customerStripeId: string;

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

    // 1. Seed Standard COA (1010, 1200, 2010, 4010, 6030, etc.)
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);

    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');

    // 2. Create Operating Bank Account
    operatingBankAcc = await bankProcessingService.createBankAccount(tenantId, userId, {
      ledgerAccountId: cashAcc!.id,
      accountName: 'Operating Checking',
      institutionName: 'Mercury Bank',
      accountType: 'CHECKING',
      currency: 'USD',
      accountNumberLast4: '8821',
    });

    // 3. Create Counterparties
    const acme = await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'Acme Corporation',
      type: 'CUSTOMER',
      paymentTermsDays: 30,
    });
    customerAcmeId = acme.id;

    const stripeCust = await counterpartyService.createCounterparty(tenantId, userId, {
      legalName: 'Direct Online Client',
      type: 'CUSTOMER',
      paymentTermsDays: 15,
    });
    customerStripeId = stripeCust.id;
  });

  it('1. Payment Gateway Net Payout: matches $970.70 deposit to $1,000.00 invoice, posts 3-line entry and marks invoice PAID', async () => {
    const revAcc = await ledgerService.findAccountByCode(tenantId, '4010');

    // Create open customer invoice for $1,000.00 (100000 cents)
    const invoice = await invoiceService.createInvoice(tenantId, {
      counterpartyId: customerStripeId,
      invoiceType: 'INVOICE',
      invoiceNumber: 'INV-STRIPE-1001',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      currency: 'USD',
      lines: [
        {
          accountId: revAcc!.id,
          description: 'SaaS Platform License',
          quantity: 1,
          unitCostCents: 100000n,
        },
      ],
    });
    await invoiceService.postInvoice(tenantId, userId, invoice.id);

    // Bank deposit arrives for $970.70 ($29.30 Stripe fee deducted)
    const depositTx: BankTransactionEntity = {
      id: 'tx-stripe-net-1',
      tenantId,
      bankStatementId: 'stmt-1',
      bankAccountId: operatingBankAcc.id,
      pageNumber: 1,
      sourceSequence: 1,
      sourceRowIndex: 0,
      transactionDate: '2026-03-15',
      direction: 'CREDIT',
      amountCents: 97070n, // $970.70
      signedAmountCents: 97070n,
      rawDescription: 'STRIPE PAYOUT TRANSFER 88129 - NET SETTLEMENT',
      extractionMethod: 'NATIVE_LAYOUT',
      extractionConfidence: 1.0,
      riskLevel: 'LOW',
      transactionHash: 'hash-stripe-net-1',
      status: 'UNRECONCILED',
      createdAt: new Date(),
    };

    const allAccounts = await ledgerService.listAccounts(tenantId);
    const openInvoices = await invoiceRepo.listInvoices(tenantId);
    const counterparties = await counterpartyRepo.list(tenantId);

    // 1. AI Accountant evaluation
    const evalResult = await aiAccountantService.evaluateTransaction(tenantId, depositTx, {
      bankAccount: operatingBankAcc,
      otherBankAccounts: [],
      counterparties,
      openInvoices,
      accounts: allAccounts,
    });

    expect(evalResult.proposalType).toBe('INVOICE_MATCH');
    expect(evalResult.suggestedInvoiceId).toBe(invoice.id);
    expect(evalResult.confidenceScore).toBeGreaterThanOrEqual(0.96);
    expect(evalResult.autoPostEligible).toBe(true);

    const gatewayEvidence = evalResult.evidence.find(
      (e) => e.source === 'PAYMENT_GATEWAY_NET_PAYOUT',
    );
    expect(gatewayEvidence).toBeDefined();
    expect(gatewayEvidence?.feeCents).toBe('2930'); // $29.30 fee
    expect(gatewayEvidence?.grossAmountCents).toBe('100000'); // $1,000.00 gross

    // 2. Ingest transaction and create proposal in repository
    const [createdTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-1',
        bankAccountId: operatingBankAcc.id,
        pageNumber: 1,
        sourceSequence: 1,
        sourceRowIndex: 0,
        transactionDate: '2026-03-15',
        direction: 'CREDIT',
        amountCents: 97070n,
        signedAmountCents: 97070n,
        rawDescription: depositTx.rawDescription,
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-stripe-net-1',
      },
    ]);
    expect(createdTx).toBeDefined();

    const proposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: createdTx!.id,
      invoiceId: evalResult.suggestedInvoiceId,
      counterpartyId: evalResult.suggestedCounterpartyId,
      proposalType: evalResult.proposalType,
      debitAccountId: evalResult.suggestedDebitAccountId,
      creditAccountId: evalResult.suggestedCreditAccountId,
      amountCents: depositTx.amountCents,
      confidenceScore: evalResult.confidenceScore,
      evidence: evalResult.evidence,
      rationale: evalResult.rationale,
      autoPostEligible: evalResult.autoPostEligible,
    });

    // 3. Approve proposal and execute deterministic gate
    const approvedProposal = await bankProcessingService.approveProposal(
      tenantId,
      userId,
      proposal.id,
    );
    expect(approvedProposal.status).toBe('APPROVED');
    expect(approvedProposal.postedJournalEntryId).toBeDefined();

    // Verify 3-line journal entry
    const entry = await ledgerRepo.findEntryById(tenantId, approvedProposal.postedJournalEntryId!);
    expect(entry).toBeDefined();
    expect(entry?.lines).toHaveLength(3);

    const debitCashLine = entry?.lines.find((l) => l.debitCents === 97070n);
    const debitFeeLine = entry?.lines.find((l) => l.debitCents === 2930n);
    const creditArLine = entry?.lines.find((l) => l.creditCents === 100000n);

    expect(debitCashLine).toBeDefined();
    expect(debitFeeLine).toBeDefined();
    expect(creditArLine).toBeDefined();

    // Verify general ledger mathematical balance: Sum(Debits) == Sum(Credits)
    const totalDebits = entry?.lines.reduce((sum, l) => sum + l.debitCents, 0n);
    const totalCredits = entry?.lines.reduce((sum, l) => sum + l.creditCents, 0n);
    expect(totalDebits).toBe(100000n);
    expect(totalCredits).toBe(100000n);

    // Verify invoice is completely settled and marked PAID
    const settledInvoice = await invoiceRepo.findInvoiceById(tenantId, invoice.id);
    expect(settledInvoice?.amountDueCents).toBe(0n);
    expect(settledInvoice?.status).toBe('PAID');
  });

  it('2. Multi-Invoice Batch Settlement: lump-sum deposit of $10,000 settles $6,000 + $4,000 invoices atomically', async () => {
    const revAcc = await ledgerService.findAccountByCode(tenantId, '4010');

    // Create Invoice 1 for Acme: $6,000.00 (600000 cents)
    const inv1 = await invoiceService.createInvoice(tenantId, {
      counterpartyId: customerAcmeId,
      invoiceType: 'INVOICE',
      invoiceNumber: 'INV-ACME-BATCH-1',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      currency: 'USD',
      lines: [
        {
          accountId: revAcc!.id,
          description: 'Phase 1 Implementation',
          quantity: 1,
          unitCostCents: 600000n,
        },
      ],
    });
    await invoiceService.postInvoice(tenantId, userId, inv1.id);

    // Create Invoice 2 for Acme: $4,000.00 (400000 cents)
    const inv2 = await invoiceService.createInvoice(tenantId, {
      counterpartyId: customerAcmeId,
      invoiceType: 'INVOICE',
      invoiceNumber: 'INV-ACME-BATCH-2',
      issueDate: '2026-03-05',
      dueDate: '2026-04-05',
      currency: 'USD',
      lines: [
        {
          accountId: revAcc!.id,
          description: 'Phase 2 Retainer',
          quantity: 1,
          unitCostCents: 400000n,
        },
      ],
    });
    await invoiceService.postInvoice(tenantId, userId, inv2.id);

    // Single lump-sum deposit arrives for $10,000.00 (1000000 cents)
    const batchDepositTx: BankTransactionEntity = {
      id: 'tx-acme-batch',
      tenantId,
      bankStatementId: 'stmt-1',
      bankAccountId: operatingBankAcc.id,
      pageNumber: 1,
      sourceSequence: 2,
      sourceRowIndex: 0,
      transactionDate: '2026-03-20',
      direction: 'CREDIT',
      amountCents: 1000000n, // $10,000.00
      signedAmountCents: 1000000n,
      rawDescription: 'WIRE TRANSFER FROM ACME CORPORATION CLIENT BATCH PMT',
      extractionMethod: 'NATIVE_LAYOUT',
      extractionConfidence: 1.0,
      riskLevel: 'LOW',
      transactionHash: 'hash-acme-batch-1',
      status: 'UNRECONCILED',
      createdAt: new Date(),
    };

    const allAccounts = await ledgerService.listAccounts(tenantId);
    const openInvoices = await invoiceRepo.listInvoices(tenantId);
    const counterparties = await counterpartyRepo.list(tenantId);

    const evalResult = await aiAccountantService.evaluateTransaction(tenantId, batchDepositTx, {
      bankAccount: operatingBankAcc,
      otherBankAccounts: [],
      counterparties,
      openInvoices,
      accounts: allAccounts,
    });

    expect(evalResult.proposalType).toBe('INVOICE_MATCH');
    expect(evalResult.confidenceScore).toBeGreaterThanOrEqual(0.96);
    expect(evalResult.autoPostEligible).toBe(true);

    const batchEvidence = evalResult.evidence.find((e) => e.source === 'BATCH_INVOICE_SETTLEMENT');
    expect(batchEvidence).toBeDefined();
    expect(batchEvidence?.batchAllocations).toHaveLength(2);

    // Ingest transaction and proposal
    const [createdTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-1',
        bankAccountId: operatingBankAcc.id,
        pageNumber: 1,
        sourceSequence: 2,
        sourceRowIndex: 0,
        transactionDate: '2026-03-20',
        direction: 'CREDIT',
        amountCents: 1000000n,
        signedAmountCents: 1000000n,
        rawDescription: batchDepositTx.rawDescription,
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-acme-batch-1',
      },
    ]);
    expect(createdTx).toBeDefined();

    const proposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: createdTx!.id,
      invoiceId: evalResult.suggestedInvoiceId,
      counterpartyId: evalResult.suggestedCounterpartyId,
      proposalType: evalResult.proposalType,
      debitAccountId: evalResult.suggestedDebitAccountId,
      creditAccountId: evalResult.suggestedCreditAccountId,
      amountCents: batchDepositTx.amountCents,
      confidenceScore: evalResult.confidenceScore,
      evidence: evalResult.evidence,
      rationale: evalResult.rationale,
      autoPostEligible: evalResult.autoPostEligible,
    });

    const approvedProposal = await bankProcessingService.approveProposal(
      tenantId,
      userId,
      proposal.id,
    );
    expect(approvedProposal.status).toBe('APPROVED');

    // Verify both invoices are now fully settled (amountDueCents === 0n, status === PAID)
    const settledInv1 = await invoiceRepo.findInvoiceById(tenantId, inv1.id);
    const settledInv2 = await invoiceRepo.findInvoiceById(tenantId, inv2.id);

    expect(settledInv1?.amountDueCents).toBe(0n);
    expect(settledInv1?.status).toBe('PAID');
    expect(settledInv2?.amountDueCents).toBe(0n);
    expect(settledInv2?.status).toBe('PAID');
  });

  it('3. Partial Payment: resolves $500.00 payment on $1,000.00 invoice and transitions status to PARTIALLY_PAID', async () => {
    const revAcc = await ledgerService.findAccountByCode(tenantId, '4010');

    // Create Invoice for $1,000.00 (100000 cents)
    const invoice = await invoiceService.createInvoice(tenantId, {
      counterpartyId: customerAcmeId,
      invoiceType: 'INVOICE',
      invoiceNumber: 'INV-ACME-PARTIAL-1',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      currency: 'USD',
      lines: [
        {
          accountId: revAcc!.id,
          description: 'Quarterly Audit Retainer',
          quantity: 1,
          unitCostCents: 100000n,
        },
      ],
    });
    await invoiceService.postInvoice(tenantId, userId, invoice.id);

    // Customer sends partial installment: $500.00 (50000 cents)
    const partialDepositTx: BankTransactionEntity = {
      id: 'tx-partial-1',
      tenantId,
      bankStatementId: 'stmt-1',
      bankAccountId: operatingBankAcc.id,
      pageNumber: 1,
      sourceSequence: 3,
      sourceRowIndex: 0,
      transactionDate: '2026-03-22',
      direction: 'CREDIT',
      amountCents: 50000n, // $500.00
      signedAmountCents: 50000n,
      rawDescription: 'DIRECT DEPOSIT FOR INV-ACME-PARTIAL-1 INSTALLMENT 1',
      extractionMethod: 'NATIVE_LAYOUT',
      extractionConfidence: 1.0,
      riskLevel: 'LOW',
      transactionHash: 'hash-partial-1',
      status: 'UNRECONCILED',
      createdAt: new Date(),
    };

    const allAccounts = await ledgerService.listAccounts(tenantId);
    const openInvoices = await invoiceRepo.listInvoices(tenantId);
    const counterparties = await counterpartyRepo.list(tenantId);

    const evalResult = await aiAccountantService.evaluateTransaction(tenantId, partialDepositTx, {
      bankAccount: operatingBankAcc,
      otherBankAccounts: [],
      counterparties,
      openInvoices,
      accounts: allAccounts,
    });

    expect(evalResult.proposalType).toBe('INVOICE_MATCH');
    expect(evalResult.suggestedInvoiceId).toBe(invoice.id);
    expect(evalResult.confidenceScore).toBe(0.96);
    expect(evalResult.autoPostEligible).toBe(true);

    const partialEvidence = evalResult.evidence.find((e) => e.source === 'PARTIAL_INVOICE_PAYMENT');
    expect(partialEvidence).toBeDefined();
    expect(partialEvidence?.remainingDueCents).toBe('50000'); // $500.00 remaining

    // Ingest transaction and proposal
    const [createdTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-1',
        bankAccountId: operatingBankAcc.id,
        pageNumber: 1,
        sourceSequence: 3,
        sourceRowIndex: 0,
        transactionDate: '2026-03-22',
        direction: 'CREDIT',
        amountCents: 50000n,
        signedAmountCents: 50000n,
        rawDescription: partialDepositTx.rawDescription,
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-partial-1',
      },
    ]);
    expect(createdTx).toBeDefined();

    const proposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: createdTx!.id,
      invoiceId: evalResult.suggestedInvoiceId,
      counterpartyId: evalResult.suggestedCounterpartyId,
      proposalType: evalResult.proposalType,
      debitAccountId: evalResult.suggestedDebitAccountId,
      creditAccountId: evalResult.suggestedCreditAccountId,
      amountCents: partialDepositTx.amountCents,
      confidenceScore: evalResult.confidenceScore,
      evidence: evalResult.evidence,
      rationale: evalResult.rationale,
      autoPostEligible: evalResult.autoPostEligible,
    });

    const approvedProposal = await bankProcessingService.approveProposal(
      tenantId,
      userId,
      proposal.id,
    );
    expect(approvedProposal.status).toBe('APPROVED');

    // Verify invoice is in PARTIALLY_PAID status with $500.00 (50000 cents) remaining due
    const partiallyPaidInvoice = await invoiceRepo.findInvoiceById(tenantId, invoice.id);
    expect(partiallyPaidInvoice?.status).toBe('PARTIALLY_PAID');
    expect(partiallyPaidInvoice?.amountDueCents).toBe(50000n);

    // 4. Verify subsequent final payment clears the remaining balance
    const finalDepositTx: BankTransactionEntity = {
      id: 'tx-partial-final',
      tenantId,
      bankStatementId: 'stmt-1',
      bankAccountId: operatingBankAcc.id,
      pageNumber: 1,
      sourceSequence: 4,
      sourceRowIndex: 0,
      transactionDate: '2026-03-28',
      direction: 'CREDIT',
      amountCents: 50000n, // $500.00
      signedAmountCents: 50000n,
      rawDescription: 'DIRECT DEPOSIT FOR INV-ACME-PARTIAL-1 FINAL PAYMENT',
      extractionMethod: 'NATIVE_LAYOUT',
      extractionConfidence: 1.0,
      riskLevel: 'LOW',
      transactionHash: 'hash-partial-final',
      status: 'UNRECONCILED',
      createdAt: new Date(),
    };

    const updatedInvoices = await invoiceRepo.listInvoices(tenantId);
    const finalEval = await aiAccountantService.evaluateTransaction(tenantId, finalDepositTx, {
      bankAccount: operatingBankAcc,
      otherBankAccounts: [],
      counterparties,
      openInvoices: updatedInvoices,
      accounts: allAccounts,
    });

    expect(finalEval.proposalType).toBe('INVOICE_MATCH');
    expect(finalEval.suggestedInvoiceId).toBe(invoice.id);
    expect(finalEval.confidenceScore).toBe(0.99); // Exact match against remaining 50000n

    const [finalTx] = await bankingRepo.createBankTransactions([
      {
        tenantId,
        bankStatementId: 'stmt-1',
        bankAccountId: operatingBankAcc.id,
        pageNumber: 1,
        sourceSequence: 4,
        sourceRowIndex: 0,
        transactionDate: '2026-03-28',
        direction: 'CREDIT',
        amountCents: 50000n,
        signedAmountCents: 50000n,
        rawDescription: finalDepositTx.rawDescription,
        extractionMethod: 'NATIVE_LAYOUT',
        extractionConfidence: 1.0,
        riskLevel: 'LOW',
        transactionHash: 'hash-partial-final',
      },
    ]);
    expect(finalTx).toBeDefined();

    const finalProposal = await bankingRepo.createProposal({
      tenantId,
      bankTransactionId: finalTx!.id,
      invoiceId: finalEval.suggestedInvoiceId,
      counterpartyId: finalEval.suggestedCounterpartyId,
      proposalType: finalEval.proposalType,
      debitAccountId: finalEval.suggestedDebitAccountId,
      creditAccountId: finalEval.suggestedCreditAccountId,
      amountCents: finalDepositTx.amountCents,
      confidenceScore: finalEval.confidenceScore,
      evidence: finalEval.evidence,
      rationale: finalEval.rationale,
      autoPostEligible: finalEval.autoPostEligible,
    });

    await bankProcessingService.approveProposal(tenantId, userId, finalProposal.id);

    // Verify invoice is now fully settled (amountDueCents === 0n, status === PAID)
    const fullyPaidInvoice = await invoiceRepo.findInvoiceById(tenantId, invoice.id);
    expect(fullyPaidInvoice?.status).toBe('PAID');
    expect(fullyPaidInvoice?.amountDueCents).toBe(0n);
  });
});
