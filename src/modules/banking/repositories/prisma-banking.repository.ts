import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type { BankAccountEntity, BankAccountType } from '../domain/bank-account.entity';
import type { BankStatementEntity, BankStatementStatus } from '../domain/bank-statement.entity';
import type {
  BankTransactionEntity,
  BankTransactionStatus,
} from '../domain/bank-transaction.entity';
import type {
  CreateBankAccountInput,
  CreateBankStatementInput,
  CreateBankTransactionInput,
  CreateExceptionInput,
  CreateProposalInput,
  IBankingRepository,
} from '../domain/banking.repository.interface';
import type {
  ExceptionItemEntity,
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
} from '../domain/exception-item.entity';
import type {
  AiDecisionEvidence,
  ProposalEntity,
  ProposalStatus,
  ProposalType,
} from '../domain/proposal.entity';
import type {
  ReconciledTransactionEntity,
  ReconciliationMethod,
} from '../domain/reconciled-transaction.entity';
import type {
  BankAccount,
  BankingExceptionItem,
  BankStatement,
  BankTransaction,
  Proposal,
  ReconciledTransaction,
} from '@prisma/client';

@Injectable()
export class PrismaBankingRepository implements IBankingRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        slug: tenantId,
        legalName: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  // --- Mappers ---
  private toBankAccountEntity(model: BankAccount): BankAccountEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      ledgerAccountId: model.ledgerAccountId,
      accountName: model.accountName,
      institutionName: model.institutionName,
      accountType: model.accountType as BankAccountType,
      currency: model.currency,
      accountNumberLast4: model.accountNumberLast4,
      currentBalanceCents: model.currentBalanceCents,
      reconciledBalanceCents: model.reconciledBalanceCents,
      isActive: model.isActive,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toBankStatementEntity(model: BankStatement): BankStatementEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      bankAccountId: model.bankAccountId,
      sourceDocumentId: model.sourceDocumentId ?? undefined,
      fileName: model.fileName,
      fileSha256: model.fileSha256,
      mimeType: model.mimeType,
      statementStartDate: model.statementStartDate.toISOString().split('T')[0] ?? '',
      statementEndDate: model.statementEndDate.toISOString().split('T')[0] ?? '',
      openingBalanceCents: model.openingBalanceCents,
      closingBalanceCents: model.closingBalanceCents,
      totalDebitsCents: model.totalDebitsCents,
      totalCreditsCents: model.totalCreditsCents,
      pageCount: model.pageCount,
      extractionMode: model.extractionMode,
      bankDetected: model.bankDetected ?? undefined,
      formatDetected: model.formatDetected ?? undefined,
      parserVersion: model.parserVersion,
      bankAdapterVersion: model.bankAdapterVersion ?? undefined,
      extractionPromptVersion: model.extractionPromptVersion ?? undefined,
      aiModelVersion: model.aiModelVersion ?? undefined,
      validationStatus: model.validationStatus,
      reprocessingOfId: model.reprocessingOfId ?? undefined,
      metadata: (model.metadata as Record<string, unknown>) ?? undefined,
      status: model.status as BankStatementStatus,
      retryCount: model.retryCount,
      errorMessage: model.errorMessage ?? undefined,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toBankTransactionEntity(
    model: BankTransaction & { bankAccount?: { currency: string } | null },
  ): BankTransactionEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      bankStatementId: model.bankStatementId,
      bankAccountId: model.bankAccountId,
      pageNumber: model.pageNumber,
      sourceSequence: model.sourceSequence,
      sourceRowIndex: model.sourceRowIndex,
      transactionDate: model.transactionDate.toISOString().split('T')[0] ?? '',
      valueDate: model.valueDate ? model.valueDate.toISOString().split('T')[0] : undefined,
      direction: model.direction as 'DEBIT' | 'CREDIT',
      amountCents: model.amountCents,
      signedAmountCents: model.signedAmountCents,
      runningBalanceCents: model.runningBalanceCents ?? undefined,
      rawDescription: model.rawDescription,
      rawPrimaryText: model.rawPrimaryText ?? undefined,
      rawContinuationText: model.rawContinuationText ?? undefined,
      rawReferenceText: model.rawReferenceText ?? undefined,
      bankReference: model.bankReference ?? undefined,
      counterpartyAccount: model.counterpartyAccount ?? undefined,
      normalizedPayee: model.normalizedPayee ?? undefined,
      normalizedDescription: model.normalizedDescription ?? undefined,
      categorySuggestion: model.categorySuggestion ?? undefined,
      extractionMethod: model.extractionMethod,
      extractionConfidence: model.extractionConfidence,
      entityResolutionConfidence: model.entityResolutionConfidence ?? undefined,
      accountingConfidence: model.accountingConfidence ?? undefined,
      riskLevel: (model.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'LOW',
      sourceEvidence: (model.sourceEvidence as Record<string, unknown>) ?? undefined,
      transactionFingerprint: model.transactionFingerprint ?? undefined,
      referenceNumber: model.referenceNumber ?? undefined,
      transactionHash: model.transactionHash,
      currency: model.bankAccount?.currency ?? 'USD',
      status: model.status as BankTransactionStatus,
      createdAt: model.createdAt,
    };
  }

  private toProposalEntity(model: Proposal): ProposalEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      bankTransactionId: model.bankTransactionId,
      invoiceId: model.invoiceId ?? undefined,
      counterpartyId: model.counterpartyId ?? undefined,
      proposalType: model.proposalType as ProposalType,
      debitAccountId: model.debitAccountId,
      creditAccountId: model.creditAccountId,
      amountCents: model.amountCents,
      confidenceScore: model.confidenceScore,
      evidence: (model.evidence as unknown as AiDecisionEvidence[]) || [],
      rationale: model.rationale,
      status: model.status as ProposalStatus,
      autoPostEligible: model.autoPostEligible,
      postedJournalEntryId: model.postedJournalEntryId ?? undefined,
      resolvedByUserId: model.resolvedByUserId ?? undefined,
      resolvedAt: model.resolvedAt ?? undefined,
      createdAt: model.createdAt,
    };
  }

  private toExceptionItemEntity(model: BankingExceptionItem): ExceptionItemEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      entityType: model.entityType as ExceptionItemEntity['entityType'],
      entityId: model.entityId,
      exceptionType: model.exceptionType as ExceptionType,
      severity: model.severity as ExceptionSeverity,
      reason: model.reason,
      evidence: (model.evidence as unknown as unknown[]) ?? undefined,
      proposedResolution: (model.proposedResolution as Record<string, unknown>) ?? undefined,
      status: model.status as ExceptionStatus,
      resolvedByUserId: model.resolvedByUserId ?? undefined,
      resolvedAt: model.resolvedAt ?? undefined,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }

  private toReconciledTransactionEntity(model: ReconciledTransaction): ReconciledTransactionEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      bankTransactionId: model.bankTransactionId,
      journalEntryId: model.journalEntryId,
      reconciliationMethod: model.reconciliationMethod as ReconciliationMethod,
      confidenceScore: model.confidenceScore ?? undefined,
      reconciledByUserId: model.reconciledByUserId ?? undefined,
      reconciledAt: model.reconciledAt,
    };
  }

  // --- Bank Accounts ---
  async createBankAccount(input: CreateBankAccountInput): Promise<BankAccountEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.bankAccount.create({
      data: {
        tenantId: input.tenantId,
        ledgerAccountId: input.ledgerAccountId,
        accountName: input.accountName,
        institutionName: input.institutionName,
        accountType: input.accountType,
        currency: input.currency || 'USD',
        accountNumberLast4: input.accountNumberLast4,
        currentBalanceCents: 0n,
        reconciledBalanceCents: 0n,
        isActive: true,
      },
    });

    return this.toBankAccountEntity(created);
  }

  async findBankAccountById(tenantId: string, id: string): Promise<BankAccountEntity | null> {
    const item = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toBankAccountEntity(item);
  }

  async listBankAccounts(tenantId: string, activeOnly = false): Promise<BankAccountEntity[]> {
    const items = await this.prisma.bankAccount.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { accountName: 'asc' },
    });
    return items.map((a) => this.toBankAccountEntity(a));
  }

  async updateBankAccountBalances(
    tenantId: string,
    id: string,
    currentBalanceCents: bigint,
    reconciledBalanceCents?: bigint,
  ): Promise<BankAccountEntity> {
    const existing = await this.findBankAccountById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Bank Account', id);
    }

    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        currentBalanceCents,
        ...(reconciledBalanceCents !== undefined ? { reconciledBalanceCents } : {}),
        version: { increment: 1 },
      },
    });

    return this.toBankAccountEntity(updated);
  }

  // --- Bank Statements ---
  async createBankStatement(input: CreateBankStatementInput): Promise<BankStatementEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.bankStatement.create({
      data: {
        tenantId: input.tenantId,
        bankAccountId: input.bankAccountId,
        sourceDocumentId: input.sourceDocumentId,
        fileName: input.fileName,
        fileSha256: input.fileSha256,
        mimeType: input.mimeType,
        statementStartDate: new Date(input.statementStartDate),
        statementEndDate: new Date(input.statementEndDate),
        openingBalanceCents: input.openingBalanceCents,
        closingBalanceCents: input.closingBalanceCents,
        totalDebitsCents: input.totalDebitsCents,
        totalCreditsCents: input.totalCreditsCents,
        pageCount: input.pageCount || 1,
        extractionMode: input.extractionMode || 'NATIVE_TEXT',
        bankDetected: input.bankDetected,
        formatDetected: input.formatDetected,
        parserVersion: input.parserVersion || '2.0.0',
        bankAdapterVersion: input.bankAdapterVersion,
        extractionPromptVersion: input.extractionPromptVersion,
        aiModelVersion: input.aiModelVersion,
        validationStatus: input.validationStatus || 'PENDING',
        reprocessingOfId: input.reprocessingOfId,
        metadata: input.metadata ? (input.metadata as object) : undefined,
        status: input.status || 'UPLOADED',
        retryCount: 0,
      },
    });

    return this.toBankStatementEntity(created);
  }

  async deleteBankStatement(tenantId: string, id: string): Promise<void> {
    await this.prisma.bankStatement.deleteMany({
      where: { tenantId, id },
    });
  }

  async findBankStatementById(tenantId: string, id: string): Promise<BankStatementEntity | null> {
    const item = await this.prisma.bankStatement.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toBankStatementEntity(item);
  }

  async findBankStatementByHash(
    tenantId: string,
    fileSha256: string,
  ): Promise<BankStatementEntity | null> {
    const item = await this.prisma.bankStatement.findUnique({
      where: {
        tenantId_fileSha256: {
          tenantId,
          fileSha256,
        },
      },
    });
    return item ? this.toBankStatementEntity(item) : null;
  }

  async findBankStatementByPeriod(
    tenantId: string,
    bankAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<BankStatementEntity | null> {
    const item = await this.prisma.bankStatement.findUnique({
      where: {
        tenantId_bankAccountId_statementStartDate_statementEndDate: {
          tenantId,
          bankAccountId,
          statementStartDate: new Date(startDate),
          statementEndDate: new Date(endDate),
        },
      },
    });
    return item ? this.toBankStatementEntity(item) : null;
  }

  async listBankStatements(
    tenantId: string,
    bankAccountId?: string,
  ): Promise<BankStatementEntity[]> {
    const items = await this.prisma.bankStatement.findMany({
      where: {
        tenantId,
        ...(bankAccountId ? { bankAccountId } : {}),
      },
      orderBy: { statementStartDate: 'desc' },
    });
    return items.map((s) => this.toBankStatementEntity(s));
  }

  async updateBankStatementStatus(
    tenantId: string,
    id: string,
    status: BankStatementStatus,
    errorMessage?: string,
  ): Promise<BankStatementEntity> {
    const existing = await this.findBankStatementById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Bank Statement', id);
    }

    const updated = await this.prisma.bankStatement.update({
      where: { id },
      data: {
        status,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        version: { increment: 1 },
      },
    });

    return this.toBankStatementEntity(updated);
  }

  async incrementStatementRetryCount(tenantId: string, id: string): Promise<BankStatementEntity> {
    const existing = await this.findBankStatementById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Bank Statement', id);
    }

    const updated = await this.prisma.bankStatement.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
      },
    });

    return this.toBankStatementEntity(updated);
  }

  // --- Bank Transactions ---
  async createBankTransactions(
    inputs: CreateBankTransactionInput[],
  ): Promise<BankTransactionEntity[]> {
    const firstInput = inputs[0];
    if (!firstInput) {
      return [];
    }

    await this.ensureTenantExists(firstInput.tenantId);

    const createdItems: BankTransactionEntity[] = [];
    const BATCH_SIZE = 1000;

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const chunk = inputs.slice(i, i + BATCH_SIZE);
      const createdChunk = await this.prisma.bankTransaction.createManyAndReturn({
        data: chunk.map((input) => ({
          tenantId: input.tenantId,
          bankStatementId: input.bankStatementId,
          bankAccountId: input.bankAccountId,
          pageNumber: input.pageNumber || 1,
          sourceSequence: input.sourceSequence || 1,
          sourceRowIndex: input.sourceRowIndex || 0,
          transactionDate: new Date(input.transactionDate),
          valueDate: input.valueDate ? new Date(input.valueDate) : undefined,
          direction: input.direction || (input.amountCents < 0n ? 'DEBIT' : 'CREDIT'),
          amountCents: input.amountCents,
          signedAmountCents:
            input.signedAmountCents !== undefined ? input.signedAmountCents : input.amountCents,
          runningBalanceCents: input.runningBalanceCents,
          rawDescription: input.rawDescription,
          rawPrimaryText: input.rawPrimaryText,
          rawContinuationText: input.rawContinuationText,
          rawReferenceText: input.rawReferenceText,
          bankReference: input.bankReference,
          counterpartyAccount: input.counterpartyAccount,
          normalizedPayee: input.normalizedPayee,
          normalizedDescription: input.normalizedDescription,
          categorySuggestion: input.categorySuggestion,
          extractionMethod: input.extractionMethod || 'NATIVE_LAYOUT',
          extractionConfidence: input.extractionConfidence ?? 1.0,
          entityResolutionConfidence: input.entityResolutionConfidence,
          accountingConfidence: input.accountingConfidence,
          riskLevel: input.riskLevel || 'LOW',
          sourceEvidence: input.sourceEvidence ? (input.sourceEvidence as object) : undefined,
          transactionFingerprint: input.transactionFingerprint,
          referenceNumber: input.referenceNumber,
          transactionHash: input.transactionHash,
          status: 'UNRECONCILED',
        })),
      });

      for (const item of createdChunk) {
        createdItems.push(this.toBankTransactionEntity(item));
      }
    }

    return createdItems;
  }

  async findBankTransactionById(
    tenantId: string,
    id: string,
  ): Promise<BankTransactionEntity | null> {
    const item = await this.prisma.bankTransaction.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toBankTransactionEntity(item);
  }

  async findBankTransactionByHash(
    tenantId: string,
    bankAccountId: string,
    transactionHash: string,
  ): Promise<BankTransactionEntity | null> {
    const item = await this.prisma.bankTransaction.findFirst({
      where: {
        tenantId,
        bankAccountId,
        transactionHash,
      },
    });
    return item ? this.toBankTransactionEntity(item) : null;
  }

  async findBankTransactionsByHashes(
    tenantId: string,
    bankAccountId: string,
    transactionHashes: string[],
  ): Promise<Map<string, BankTransactionEntity>> {
    const result = new Map<string, BankTransactionEntity>();
    if (transactionHashes.length === 0) {
      return result;
    }

    const BATCH_SIZE = 1000;
    for (let i = 0; i < transactionHashes.length; i += BATCH_SIZE) {
      const chunk = transactionHashes.slice(i, i + BATCH_SIZE);
      const items = await this.prisma.bankTransaction.findMany({
        where: {
          tenantId,
          bankAccountId,
          transactionHash: { in: chunk },
        },
      });

      for (const item of items) {
        if (item.transactionHash) {
          result.set(item.transactionHash, this.toBankTransactionEntity(item));
        }
      }
    }

    return result;
  }

  async listTransactionsByStatementId(
    tenantId: string,
    statementId: string,
  ): Promise<BankTransactionEntity[]> {
    const items = await this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        bankStatementId: statementId,
      },
      orderBy: { sourceSequence: 'asc' },
    });
    return items.map((t) => this.toBankTransactionEntity(t));
  }

  async listTransactions(
    tenantId: string,
    options?: { bankAccountId?: string; status?: BankTransactionStatus },
  ): Promise<BankTransactionEntity[]> {
    const items = await this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        ...(options?.bankAccountId ? { bankAccountId: options.bankAccountId } : {}),
        ...(options?.status ? { status: options.status } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        bankStatementId: true,
        bankAccountId: true,
        pageNumber: true,
        sourceSequence: true,
        sourceRowIndex: true,
        transactionDate: true,
        valueDate: true,
        direction: true,
        amountCents: true,
        signedAmountCents: true,
        runningBalanceCents: true,
        rawDescription: true,
        rawPrimaryText: true,
        rawContinuationText: true,
        rawReferenceText: true,
        bankReference: true,
        counterpartyAccount: true,
        normalizedPayee: true,
        normalizedDescription: true,
        categorySuggestion: true,
        extractionMethod: true,
        extractionConfidence: true,
        entityResolutionConfidence: true,
        accountingConfidence: true,
        riskLevel: true,
        transactionFingerprint: true,
        referenceNumber: true,
        transactionHash: true,
        status: true,
        createdAt: true,
        bankAccount: {
          select: { currency: true },
        },
      },
      orderBy: [{ transactionDate: 'asc' }, { sourceSequence: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map((t) =>
      this.toBankTransactionEntity(
        t as unknown as BankTransaction & { bankAccount?: { currency: string } | null },
      ),
    );
  }

  async updateTransactionStatus(
    tenantId: string,
    id: string,
    status: BankTransactionStatus,
  ): Promise<BankTransactionEntity> {
    const existing = await this.findBankTransactionById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Bank Transaction', id);
    }

    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { status },
    });

    return this.toBankTransactionEntity(updated);
  }

  async updateTransactionStatuses(
    tenantId: string,
    ids: string[],
    status: BankTransactionStatus,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const BATCH_SIZE = 1000;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      await this.prisma.bankTransaction.updateMany({
        where: {
          tenantId,
          id: { in: chunk },
        },
        data: { status },
      });
    }
  }

  // --- Proposals ---
  async createProposal(input: CreateProposalInput): Promise<ProposalEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.proposal.create({
      data: {
        tenantId: input.tenantId,
        bankTransactionId: input.bankTransactionId,
        invoiceId: input.invoiceId,
        counterpartyId: input.counterpartyId,
        proposalType: input.proposalType,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        amountCents: input.amountCents,
        confidenceScore: input.confidenceScore,
        evidence: (input.evidence as unknown as Prisma.InputJsonValue) ?? [],
        rationale: input.rationale,
        status: 'PROPOSED',
        autoPostEligible: input.autoPostEligible,
      },
    });

    return this.toProposalEntity(created);
  }

  async createProposals(inputs: CreateProposalInput[]): Promise<ProposalEntity[]> {
    const firstInput = inputs[0];
    if (!firstInput) {
      return [];
    }

    await this.ensureTenantExists(firstInput.tenantId);

    const createdItems: ProposalEntity[] = [];
    const BATCH_SIZE = 1000;

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const chunk = inputs.slice(i, i + BATCH_SIZE);
      const createdChunk = await this.prisma.proposal.createManyAndReturn({
        data: chunk.map((input) => ({
          tenantId: input.tenantId,
          bankTransactionId: input.bankTransactionId,
          invoiceId: input.invoiceId,
          counterpartyId: input.counterpartyId,
          proposalType: input.proposalType,
          debitAccountId: input.debitAccountId,
          creditAccountId: input.creditAccountId,
          amountCents: input.amountCents,
          confidenceScore: input.confidenceScore,
          evidence: (input.evidence as unknown as Prisma.InputJsonValue) ?? [],
          rationale: input.rationale,
          status: 'PROPOSED',
          autoPostEligible: input.autoPostEligible,
        })),
      });

      for (const item of createdChunk) {
        createdItems.push(this.toProposalEntity(item));
      }
    }

    return createdItems;
  }

  async findProposalById(tenantId: string, id: string): Promise<ProposalEntity | null> {
    const item = await this.prisma.proposal.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toProposalEntity(item);
  }

  async findProposalByTransactionId(
    tenantId: string,
    transactionId: string,
  ): Promise<ProposalEntity | null> {
    const item = await this.prisma.proposal.findFirst({
      where: {
        tenantId,
        bankTransactionId: transactionId,
      },
    });
    return item ? this.toProposalEntity(item) : null;
  }

  async listProposals(tenantId: string, status?: ProposalStatus): Promise<ProposalEntity[]> {
    const items = await this.prisma.proposal.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((p) => this.toProposalEntity(p));
  }

  async updateProposalStatus(
    tenantId: string,
    id: string,
    status: ProposalStatus,
    options?: {
      userId?: string;
      postedJournalEntryId?: string;
      modifications?: { debitAccountId?: string; creditAccountId?: string };
    },
  ): Promise<ProposalEntity> {
    const existing = await this.findProposalById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Proposal', id);
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data: {
        status,
        ...(options?.userId ? { resolvedByUserId: options.userId, resolvedAt: new Date() } : {}),
        ...(options?.postedJournalEntryId
          ? { postedJournalEntryId: options.postedJournalEntryId }
          : {}),
        ...(options?.modifications?.debitAccountId
          ? { debitAccountId: options.modifications.debitAccountId }
          : {}),
        ...(options?.modifications?.creditAccountId
          ? { creditAccountId: options.modifications.creditAccountId }
          : {}),
      },
    });

    return this.toProposalEntity(updated);
  }

  // --- Exception Items ---
  async createExceptionItem(input: CreateExceptionInput): Promise<ExceptionItemEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.bankingExceptionItem.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        exceptionType: input.exceptionType,
        severity: input.severity,
        reason: input.reason,
        evidence: (input.evidence as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        proposedResolution:
          (input.proposedResolution as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        status: 'OPEN',
      },
    });

    return this.toExceptionItemEntity(created);
  }

  async createExceptionItems(inputs: CreateExceptionInput[]): Promise<ExceptionItemEntity[]> {
    const firstInput = inputs[0];
    if (!firstInput) {
      return [];
    }

    await this.ensureTenantExists(firstInput.tenantId);

    const createdItems: ExceptionItemEntity[] = [];
    const BATCH_SIZE = 1000;

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const chunk = inputs.slice(i, i + BATCH_SIZE);
      const createdChunk = await this.prisma.bankingExceptionItem.createManyAndReturn({
        data: chunk.map((input) => ({
          tenantId: input.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          exceptionType: input.exceptionType,
          severity: input.severity,
          reason: input.reason,
          evidence: (input.evidence as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          proposedResolution:
            (input.proposedResolution as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          status: 'OPEN',
        })),
      });

      for (const item of createdChunk) {
        createdItems.push(this.toExceptionItemEntity(item));
      }
    }

    return createdItems;
  }

  async findExceptionItemById(tenantId: string, id: string): Promise<ExceptionItemEntity | null> {
    const item = await this.prisma.bankingExceptionItem.findUnique({
      where: { id },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    const entity = this.toExceptionItemEntity(item);
    if (entity.entityType === 'PROPOSAL' && entity.entityId) {
      const prop = await this.prisma.proposal.findUnique({
        where: { id: entity.entityId },
        include: {
          bankTransaction: {
            include: { bankAccount: true },
          },
        },
      });
      if (prop) {
        const currency = prop.bankTransaction?.bankAccount?.currency || 'MYR';
        const amountCents =
          prop.bankTransaction?.amountCents?.toString() || prop.amountCents.toString();
        const signedAmountCents =
          prop.bankTransaction?.signedAmountCents?.toString() || prop.amountCents.toString();
        const txDate = prop.bankTransaction?.transactionDate?.toISOString();

        entity.proposedResolution = {
          ...(entity.proposedResolution || {}),
          amountCents,
          signedAmountCents,
          currency,
          transactionDate: txDate,
        };

        const existingEvidence = Array.isArray(entity.evidence) ? entity.evidence : [];
        const hasTxContext = existingEvidence.some(
          (ev: unknown) => ev && typeof ev === 'object' && (ev as Record<string, unknown>).currency,
        );
        if (!hasTxContext) {
          entity.evidence = [
            ...existingEvidence,
            {
              source: 'TRANSACTION_CONTEXT',
              amountCents,
              signedAmountCents,
              currency,
              transactionDate: txDate,
            },
          ];
        }
      }
    }
    return entity;
  }

  async listExceptionItems(
    tenantId: string,
    options?: { status?: ExceptionStatus; severity?: ExceptionSeverity },
  ): Promise<ExceptionItemEntity[]> {
    const items = await this.prisma.bankingExceptionItem.findMany({
      where: {
        tenantId,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.severity ? { severity: options.severity } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const proposalIds = items
      .filter((e) => e.entityType === 'PROPOSAL' && e.entityId)
      .map((e) => e.entityId);

    if (proposalIds.length > 0) {
      const proposals = await this.prisma.proposal.findMany({
        where: { id: { in: proposalIds }, tenantId },
        include: {
          bankTransaction: {
            include: { bankAccount: true },
          },
        },
      });
      const proposalMap = new Map(proposals.map((p) => [p.id, p]));

      return items.map((e) => {
        const entity = this.toExceptionItemEntity(e);
        if (e.entityType === 'PROPOSAL' && proposalMap.has(e.entityId)) {
          const prop = proposalMap.get(e.entityId)!;
          const currency = prop.bankTransaction?.bankAccount?.currency || 'MYR';
          const amountCents =
            prop.bankTransaction?.amountCents?.toString() || prop.amountCents.toString();
          const signedAmountCents =
            prop.bankTransaction?.signedAmountCents?.toString() || prop.amountCents.toString();
          const txDate = prop.bankTransaction?.transactionDate?.toISOString();

          entity.proposedResolution = {
            ...(entity.proposedResolution || {}),
            amountCents,
            signedAmountCents,
            currency,
            transactionDate: txDate,
          };

          const existingEvidence = Array.isArray(entity.evidence) ? entity.evidence : [];
          const hasTxContext = existingEvidence.some(
            (ev: unknown) =>
              ev && typeof ev === 'object' && (ev as Record<string, unknown>).currency,
          );
          if (!hasTxContext) {
            entity.evidence = [
              ...existingEvidence,
              {
                source: 'TRANSACTION_CONTEXT',
                amountCents,
                signedAmountCents,
                currency,
                transactionDate: txDate,
              },
            ];
          }
        }
        return entity;
      });
    }

    return items.map((e) => this.toExceptionItemEntity(e));
  }

  async updateExceptionStatus(
    tenantId: string,
    id: string,
    status: ExceptionStatus,
    resolvedByUserId?: string,
  ): Promise<ExceptionItemEntity> {
    const existing = await this.findExceptionItemById(tenantId, id);
    if (!existing) {
      throw new NotFoundError('Exception Item', id);
    }

    const updated = await this.prisma.bankingExceptionItem.update({
      where: { id },
      data: {
        status,
        ...(resolvedByUserId ? { resolvedByUserId, resolvedAt: new Date() } : {}),
      },
    });

    return this.toExceptionItemEntity(updated);
  }

  // --- Reconciled Transactions ---
  async createReconciledTransaction(input: {
    tenantId: string;
    bankTransactionId: string;
    journalEntryId: string;
    reconciliationMethod: ReconciliationMethod;
    confidenceScore?: number;
    reconciledByUserId?: string;
  }): Promise<ReconciledTransactionEntity> {
    await this.ensureTenantExists(input.tenantId);

    const created = await this.prisma.reconciledTransaction.create({
      data: {
        tenantId: input.tenantId,
        bankTransactionId: input.bankTransactionId,
        journalEntryId: input.journalEntryId,
        reconciliationMethod: input.reconciliationMethod,
        confidenceScore: input.confidenceScore,
        reconciledByUserId: input.reconciledByUserId,
      },
    });

    return this.toReconciledTransactionEntity(created);
  }

  async findReconciliationByTransactionId(
    tenantId: string,
    bankTransactionId: string,
  ): Promise<ReconciledTransactionEntity | null> {
    const item = await this.prisma.reconciledTransaction.findUnique({
      where: { bankTransactionId },
    });
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return this.toReconciledTransactionEntity(item);
  }
}
