import * as crypto from 'crypto';

import { Inject, Injectable, Optional, forwardRef, Logger } from '@nestjs/common';

import { AiAccountantService } from './ai-accountant.service';
import { StatementValidationService } from './statement-validation.service';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../core/errors/app-error';
import { OBJECT_STORAGE_TOKEN, type IObjectStorage } from '../../../core/storage/storage.service';
import { AuditService } from '../../audit/services/audit.service';
import {
  COUNTERPARTY_REPOSITORY_TOKEN,
  type ICounterpartyRepository,
} from '../../counterparties/domain/counterparty.repository.interface';
import {
  INVOICE_REPOSITORY_TOKEN,
  type IInvoiceRepository,
} from '../../invoices/domain/invoice.repository.interface';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  BANKING_REPOSITORY_TOKEN,
  type IBankingRepository,
  type CreateBankTransactionInput,
  type CreateProposalInput,
  type CreateExceptionInput,
} from '../domain/banking.repository.interface';
import {
  createBankAccountSchema,
  uploadStatementSchema,
  correctProposalSchema,
  rejectProposalSchema,
  resolveExceptionSchema,
  batchResolveExceptionsSchema,
} from '../dto/banking.dto';
import { CsvStatementParser } from '../parsers/csv-statement.parser';
import { PdfStatementParser, MalformedPdfError } from '../parsers/pdf-statement.parser';

import type { AiClassificationResult } from './ai-accountant.service';
import type { BankAccountEntity } from '../domain/bank-account.entity';
import type { BankStatementEntity, BankStatementStatus } from '../domain/bank-statement.entity';
import type {
  BankTransactionEntity,
  BankTransactionStatus,
} from '../domain/bank-transaction.entity';
import type { ExceptionItemEntity } from '../domain/exception-item.entity';
import type { ProposalEntity } from '../domain/proposal.entity';
import type {
  CreateBankAccountInput,
  UploadStatementInput,
  CorrectProposalInput,
  RejectProposalInput,
  ResolveExceptionInput,
  BatchResolveExceptionsInput,
} from '../dto/banking.dto';

export function computeSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computeTransactionHash(
  tenantId: string,
  bankAccountId: string,
  date: string,
  amountCents: bigint,
  description: string,
  sourceSequence?: number,
): string {
  const seqPart = sourceSequence !== undefined ? `:${sourceSequence}` : '';
  const payload = `${tenantId}:${bankAccountId}:${date}:${amountCents.toString()}:${description.trim()}${seqPart}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class BankProcessingService {
  private readonly validationService: StatementValidationService;

  constructor(
    @Inject(BANKING_REPOSITORY_TOKEN)
    private readonly bankingRepo: IBankingRepository,
    @Inject(COUNTERPARTY_REPOSITORY_TOKEN)
    private readonly counterpartyRepo: ICounterpartyRepository,
    @Inject(INVOICE_REPOSITORY_TOKEN)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(forwardRef(() => LedgerService))
    private readonly ledgerService: LedgerService,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => AiAccountantService))
    private readonly aiAccountant: AiAccountantService,
    @Inject(forwardRef(() => CsvStatementParser))
    private readonly csvParser: CsvStatementParser,
    @Inject(forwardRef(() => PdfStatementParser))
    private readonly pdfParser: PdfStatementParser,
    @Optional()
    @Inject(forwardRef(() => StatementValidationService))
    validationService?: StatementValidationService,
    @Optional()
    @Inject(OBJECT_STORAGE_TOKEN)
    private readonly storage?: IObjectStorage,
  ) {
    this.validationService = validationService ?? new StatementValidationService();
  }

  private readonly logger = new Logger(BankProcessingService.name);
  private readonly processingLocks = new Set<string>();

  // --- Bank Account Management ---
  async createBankAccount(
    tenantId: string,
    userId: string,
    rawDto: CreateBankAccountInput,
  ): Promise<BankAccountEntity> {
    const parseResult = createBankAccountSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Bank Account validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // Verify linked ledger account exists
    const ledgerAcc = await this.ledgerService.getAccountById(tenantId, dto.ledgerAccountId);
    if (!ledgerAcc) {
      throw new NotFoundError('Chart of Accounts item', dto.ledgerAccountId);
    }

    const account = await this.bankingRepo.createBankAccount({
      tenantId,
      ledgerAccountId: dto.ledgerAccountId,
      accountName: dto.accountName,
      institutionName: dto.institutionName,
      accountType: dto.accountType,
      currency: dto.currency,
      accountNumberLast4: dto.accountNumberLast4,
    });

    await this.auditService.recordEvent({
      tenantId,
      action: 'BANK_ACCOUNT_CREATED',
      entityType: 'BANK_ACCOUNT',
      entityId: account.id,
      actorType: 'USER',
      actorId: userId,
      newState: {
        accountName: account.accountName,
        institutionName: account.institutionName,
        accountNumberLast4: account.accountNumberLast4,
      },
    });

    return account;
  }

  async listBankAccounts(tenantId: string): Promise<BankAccountEntity[]> {
    return this.bankingRepo.listBankAccounts(tenantId);
  }

  async getBankAccountById(tenantId: string, id: string): Promise<BankAccountEntity | null> {
    return this.bankingRepo.findBankAccountById(tenantId, id);
  }

  // --- Bank Statement Ingestion & Pipeline Orchestration ---
  async processStatementUpload(
    tenantId: string,
    userId: string,
    rawDto: UploadStatementInput,
    options?: {
      simulateAiTimeout?: boolean;
      simulateAiFailure?: boolean;
      onProgress?: (progress: {
        stage: string;
        percent: number;
        message: string;
        step: number;
      }) => Promise<void> | void;
    },
  ): Promise<{
    statement: BankStatementEntity;
    transactions: BankTransactionEntity[];
    proposals: ProposalEntity[];
    exceptions: ExceptionItemEntity[];
  }> {
    const parseResult = uploadStatementSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Statement upload validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // 1. Validate Bank Account (if provided)
    let bankAccount: BankAccountEntity | null = null;
    if (dto.bankAccountId) {
      bankAccount = await this.bankingRepo.findBankAccountById(tenantId, dto.bankAccountId);
      if (!bankAccount) {
        throw new NotFoundError('Bank Account', dto.bankAccountId);
      }
    }

    const lockKey = `${tenantId}:${dto.bankAccountId || 'unassigned'}`;
    if (this.processingLocks.has(lockKey)) {
      throw new ConflictError(
        `Concurrent statement processing already in progress for bank account ${bankAccount?.accountName || 'unassigned'}`,
      );
    }
    this.processingLocks.add(lockKey);

    try {
      await options?.onProgress?.({
        stage: 'EXTRACTING',
        percent: 25,
        message: 'Extracting document text and layout...',
        step: 1,
      });

      // 2. Compute File SHA-256 for exact statement duplicate detection
      const fileSha256 = computeSha256(dto.content);
      const existingByHash = await this.bankingRepo.findBankStatementByHash(tenantId, fileSha256);
      if (existingByHash) {
        const isStaleProcessing =
          existingByHash.status === 'PROCESSING' &&
          Date.now() - new Date(existingByHash.createdAt).getTime() > 2 * 60 * 1000;
        if (existingByHash.status === 'FAILED' || isStaleProcessing) {
          // Delete the previously failed or stale statement to allow a clean retry without unique constraint collision
          await this.bankingRepo.deleteBankStatement(tenantId, existingByHash.id);
        } else {
          // Flag Duplicate Statement Exception
          const exception = await this.bankingRepo.createExceptionItem({
            tenantId,
            entityType: 'STATEMENT',
            entityId: existingByHash.id,
            exceptionType: 'DUPLICATE_STATEMENT',
            severity: 'HIGH',
            reason: `Bank statement with identical cryptographic hash (${fileSha256}) was previously uploaded on ${existingByHash.createdAt.toISOString()}`,
            evidence: [{ fileSha256, previousStatementId: existingByHash.id }],
          });
          throw new ConflictError(
            `Duplicate statement rejected: file matches existing statement ${existingByHash.id} (Exception: ${exception.id})`,
          );
        }
      }

      // 3. Document Extraction (CSV or PDF)
      let parsedData;
      try {
        if (dto.mimeType === 'text/csv') {
          parsedData = await this.csvParser.parse(dto.content);
        } else {
          parsedData = await this.pdfParser.parse(dto.content);
        }
      } catch (err) {
        // Create temporary statement record in FAILED state for auditing
        const failedStatement = await this.bankingRepo.createBankStatement({
          tenantId,
          bankAccountId: bankAccount?.id || null,
          fileName: dto.fileName,
          fileSha256,
          mimeType: dto.mimeType,
          statementStartDate: new Date(Date.now() - 5000).toISOString(),
          statementEndDate: new Date().toISOString(),
          openingBalanceCents: 0n,
          closingBalanceCents: 0n,
          totalDebitsCents: 0n,
          totalCreditsCents: 0n,
          status: 'FAILED',
        });

        const excType = err instanceof MalformedPdfError ? 'MALFORMED_PDF' : 'MISSING_FIELDS';
        const reason = err instanceof Error ? err.message : 'Unknown parsing failure';

        const exc = await this.bankingRepo.createExceptionItem({
          tenantId,
          entityType: 'STATEMENT',
          entityId: failedStatement.id,
          exceptionType: excType,
          severity: 'HIGH',
          reason: `Failed to extract bank statement: ${reason}`,
        });

        await this.bankingRepo.updateBankStatementStatus(
          tenantId,
          failedStatement.id,
          'FAILED',
          reason,
        );

        throw new ValidationError(
          `Statement processing failed (${excType}): ${reason} [Exception ${exc.id}]`,
        );
      }

      // 3.25 Deterministic Financial Validation Engine (Phase 6)
      await options?.onProgress?.({
        stage: 'VALIDATING',
        percent: 50,
        message: 'Verifying mathematical checksums and running balances...',
        step: 2,
      });

      const validation = this.validationService.validate(parsedData);
      if (!validation.isValid) {
        const failedStatement = await this.bankingRepo.createBankStatement({
          tenantId,
          bankAccountId: bankAccount?.id || null,
          fileName: dto.fileName,
          fileSha256,
          mimeType: dto.mimeType,
          statementStartDate: parsedData.startDate || new Date().toISOString(),
          statementEndDate: parsedData.endDate || new Date().toISOString(),
          openingBalanceCents: parsedData.openingBalanceCents,
          closingBalanceCents: parsedData.closingBalanceCents,
          totalDebitsCents: parsedData.totalDebitsCents,
          totalCreditsCents: parsedData.totalCreditsCents,
          pageCount: parsedData.pageCount || 1,
          extractionMode: parsedData.extractionMode || 'NATIVE_TEXT',
          bankDetected: parsedData.bankDetected || dto.manualBankName,
          formatDetected: parsedData.formatDetected,
          parserVersion: parsedData.parserVersion || '2.0.0',
          metadata: {
            ...parsedData.metadata,
            validationIssues: validation.issues,
            validationAudit: validation.auditEvidence,
          },
          status: 'FAILED',
        });

        const exc = await this.bankingRepo.createExceptionItem({
          tenantId,
          entityType: 'STATEMENT',
          entityId: failedStatement.id,
          exceptionType: 'RECONCILIATION_EXCEPTION',
          severity: 'HIGH',
          reason: `Financial reconciliation validation failed: ${validation.failureSummary}`,
          evidence: [validation.auditEvidence, ...validation.issues],
        });

        await this.bankingRepo.updateBankStatementStatus(
          tenantId,
          failedStatement.id,
          'FAILED',
          validation.failureSummary || 'Financial checksum mismatch',
        );

        await this.auditService.recordEvent({
          tenantId,
          action: 'STATEMENT_RECONCILIATION_FAILED',
          entityType: 'STATEMENT',
          entityId: failedStatement.id,
          actorType: 'SYSTEM',
          actorId: userId,
          newState: {
            reason: validation.failureSummary,
            checksumDiscrepancyCents: validation.checksumDiscrepancyCents.toString(),
            exceptionId: exc.id,
          },
        });

        throw new ValidationError(
          `Statement mathematical validation failed: ${validation.failureSummary} [Exception ${exc.id}]`,
        );
      }

      // 3.5 Auto-provision Bank Account if missing
      if (!bankAccount) {
        const targetBankName = dto.manualBankName || parsedData.bankName;
        const targetAcctLast4 = dto.manualAccountNumberLast4 || parsedData.accountNumberLast4;
        const targetAcctType = dto.manualAccountType || parsedData.accountType || 'CHECKING';

        if (targetBankName && targetAcctLast4) {
          const accounts = await this.listBankAccounts(tenantId);
          bankAccount = accounts.find((a) => a.accountNumberLast4 === targetAcctLast4) || null;

          if (!bankAccount) {
            // Auto-create
            const ledgerRes = await this.ledgerService.listAccounts(tenantId);
            const cashAccount =
              ledgerRes.find((a) => a.accountCode === '1010' || a.subClassification === 'CASH') ||
              ledgerRes[0];
            if (cashAccount) {
              const baseCurrency = await this.ledgerService.getTenantBaseCurrency(tenantId);
              const isMalaysianBank =
                targetBankName.toLowerCase().includes('maybank') ||
                targetBankName.toLowerCase().includes('cimb') ||
                targetBankName.toLowerCase().includes('rhb') ||
                targetBankName.toLowerCase().includes('public bank') ||
                targetBankName.toLowerCase().includes('hong leong') ||
                targetBankName.toLowerCase().includes('ambank') ||
                targetBankName.toLowerCase().includes('islam');
              const detectedCurrency =
                (parsedData.metadata?.currency as string) ||
                (isMalaysianBank ? 'MYR' : undefined) ||
                baseCurrency ||
                'MYR';

              bankAccount = await this.createBankAccount(tenantId, userId, {
                ledgerAccountId: cashAccount.id,
                accountName: `${targetBankName} ${targetAcctType}`,
                institutionName: targetBankName,
                accountType: targetAcctType as 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD',
                currency: detectedCurrency,
                accountNumberLast4: targetAcctLast4,
              });
            }
          }
        }
      }

      // 4. Period Collision Detection
      if (bankAccount) {
        const existingByPeriod = await this.bankingRepo.findBankStatementByPeriod(
          tenantId,
          bankAccount.id,
          parsedData.startDate,
          parsedData.endDate,
        );
        if (existingByPeriod) {
          const isStaleProcessing =
            existingByPeriod.status === 'PROCESSING' &&
            Date.now() - new Date(existingByPeriod.createdAt).getTime() > 2 * 60 * 1000;
          if (existingByPeriod.status === 'FAILED' || isStaleProcessing) {
            await this.bankingRepo.deleteBankStatement(tenantId, existingByPeriod.id);
          } else {
            const exc = await this.bankingRepo.createExceptionItem({
              tenantId,
              entityType: 'STATEMENT',
              entityId: existingByPeriod.id,
              exceptionType: 'DUPLICATE_STATEMENT',
              severity: 'HIGH',
              reason: `Statement covering period ${parsedData.startDate} to ${parsedData.endDate} already exists for bank account ${bankAccount.accountName}`,
            });
            throw new ConflictError(
              `Statement period (${parsedData.startDate} to ${parsedData.endDate}) already uploaded for this account. Exception: ${exc.id}`,
            );
          }
        }
      }

      // 5. Create Bank Statement in PROCESSING state (or NEEDS_REVIEW if no bank account)
      const statementStatus = bankAccount ? 'PROCESSING' : 'NEEDS_REVIEW';
      const statement = await this.bankingRepo.createBankStatement({
        tenantId,
        bankAccountId: bankAccount?.id || null,
        fileName: dto.fileName,
        fileSha256,
        mimeType: dto.mimeType,
        statementStartDate: parsedData.startDate,
        statementEndDate: parsedData.endDate,
        openingBalanceCents: parsedData.openingBalanceCents,
        closingBalanceCents: parsedData.closingBalanceCents,
        totalDebitsCents: parsedData.totalDebitsCents,
        totalCreditsCents: parsedData.totalCreditsCents,
        pageCount: parsedData.pageCount || 1,
        extractionMode:
          parsedData.extractionMode || (dto.mimeType === 'text/csv' ? 'CSV' : 'NATIVE_TEXT'),
        bankDetected: parsedData.bankDetected || dto.manualBankName,
        formatDetected: parsedData.formatDetected,
        parserVersion: parsedData.parserVersion || '2.0.0',
        metadata: {
          ...parsedData.metadata,
          validation: validation.auditEvidence,
        },
        status: statementStatus,
      });

      if (!bankAccount) {
        await this.bankingRepo.createExceptionItem({
          tenantId,
          entityType: 'STATEMENT',
          entityId: statement.id,
          exceptionType: 'UNASSIGNED_STATEMENT',
          severity: 'HIGH',
          reason:
            'Could not automatically determine the bank account for this statement. Please review and assign manually.',
        });
        // We stop here if it needs review. The transactions are not extracted into the ledger yet.
        return {
          statement,
          transactions: [],
          proposals: [],
          exceptions: [],
        };
      }

      // Archive raw document to Object Storage (Neon S3)
      if (this.storage) {
        const ext = dto.mimeType === 'text/csv' ? 'csv' : 'pdf';
        const storageKey = `${tenantId}/statements/${fileSha256}.${ext}`;
        const fileBuffer =
          dto.mimeType === 'text/csv'
            ? Buffer.from(dto.content, 'utf-8')
            : Buffer.from(dto.content, 'base64');

        await this.storage
          .putObject(storageKey, fileBuffer, {
            contentType: dto.mimeType,
            metadata: {
              tenantId,
              fileName: dto.fileName,
              statementId: statement.id,
              bankAccountId: bankAccount.id,
            },
          })
          .catch((err: Error) => {
            this.auditService
              .recordEvent({
                tenantId,
                action: 'STORAGE_ARCHIVE_FAILED',
                entityType: 'STATEMENT',
                entityId: statement.id,
                actorType: 'SYSTEM',
                actorId: userId,
                newState: { error: err.message, storageKey },
              })
              .catch(() => {});
          });
      }

      await this.auditService.recordEvent({
        tenantId,
        action: 'STATEMENT_UPLOADED',
        entityType: 'STATEMENT',
        entityId: statement.id,
        actorType: 'USER',
        actorId: userId,
        newState: {
          fileName: statement.fileName,
          fileSha256,
          lineCount: parsedData.transactions.length,
        },
      });

      // 6. Process Transactions & Duplicate Line Detection
      const activeBankAccount = bankAccount;
      const validLinesToPersist: Array<CreateBankTransactionInput> = [];
      const generatedExceptions: ExceptionItemEntity[] = [];
      const seenHashesInBatch = new Set<string>();

      const computedHashes = parsedData.transactions.map((line) => {
        return computeTransactionHash(
          tenantId,
          activeBankAccount.id,
          line.date,
          line.amountCents,
          line.description,
          line.sourceSequence,
        );
      });

      const existingTxMap = this.bankingRepo.findBankTransactionsByHashes
        ? await this.bankingRepo.findBankTransactionsByHashes(
            tenantId,
            activeBankAccount.id,
            computedHashes,
          )
        : new Map<string, BankTransactionEntity>();

      const duplicateExceptionInputs: CreateExceptionInput[] = [];

      for (let idx = 0; idx < parsedData.transactions.length; idx++) {
        const line = parsedData.transactions[idx]!;
        const sourceSequence = line.sourceSequence !== undefined ? line.sourceSequence : idx + 1;
        const pageNumber = line.pageNumber !== undefined ? line.pageNumber : 1;
        const txHash = computedHashes[idx]!;

        const existingTx =
          existingTxMap.get(txHash) ??
          (!this.bankingRepo.findBankTransactionsByHashes
            ? await this.bankingRepo.findBankTransactionByHash(tenantId, bankAccount.id, txHash)
            : null);

        if (existingTx || seenHashesInBatch.has(txHash)) {
          duplicateExceptionInputs.push({
            tenantId,
            entityType: 'BANK_TRANSACTION',
            entityId: existingTx?.id || statement.id,
            exceptionType: 'DUPLICATE_TRANSACTION',
            severity: 'MEDIUM',
            reason: `Transaction line duplicate: '${line.description}' on ${line.date} for $${Number(line.amountCents) / 100} already recorded`,
            evidence: [{ transactionHash: txHash, existingTxId: existingTx?.id }],
          });
          continue;
        }
        seenHashesInBatch.add(txHash);

        validLinesToPersist.push({
          tenantId,
          bankStatementId: statement.id,
          bankAccountId: bankAccount.id,
          pageNumber,
          sourceSequence,
          sourceRowIndex: line.sourceRowIndex ?? idx,
          transactionDate: line.date,
          valueDate: line.valueDate,
          direction: line.direction || (line.amountCents < 0n ? 'DEBIT' : 'CREDIT'),
          amountCents: line.amountCents,
          signedAmountCents: line.amountCents,
          runningBalanceCents: line.runningBalanceCents,
          rawDescription: line.description,
          rawPrimaryText: line.rawPrimaryText || line.description,
          rawContinuationText: line.rawContinuationText,
          rawReferenceText: line.rawReferenceText,
          bankReference: line.bankReference,
          counterpartyAccount: line.counterpartyAccount,
          normalizedPayee: undefined,
          referenceNumber: line.referenceNumber,
          extractionMethod:
            line.extractionMethod || (dto.mimeType === 'text/csv' ? 'CSV' : 'NATIVE_LAYOUT'),
          extractionConfidence: line.extractionConfidence ?? 1.0,
          riskLevel: line.riskLevel || 'LOW',
          sourceEvidence: line.sourceEvidence,
          transactionHash: txHash,
        });
      }

      if (duplicateExceptionInputs.length > 0) {
        if (this.bankingRepo.createExceptionItems) {
          const createdDupExceptions =
            await this.bankingRepo.createExceptionItems(duplicateExceptionInputs);
          generatedExceptions.push(...createdDupExceptions);
        } else {
          for (const excInput of duplicateExceptionInputs) {
            const exc = await this.bankingRepo.createExceptionItem(excInput);
            generatedExceptions.push(exc);
          }
        }
      }

      const persistedTransactions =
        await this.bankingRepo.createBankTransactions(validLinesToPersist);

      // 7. Load Tenant Knowledge Base for AI Evaluation
      const allBankAccounts = await this.bankingRepo.listBankAccounts(tenantId);
      const counterparties = await this.counterpartyRepo.list(tenantId);
      const openInvoices = await this.invoiceRepo.listInvoices(tenantId);
      const accounts = await this.ledgerService.listAccounts(tenantId);

      const generatedProposals: ProposalEntity[] = [];

      // 8. Classification, Entity Matching & Journal Proposals
      await options?.onProgress?.({
        stage: 'CATEGORIZING',
        percent: 75,
        message: 'Auto-categorizing payees and generating journal proposals...',
        step: 3,
      });

      try {
        const evalResults: AiClassificationResult[] = [];
        const proposalInputs: CreateProposalInput[] = [];

        for (let idx = 0; idx < persistedTransactions.length; idx++) {
          const tx = persistedTransactions[idx]!;

          if ((idx + 1) % 500 === 0 || idx === persistedTransactions.length - 1) {
            const percent = Math.min(
              93,
              75 + Math.round(((idx + 1) / persistedTransactions.length) * 18),
            );
            await options?.onProgress?.({
              stage: 'CATEGORIZING',
              percent,
              message: `Categorizing payees and generating proposals (${(idx + 1).toLocaleString()} / ${persistedTransactions.length.toLocaleString()})...`,
              step: 3,
            });
          }

          const evalResult = await this.aiAccountant.evaluateTransaction(
            tenantId,
            tx,
            {
              bankAccount,
              otherBankAccounts: allBankAccounts,
              counterparties,
              openInvoices: openInvoices.filter(
                (i) => i.status === 'POSTED' || i.status === 'PARTIALLY_PAID',
              ),
              accounts,
            },
            options,
          );
          evalResults.push(evalResult);

          const absAmount = tx.amountCents >= 0n ? tx.amountCents : -tx.amountCents;
          proposalInputs.push({
            tenantId,
            bankTransactionId: tx.id,
            invoiceId: evalResult.suggestedInvoiceId,
            counterpartyId: evalResult.suggestedCounterpartyId,
            proposalType: evalResult.proposalType,
            debitAccountId: evalResult.suggestedDebitAccountId,
            creditAccountId: evalResult.suggestedCreditAccountId,
            amountCents: absAmount,
            confidenceScore: evalResult.confidenceScore,
            evidence: evalResult.evidence,
            rationale: evalResult.rationale,
            autoPostEligible: evalResult.autoPostEligible,
          });
        }

        if (proposalInputs.length > 0) {
          await options?.onProgress?.({
            stage: 'CATEGORIZING',
            percent: 94,
            message: `Saving ${proposalInputs.length.toLocaleString()} proposals to staging...`,
            step: 3,
          });
        }

        let createdProposals: ProposalEntity[] = [];
        if (this.bankingRepo.createProposals) {
          createdProposals = await this.bankingRepo.createProposals(proposalInputs);
        } else {
          for (const input of proposalInputs) {
            createdProposals.push(await this.bankingRepo.createProposal(input));
          }
        }

        // 9. Deterministic 6-Stage Gate for Autonomous Posting & Exception Handling
        const proposedTxIds: string[] = [];
        const exceptionInputs: CreateExceptionInput[] = [];
        const txCurrency = bankAccount.currency || 'MYR';

        for (let i = 0; i < createdProposals.length; i++) {
          let proposal = createdProposals[i]!;
          const tx = persistedTransactions[i]!;
          const evalResult = evalResults[i]!;

          let passedGate = false;
          if (
            proposal.autoPostEligible &&
            proposal.confidenceScore >= 0.95 &&
            !evalResult.isAmbiguous
          ) {
            try {
              await this.executeDeterministicGateAndPost(tenantId, userId, proposal, tx);
              passedGate = true;
              const reloaded = await this.bankingRepo.findProposalById(tenantId, proposal.id);
              if (reloaded) {
                proposal = reloaded;
              }
            } catch {
              passedGate = false;
            }
          }

          if (!passedGate) {
            proposedTxIds.push(tx.id);
            const excType = evalResult.isAmbiguous
              ? 'AMBIGUOUS_TRANSACTION'
              : evalResult.proposalType === 'INVOICE_MATCH'
                ? 'UNMATCHED_PAYMENT'
                : 'EXTRACTION_UNCERTAIN';

            exceptionInputs.push({
              tenantId,
              entityType: 'PROPOSAL',
              entityId: proposal.id,
              exceptionType: excType,
              severity: evalResult.confidenceScore < 0.6 ? 'HIGH' : 'MEDIUM',
              reason: `${evalResult.rationale} (Confidence: ${Math.round(evalResult.confidenceScore * 100)}%)`,
              evidence: [
                ...evalResult.evidence,
                {
                  source: 'TRANSACTION_CONTEXT',
                  reason: `Transaction amount: ${tx.amountCents.toString()}, currency: ${txCurrency}`,
                  amountCents: tx.amountCents.toString(),
                  signedAmountCents: tx.signedAmountCents.toString(),
                  currency: txCurrency,
                  transactionDate: tx.transactionDate,
                  bankAccountId: bankAccount.id,
                },
              ],
              proposedResolution: {
                proposalId: proposal.id,
                amountCents: tx.amountCents.toString(),
                signedAmountCents: tx.signedAmountCents.toString(),
                currency: txCurrency,
                transactionDate: tx.transactionDate,
                suggestedDebitAccountId: evalResult.suggestedDebitAccountId,
                suggestedCreditAccountId: evalResult.suggestedCreditAccountId,
              },
            });
          }

          generatedProposals.push(proposal);
        }

        // Batch update transaction status to PROPOSED
        if (proposedTxIds.length > 0) {
          if (this.bankingRepo.updateTransactionStatuses) {
            await this.bankingRepo.updateTransactionStatuses(tenantId, proposedTxIds, 'PROPOSED');
          } else {
            for (const txId of proposedTxIds) {
              await this.bankingRepo.updateTransactionStatus(tenantId, txId, 'PROPOSED');
            }
          }
        }

        // Batch persist exception items
        if (exceptionInputs.length > 0) {
          if (this.bankingRepo.createExceptionItems) {
            const createdExceptions = await this.bankingRepo.createExceptionItems(exceptionInputs);
            generatedExceptions.push(...createdExceptions);
          } else {
            for (const excInput of exceptionInputs) {
              const exc = await this.bankingRepo.createExceptionItem(excInput);
              generatedExceptions.push(exc);
            }
          }
        }
      } catch (aiErr) {
        // AI Failure / Timeout Recovery
        const errorMsg = aiErr instanceof Error ? aiErr.message : 'AI Processing Error';
        const isTimeout = errorMsg.includes('timed out');
        const excType = isTimeout ? 'AI_TIMEOUT' : 'AI_FAILURE';

        const exc = await this.bankingRepo.createExceptionItem({
          tenantId,
          entityType: 'STATEMENT',
          entityId: statement.id,
          exceptionType: excType,
          severity: 'HIGH',
          reason: `AI Accountant pipeline failed: ${errorMsg}`,
        });
        generatedExceptions.push(exc);

        await this.bankingRepo.updateBankStatementStatus(
          tenantId,
          statement.id,
          'FAILED',
          errorMsg,
        );

        throw new UnprocessableEntityError(
          `AI processing failed (${excType}): ${errorMsg}. Statement marked FAILED. [Exception ${exc.id}]`,
        );
      }

      // 10. Update Statement status
      await options?.onProgress?.({
        stage: 'RECONCILING',
        percent: 95,
        message: 'Finalizing ledger reconciliation and balance verification...',
        step: 4,
      });

      const refreshedTransactions = await this.bankingRepo.listTransactionsByStatementId(
        tenantId,
        statement.id,
      );
      const allReconciled =
        refreshedTransactions.length > 0 &&
        refreshedTransactions.every((t) => t.status === 'RECONCILED');
      const finalStatus: BankStatementStatus = allReconciled ? 'RECONCILED' : 'PARSED';
      const updatedStatement = await this.bankingRepo.updateBankStatementStatus(
        tenantId,
        statement.id,
        finalStatus,
      );

      await this.auditService.recordEvent({
        tenantId,
        action: 'STATEMENT_PARSED',
        entityType: 'STATEMENT',
        entityId: statement.id,
        actorType: 'SYSTEM',
        actorId: 'AI_ACCOUNTANT',
        newState: {
          status: finalStatus,
          proposalsCount: generatedProposals.length,
          exceptionsCount: generatedExceptions.length,
        },
      });

      return {
        statement: updatedStatement,
        transactions: refreshedTransactions,
        proposals: generatedProposals,
        exceptions: generatedExceptions,
      };
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }

  // --- Deterministic 6-Stage Gate & Posting ---
  private async executeDeterministicGateAndPost(
    tenantId: string,
    userId: string,
    proposal: ProposalEntity,
    transaction: BankTransactionEntity,
  ): Promise<void> {
    // Stage 1: Active Accounts Validation in COA
    const debitAcc = await this.ledgerService.getAccountById(tenantId, proposal.debitAccountId);
    const creditAcc = await this.ledgerService.getAccountById(tenantId, proposal.creditAccountId);
    if (!debitAcc || !creditAcc || !debitAcc.isActive || !creditAcc.isActive) {
      throw new UnprocessableEntityError(
        'Gate Failed: Debit or Credit account is inactive or not found',
      );
    }

    // Stage 2: Accounting Period Verification
    const period = await this.ledgerService.getPeriodByDate(tenantId, transaction.transactionDate);
    if (!period || period.status !== 'OPEN') {
      throw new UnprocessableEntityError('Gate Failed: Accounting period is closed or missing');
    }

    // Stage 3: Double-Entry Math Invariant Check
    if (proposal.amountCents <= 0n) {
      throw new UnprocessableEntityError('Gate Failed: Proposal amount must be positive');
    }

    // Stage 4: Post to Authoritative General Ledger
    const entry = await this.ledgerService.postJournalEntry(tenantId, userId, {
      entryDate: transaction.transactionDate,
      description: `Reconciliation: ${transaction.rawDescription} (Ref: ${transaction.referenceNumber || 'N/A'})`,
      sourceType: 'BANK_RECONCILIATION',
      sourceId: transaction.id,
      lines: [
        {
          accountId: proposal.debitAccountId,
          debitCents: proposal.amountCents,
          creditCents: 0n,
          memo: `Debit: ${debitAcc.name}`,
        },
        {
          accountId: proposal.creditAccountId,
          debitCents: 0n,
          creditCents: proposal.amountCents,
          memo: `Credit: ${creditAcc.name}`,
        },
      ],
    });

    // Stage 5: If Invoice Matched, settle invoice amount due
    if (proposal.invoiceId) {
      const inv = await this.invoiceRepo.findInvoiceById(tenantId, proposal.invoiceId);
      if (inv) {
        const newDue =
          inv.amountDueCents > proposal.amountCents
            ? inv.amountDueCents - proposal.amountCents
            : 0n;
        await this.invoiceRepo.updateInvoiceAmountDue(tenantId, inv.id, newDue);
        await this.invoiceRepo.updateInvoiceStatus(
          tenantId,
          inv.id,
          newDue === 0n ? 'PAID' : 'PARTIALLY_PAID',
        );
      }
    }

    // Stage 6: Mark Reconciled Proof Record
    await this.bankingRepo.createReconciledTransaction({
      tenantId,
      bankTransactionId: transaction.id,
      journalEntryId: entry.id,
      reconciliationMethod: 'AUTO_HIGH_CONFIDENCE',
      confidenceScore: proposal.confidenceScore,
      reconciledByUserId: userId,
    });

    await this.bankingRepo.updateTransactionStatus(tenantId, transaction.id, 'RECONCILED');
    await this.bankingRepo.updateProposalStatus(tenantId, proposal.id, 'APPROVED', {
      postedJournalEntryId: entry.id,
      userId,
    });
  }

  // --- Human Approval & Correction Actions ---
  async approveProposal(
    tenantId: string,
    userId: string,
    proposalId: string,
  ): Promise<ProposalEntity> {
    const proposal = await this.bankingRepo.findProposalById(tenantId, proposalId);
    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }
    if (proposal.status !== 'PROPOSED') {
      throw new UnprocessableEntityError(`Cannot approve proposal in status '${proposal.status}'`);
    }

    const tx = await this.bankingRepo.findBankTransactionById(tenantId, proposal.bankTransactionId);
    if (!tx) {
      throw new NotFoundError('Bank Transaction', proposal.bankTransactionId);
    }

    // 6-Stage Gate Execution
    await this.executeDeterministicGateAndPost(tenantId, userId, proposal, tx);

    await this.auditService.recordEvent({
      tenantId,
      action: 'PROPOSAL_APPROVED',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      actorType: 'USER',
      actorId: userId,
      newState: {
        status: 'APPROVED',
        reconciledTransactionId: tx.id,
      },
    });

    return (await this.bankingRepo.findProposalById(tenantId, proposal.id))!;
  }

  async correctAndApproveProposal(
    tenantId: string,
    userId: string,
    proposalId: string,
    rawDto: CorrectProposalInput,
  ): Promise<ProposalEntity> {
    const parseResult = correctProposalSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Correction validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const proposal = await this.bankingRepo.findProposalById(tenantId, proposalId);
    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }
    if (proposal.status !== 'PROPOSED') {
      throw new UnprocessableEntityError(`Cannot correct proposal in status '${proposal.status}'`);
    }

    const tx = await this.bankingRepo.findBankTransactionById(tenantId, proposal.bankTransactionId);
    if (!tx) {
      throw new NotFoundError('Bank Transaction', proposal.bankTransactionId);
    }

    // Apply human corrections
    const updated = await this.bankingRepo.updateProposalStatus(tenantId, proposalId, 'MODIFIED', {
      modifications: {
        debitAccountId: dto.debitAccountId,
        creditAccountId: dto.creditAccountId,
      },
    });

    // Post to ledger with updated accounts
    await this.executeDeterministicGateAndPost(tenantId, userId, updated, tx);

    await this.auditService.recordEvent({
      tenantId,
      action: 'PROPOSAL_CORRECTED',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      actorType: 'USER',
      actorId: userId,
      previousState: {
        debitAccountId: proposal.debitAccountId,
        creditAccountId: proposal.creditAccountId,
      },
      newState: {
        debitAccountId: updated.debitAccountId,
        creditAccountId: updated.creditAccountId,
        notes: dto.notes,
      },
    });

    return (await this.bankingRepo.findProposalById(tenantId, proposal.id))!;
  }

  async rejectProposal(
    tenantId: string,
    userId: string,
    proposalId: string,
    rawDto: RejectProposalInput,
  ): Promise<ProposalEntity> {
    const parseResult = rejectProposalSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Rejection validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const proposal = await this.bankingRepo.findProposalById(tenantId, proposalId);
    if (!proposal) {
      throw new NotFoundError('Proposal', proposalId);
    }
    if (proposal.status !== 'PROPOSED') {
      throw new UnprocessableEntityError(`Cannot reject proposal in status '${proposal.status}'`);
    }

    const rejected = await this.bankingRepo.updateProposalStatus(tenantId, proposalId, 'REJECTED', {
      userId,
    });
    await this.bankingRepo.updateTransactionStatus(
      tenantId,
      proposal.bankTransactionId,
      'EXCLUDED',
    );

    await this.auditService.recordEvent({
      tenantId,
      action: 'PROPOSAL_REJECTED',
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      actorType: 'USER',
      actorId: userId,
      newState: { status: 'REJECTED', reason: dto.reason },
    });

    return rejected;
  }

  // --- Failure Recovery & Retries ---
  async retryStatementProcessing(
    tenantId: string,
    userId: string,
    statementId: string,
  ): Promise<{ statement: BankStatementEntity }> {
    const statement = await this.bankingRepo.findBankStatementById(tenantId, statementId);
    if (!statement) {
      throw new NotFoundError('Bank Statement', statementId);
    }

    // Increment retry count
    await this.bankingRepo.incrementStatementRetryCount(tenantId, statementId);

    // Unreconciled transactions for this statement
    const transactions = await this.bankingRepo.listTransactionsByStatementId(
      tenantId,
      statementId,
    );
    const unreconciled = transactions.filter(
      (t) => t.status === 'UNRECONCILED' || t.status === 'PROPOSED',
    );

    if (!statement.bankAccountId) {
      throw new Error(
        `Cannot run AI classification on statement ${statementId} because it has no assigned bank account.`,
      );
    }

    const bankAccount = await this.bankingRepo.findBankAccountById(
      tenantId,
      statement.bankAccountId,
    );
    const allBankAccounts = await this.bankingRepo.listBankAccounts(tenantId);
    const counterparties = await this.counterpartyRepo.list(tenantId);
    const openInvoices = await this.invoiceRepo.listInvoices(tenantId);
    const accounts = await this.ledgerService.listAccounts(tenantId);

    for (const tx of unreconciled) {
      try {
        const evalResult = await this.aiAccountant.evaluateTransaction(tenantId, tx, {
          bankAccount: bankAccount!,
          otherBankAccounts: allBankAccounts,
          counterparties,
          openInvoices: openInvoices.filter(
            (i) => i.status === 'POSTED' || i.status === 'PARTIALLY_PAID',
          ),
          accounts,
        });

        const absAmount = tx.amountCents >= 0n ? tx.amountCents : -tx.amountCents;

        let proposal = await this.bankingRepo.findProposalByTransactionId(tenantId, tx.id);
        if (!proposal) {
          proposal = await this.bankingRepo.createProposal({
            tenantId,
            bankTransactionId: tx.id,
            invoiceId: evalResult.suggestedInvoiceId,
            counterpartyId: evalResult.suggestedCounterpartyId,
            proposalType: evalResult.proposalType,
            debitAccountId: evalResult.suggestedDebitAccountId,
            creditAccountId: evalResult.suggestedCreditAccountId,
            amountCents: absAmount,
            confidenceScore: evalResult.confidenceScore,
            evidence: evalResult.evidence,
            rationale: evalResult.rationale,
            autoPostEligible: evalResult.autoPostEligible,
          });
        }

        if (
          proposal.autoPostEligible &&
          proposal.confidenceScore >= 0.95 &&
          !evalResult.isAmbiguous
        ) {
          await this.executeDeterministicGateAndPost(tenantId, userId, proposal, tx);
        }
      } catch {
        // Continue with next
      }
    }

    const updated = await this.bankingRepo.updateBankStatementStatus(
      tenantId,
      statementId,
      'PARSED',
    );
    return { statement: updated };
  }

  // --- Exception Center Management ---
  async listExceptions(
    tenantId: string,
    options?: {
      status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    },
  ): Promise<ExceptionItemEntity[]> {
    return this.bankingRepo.listExceptionItems(tenantId, options);
  }

  async resolveException(
    tenantId: string,
    userId: string,
    exceptionId: string,
    rawDto: ResolveExceptionInput,
  ): Promise<ExceptionItemEntity> {
    const parseResult = resolveExceptionSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Exception resolution validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const exc = await this.bankingRepo.findExceptionItemById(tenantId, exceptionId);
    if (!exc) {
      throw new NotFoundError('Exception Item', exceptionId);
    }

    const updated = await this.bankingRepo.updateExceptionStatus(
      tenantId,
      exceptionId,
      dto.status,
      userId,
    );

    // If the exception was generated for an accounting proposal, resolve the proposal accordingly
    if (exc.entityType === 'PROPOSAL' && exc.entityId) {
      const proposal = await this.bankingRepo.findProposalById(tenantId, exc.entityId);
      if (proposal && proposal.status === 'PROPOSED') {
        if (dto.status === 'RESOLVED') {
          try {
            await this.approveProposal(tenantId, userId, proposal.id);
          } catch (gateErr) {
            this.logger.warn(
              `Could not auto-post proposal ${proposal.id} during exception approval: ${gateErr}`,
            );
          }
        } else if (dto.status === 'DISMISSED') {
          try {
            await this.rejectProposal(tenantId, userId, proposal.id, {
              reason: dto.resolutionNotes || 'Dismissed by supervisor in Exception Center',
            });
          } catch (gateErr) {
            this.logger.warn(
              `Could not reject proposal ${proposal.id} during exception dismissal: ${gateErr}`,
            );
          }
        }
      }
    }

    await this.auditService.recordEvent({
      tenantId,
      action: 'EXCEPTION_RESOLVED',
      entityType: 'EXCEPTION_ITEM',
      entityId: exceptionId,
      actorType: 'USER',
      actorId: userId,
      newState: {
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
      },
    });

    return updated;
  }

  async batchResolveExceptions(
    tenantId: string,
    userId: string,
    rawDto: BatchResolveExceptionsInput,
  ): Promise<{
    resolvedCount: number;
    failedCount: number;
    results: Array<{ id: string; success: boolean; error?: string }>;
  }> {
    const parseResult = batchResolveExceptionsSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Batch exception resolution validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    let resolvedCount = 0;
    let failedCount = 0;

    for (const exceptionId of dto.exceptionIds) {
      try {
        await this.resolveException(tenantId, userId, exceptionId, {
          status: dto.status,
          resolutionNotes: dto.resolutionNotes,
        });
        results.push({ id: exceptionId, success: true });
        resolvedCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Resolution failed';
        this.logger.warn(`Failed to resolve exception ${exceptionId} in batch: ${errorMsg}`);
        results.push({ id: exceptionId, success: false, error: errorMsg });
        failedCount++;
      }
    }

    return {
      resolvedCount,
      failedCount,
      results,
    };
  }

  // --- Queries ---
  async listStatements(tenantId: string, bankAccountId?: string): Promise<BankStatementEntity[]> {
    return this.bankingRepo.listBankStatements(tenantId, bankAccountId);
  }

  async listProposals(
    tenantId: string,
    status?: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'MODIFIED',
  ): Promise<ProposalEntity[]> {
    return this.bankingRepo.listProposals(tenantId, status);
  }

  async listTransactions(
    tenantId: string,
    options?: { bankAccountId?: string; status?: BankTransactionStatus },
  ): Promise<BankTransactionEntity[]> {
    return this.bankingRepo.listTransactions(tenantId, options);
  }

  async getStatementUploadResult(
    tenantId: string,
    statementId: string,
  ): Promise<{
    statement: BankStatementEntity;
    transactions: BankTransactionEntity[];
    proposals: ProposalEntity[];
    exceptions: ExceptionItemEntity[];
  } | null> {
    const statement = await this.bankingRepo.findBankStatementById(tenantId, statementId);
    if (!statement) {
      return null;
    }
    const transactions = await this.bankingRepo.listTransactionsByStatementId(
      tenantId,
      statementId,
    );
    const txIds = new Set(transactions.map((t) => t.id));
    const allProposals = await this.bankingRepo.listProposals(tenantId);
    const proposals = allProposals.filter((p) => txIds.has(p.bankTransactionId));
    const allExceptions = await this.bankingRepo.listExceptionItems(tenantId);
    const exceptions = allExceptions.filter(
      (e) => e.entityId === statementId || txIds.has(e.entityId),
    );
    return {
      statement,
      transactions,
      proposals,
      exceptions,
    };
  }

  async findRecentStatement(
    tenantId: string,
    fileName?: string,
  ): Promise<BankStatementEntity | null> {
    const statements = await this.bankingRepo.listBankStatements(tenantId);
    if (!statements || statements.length === 0) {
      return null;
    }
    if (fileName) {
      const match = statements.find((s) => s.fileName === fileName);
      if (match) {
        return match;
      }
    }
    return statements[0] || null;
  }
}
