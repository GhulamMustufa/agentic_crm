import { describe, it, expect, beforeEach } from 'vitest';

import { AiGatewayService } from '../../src/core/ai/ai-gateway.service';
import { ConflictError } from '../../src/core/errors/app-error';
import { InMemoryAuditRepository } from '../../src/modules/audit/repositories/in-memory-audit.repository';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { AiStatementParser } from '../../src/modules/banking/parsers/ai-statement.parser';
import { CsvStatementParser } from '../../src/modules/banking/parsers/csv-statement.parser';
import { ImageStatementParser } from '../../src/modules/banking/parsers/image-statement.parser';
import { PdfStatementParser } from '../../src/modules/banking/parsers/pdf-statement.parser';
import { InMemoryBankingRepository } from '../../src/modules/banking/repositories/in-memory-banking.repository';
import { AiAccountantService } from '../../src/modules/banking/services/ai-accountant.service';
import { BankProcessingService } from '../../src/modules/banking/services/bank-processing.service';
import { InMemoryCounterpartyRepository } from '../../src/modules/counterparties/repositories/in-memory-counterparty.repository';
import { InMemoryInvoiceRepository } from '../../src/modules/invoices/repositories/in-memory-invoice.repository';
import { InMemoryLedgerRepository } from '../../src/modules/ledger/repositories/in-memory-ledger.repository';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';

describe('BankProcessingService - Image Statement Ingestion & Safety Gates', () => {
  let bankProcessingService: BankProcessingService;
  let bankingRepo: InMemoryBankingRepository;
  let counterpartyRepo: InMemoryCounterpartyRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditService: AuditService;
  let ledgerService: LedgerService;
  let aiGateway: AiGatewayService;
  let imageParser: ImageStatementParser;

  const tenantId = 'tenant-img-001';
  const userId = 'user-img-001';
  let operatingBankAccountId: string;

  // Valid PNG header for tests
  const validPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

  beforeEach(async () => {
    bankingRepo = new InMemoryBankingRepository();
    counterpartyRepo = new InMemoryCounterpartyRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditService = new AuditService(new InMemoryAuditRepository());
    ledgerService = new LedgerService(ledgerRepo, auditService);

    aiGateway = new AiGatewayService();
    const aiAccountantService = new AiAccountantService(aiGateway);
    const csvParser = new CsvStatementParser();
    const pdfParser = new PdfStatementParser({} as unknown as AiStatementParser);
    imageParser = new ImageStatementParser(aiGateway);

    bankProcessingService = new BankProcessingService(
      bankingRepo,
      counterpartyRepo,
      invoiceRepo,
      ledgerService,
      auditService,
      aiAccountantService,
      csvParser,
      pdfParser,
      imageParser,
    );

    // Seed COA & Fiscal Periods
    await ledgerService.seedStandardChartOfAccounts(tenantId);
    await ledgerService.createFiscalYearAndPeriods(tenantId, 2026);

    const cashAcc = await ledgerService.findAccountByCode(tenantId, '1010');
    const opBank = await bankProcessingService.createBankAccount(tenantId, userId, {
      ledgerAccountId: cashAcc!.id,
      accountName: 'Operating Checking',
      institutionName: 'Mercury Bank',
      accountType: 'CHECKING',
      currency: 'USD',
      accountNumberLast4: '5566',
    });
    operatingBankAccountId = opBank.id;
  });

  it('1. should successfully ingest a clean bank statement image and create ledger transactions', async () => {
    const validStatementPayload = {
      isRecognizedBankStatement: true,
      isBlurryOrUnreadable: false,
      bankName: 'Mercury Bank',
      accountNumberLast4: '5566',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      openingBalance: 5000.0,
      closingBalance: 7200.0,
      transactions: [
        {
          date: '2026-10-05',
          description: 'CLIENT WIRE PAYMENT FROM ACME',
          amount: 2500.0,
        },
        {
          date: '2026-10-15',
          description: 'GITHUB INC SOFTWARE SUBSCRIPTION',
          amount: -300.0,
        },
      ],
    };

    const imageContent = Buffer.concat([
      validPngHeader,
      Buffer.from(JSON.stringify(validStatementPayload)),
    ]);

    const result = await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'mercury-october-statement.png',
      mimeType: 'image/png',
      content: imageContent,
    });

    expect(result.statement).toBeDefined();
    expect(result.statement.mimeType).toBe('image/png');
    expect(result.statement.extractionMode).toBe('AI_VISION');
    expect(result.statement.openingBalanceCents).toBe(500000n);
    expect(result.statement.closingBalanceCents).toBe(720000n);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.rawDescription).toBe('CLIENT WIRE PAYMENT FROM ACME');
  });

  it('2. should reject blurry statement images with checksum mismatch via mathematical invariant check', async () => {
    // Math discrepancy: Opening (5000) + Transactions (2500 - 300 = 2200) != Stated Closing (8000)
    const blurryUnbalancedPayload = {
      isRecognizedBankStatement: true,
      isBlurryOrUnreadable: true,
      bankName: 'Mercury Bank',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      openingBalance: 5000.0,
      closingBalance: 8000.0, // Should be 7200.0; misread due to blurriness
      transactions: [
        {
          date: '2026-10-05',
          description: 'CLIENT PAYMENT',
          amount: 2500.0,
        },
        {
          date: '2026-10-15',
          description: 'SUBSCRIPTION',
          amount: -300.0,
        },
      ],
    };

    const imageContent = Buffer.concat([
      validPngHeader,
      Buffer.from(JSON.stringify(blurryUnbalancedPayload)),
    ]);

    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'blurry-scan.png',
        mimeType: 'image/png',
        content: imageContent,
      }),
    ).rejects.toThrow('Statement mathematical validation failed');

    // Verify exception item was recorded in database
    const exceptions = await bankingRepo.listExceptionItems(tenantId);
    const balanceMismatchExc = exceptions.find(
      (e) => e.exceptionType === 'RECONCILIATION_EXCEPTION',
    );
    expect(balanceMismatchExc).toBeDefined();
    expect(balanceMismatchExc?.severity).toBe('HIGH');
    expect(balanceMismatchExc?.reason).toContain('Mathematical checksum failed');
  });

  it('3. should reject non-bank images (e.g. food photo, receipt, selfie) and record EXTRACTION_UNCERTAIN exception', async () => {
    const wrongImagePayload = {
      isRecognizedBankStatement: false,
      unrecognizedReason: 'Image appears to be a pet dog photo, not an authentic bank statement',
      isBlurryOrUnreadable: false,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      openingBalance: 0,
      closingBalance: 0,
      transactions: [],
    };

    const imageContent = Buffer.concat([
      validPngHeader,
      Buffer.from(JSON.stringify(wrongImagePayload)),
    ]);

    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'my-dog.png',
        mimeType: 'image/png',
        content: imageContent,
      }),
    ).rejects.toThrow('Image appears to be a pet dog photo');

    // Verify statement was marked FAILED and exception was registered
    const statements = await bankingRepo.listBankStatements(tenantId);
    expect(statements).toHaveLength(1);
    expect(statements[0]!.status).toBe('FAILED');

    const exceptions = await bankingRepo.listExceptionItems(tenantId);
    const extractionExc = exceptions.find((e) => e.exceptionType === 'EXTRACTION_UNCERTAIN');
    expect(extractionExc).toBeDefined();
  });

  it('4. should prevent duplicate image uploads using cryptographic SHA-256 hash collision detection', async () => {
    const validStatementPayload = {
      isRecognizedBankStatement: true,
      isBlurryOrUnreadable: false,
      bankName: 'Mercury Bank',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      openingBalance: 1000.0,
      closingBalance: 1500.0,
      transactions: [
        {
          date: '2026-10-10',
          description: 'TEST TRANSACTION',
          amount: 500.0,
        },
      ],
    };

    const imageContent = Buffer.concat([
      validPngHeader,
      Buffer.from(JSON.stringify(validStatementPayload)),
    ]);

    // 1st upload succeeds
    await bankProcessingService.processStatementUpload(tenantId, userId, {
      bankAccountId: operatingBankAccountId,
      fileName: 'first-upload.png',
      mimeType: 'image/png',
      content: imageContent,
    });

    // 2nd upload with identical bytes throws ConflictError
    await expect(
      bankProcessingService.processStatementUpload(tenantId, userId, {
        bankAccountId: operatingBankAccountId,
        fileName: 'second-upload-duplicate.png',
        mimeType: 'image/png',
        content: imageContent,
      }),
    ).rejects.toThrow(ConflictError);

    const exceptions = await bankingRepo.listExceptionItems(tenantId);
    const duplicateExc = exceptions.find((e) => e.exceptionType === 'DUPLICATE_STATEMENT');
    expect(duplicateExc).toBeDefined();
  });
});
