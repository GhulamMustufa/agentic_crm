import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { NotFoundError } from '../../../core/errors/app-error';

import type { BankAccountEntity } from '../domain/bank-account.entity';
import type { BankStatementEntity, BankStatementStatus } from '../domain/bank-statement.entity';
import type {
  BankTransactionEntity,
  BankTransactionStatus,
} from '../domain/bank-transaction.entity';
import type {
  IBankingRepository,
  CreateBankAccountInput,
  CreateBankStatementInput,
  CreateBankTransactionInput,
  CreateProposalInput,
  CreateExceptionInput,
} from '../domain/banking.repository.interface';
import type {
  ExceptionItemEntity,
  ExceptionStatus,
  ExceptionSeverity,
} from '../domain/exception-item.entity';
import type { ProposalEntity, ProposalStatus } from '../domain/proposal.entity';
import type {
  ReconciledTransactionEntity,
  ReconciliationMethod,
} from '../domain/reconciled-transaction.entity';

@Injectable()
export class InMemoryBankingRepository implements IBankingRepository {
  private readonly accounts = new Map<string, BankAccountEntity>();
  private readonly statements = new Map<string, BankStatementEntity>();
  private readonly transactions = new Map<string, BankTransactionEntity>();
  private readonly proposals = new Map<string, ProposalEntity>();
  private readonly exceptions = new Map<string, ExceptionItemEntity>();
  private readonly reconciliations = new Map<string, ReconciledTransactionEntity>();

  // Bank Accounts
  async createBankAccount(input: CreateBankAccountInput): Promise<BankAccountEntity> {
    const account: BankAccountEntity = {
      id: uuidv4(),
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
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.accounts.set(account.id, { ...account });
    return { ...account };
  }

  async findBankAccountById(tenantId: string, id: string): Promise<BankAccountEntity | null> {
    const acc = this.accounts.get(id);
    if (!acc || acc.tenantId !== tenantId) {
      return null;
    }
    return { ...acc };
  }

  async listBankAccounts(tenantId: string, activeOnly = false): Promise<BankAccountEntity[]> {
    return Array.from(this.accounts.values())
      .filter((a) => a.tenantId === tenantId && (!activeOnly || a.isActive))
      .map((a) => ({ ...a }));
  }

  async updateBankAccountBalances(
    tenantId: string,
    id: string,
    currentBalanceCents: bigint,
    reconciledBalanceCents?: bigint,
  ): Promise<BankAccountEntity> {
    const acc = await this.findBankAccountById(tenantId, id);
    if (!acc) {
      throw new NotFoundError('Bank Account', id);
    }
    acc.currentBalanceCents = currentBalanceCents;
    if (reconciledBalanceCents !== undefined) {
      acc.reconciledBalanceCents = reconciledBalanceCents;
    }
    acc.updatedAt = new Date();
    acc.version += 1;
    this.accounts.set(acc.id, { ...acc });
    return { ...acc };
  }

  // Bank Statements
  async createBankStatement(input: CreateBankStatementInput): Promise<BankStatementEntity> {
    const statement: BankStatementEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      bankAccountId: input.bankAccountId,
      sourceDocumentId: input.sourceDocumentId,
      fileName: input.fileName,
      fileSha256: input.fileSha256,
      mimeType: input.mimeType,
      statementStartDate: input.statementStartDate,
      statementEndDate: input.statementEndDate,
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
      metadata: input.metadata,
      status: input.status || 'UPLOADED',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.statements.set(statement.id, { ...statement });
    return { ...statement };
  }

  async deleteBankStatement(tenantId: string, id: string): Promise<void> {
    const stmt = this.statements.get(id);
    if (stmt && stmt.tenantId === tenantId) {
      this.statements.delete(id);
    }
  }

  async findBankStatementById(tenantId: string, id: string): Promise<BankStatementEntity | null> {
    const stmt = this.statements.get(id);
    if (!stmt || stmt.tenantId !== tenantId) {
      return null;
    }
    return { ...stmt };
  }

  async findBankStatementByHash(
    tenantId: string,
    fileSha256: string,
  ): Promise<BankStatementEntity | null> {
    for (const stmt of this.statements.values()) {
      if (stmt.tenantId === tenantId && stmt.fileSha256 === fileSha256) {
        return { ...stmt };
      }
    }
    return null;
  }

  async findBankStatementByPeriod(
    tenantId: string,
    bankAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<BankStatementEntity | null> {
    for (const stmt of this.statements.values()) {
      if (
        stmt.tenantId === tenantId &&
        stmt.bankAccountId === bankAccountId &&
        stmt.statementStartDate === startDate &&
        stmt.statementEndDate === endDate
      ) {
        return { ...stmt };
      }
    }
    return null;
  }

  async listBankStatements(
    tenantId: string,
    bankAccountId?: string,
  ): Promise<BankStatementEntity[]> {
    return Array.from(this.statements.values())
      .filter(
        (s) => s.tenantId === tenantId && (!bankAccountId || s.bankAccountId === bankAccountId),
      )
      .map((s) => ({ ...s }));
  }

  async updateBankStatementStatus(
    tenantId: string,
    id: string,
    status: BankStatementStatus,
    errorMessage?: string,
  ): Promise<BankStatementEntity> {
    const stmt = await this.findBankStatementById(tenantId, id);
    if (!stmt) {
      throw new NotFoundError('Bank Statement', id);
    }
    stmt.status = status;
    if (errorMessage !== undefined) {
      stmt.errorMessage = errorMessage;
    }
    stmt.updatedAt = new Date();
    stmt.version += 1;
    this.statements.set(stmt.id, { ...stmt });
    return { ...stmt };
  }

  async incrementStatementRetryCount(tenantId: string, id: string): Promise<BankStatementEntity> {
    const stmt = await this.findBankStatementById(tenantId, id);
    if (!stmt) {
      throw new NotFoundError('Bank Statement', id);
    }
    stmt.retryCount += 1;
    stmt.updatedAt = new Date();
    this.statements.set(stmt.id, { ...stmt });
    return { ...stmt };
  }

  // Bank Transactions
  async createBankTransactions(
    inputs: CreateBankTransactionInput[],
  ): Promise<BankTransactionEntity[]> {
    const results: BankTransactionEntity[] = [];
    for (const input of inputs) {
      const tx: BankTransactionEntity = {
        id: uuidv4(),
        tenantId: input.tenantId,
        bankStatementId: input.bankStatementId,
        bankAccountId: input.bankAccountId,
        pageNumber: input.pageNumber || 1,
        sourceSequence: input.sourceSequence || 1,
        sourceRowIndex: input.sourceRowIndex || 0,
        transactionDate: input.transactionDate,
        valueDate: input.valueDate,
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
        sourceEvidence: input.sourceEvidence,
        transactionFingerprint: input.transactionFingerprint,
        referenceNumber: input.referenceNumber,
        transactionHash: input.transactionHash,
        status: 'UNRECONCILED',
        createdAt: new Date(),
      };
      this.transactions.set(tx.id, { ...tx });
      results.push({ ...tx });
    }
    return results;
  }

  async findBankTransactionById(
    tenantId: string,
    id: string,
  ): Promise<BankTransactionEntity | null> {
    const tx = this.transactions.get(id);
    if (!tx || tx.tenantId !== tenantId) {
      return null;
    }
    return { ...tx };
  }

  async findBankTransactionByHash(
    tenantId: string,
    bankAccountId: string,
    transactionHash: string,
  ): Promise<BankTransactionEntity | null> {
    for (const tx of this.transactions.values()) {
      if (
        tx.tenantId === tenantId &&
        tx.bankAccountId === bankAccountId &&
        tx.transactionHash === transactionHash
      ) {
        return { ...tx };
      }
    }
    return null;
  }

  async findBankTransactionsByHashes(
    tenantId: string,
    bankAccountId: string,
    transactionHashes: string[],
  ): Promise<Map<string, BankTransactionEntity>> {
    const hashSet = new Set(transactionHashes);
    const result = new Map<string, BankTransactionEntity>();
    for (const tx of this.transactions.values()) {
      if (
        tx.tenantId === tenantId &&
        tx.bankAccountId === bankAccountId &&
        hashSet.has(tx.transactionHash)
      ) {
        result.set(tx.transactionHash, { ...tx });
      }
    }
    return result;
  }

  async listTransactionsByStatementId(
    tenantId: string,
    statementId: string,
  ): Promise<BankTransactionEntity[]> {
    return Array.from(this.transactions.values())
      .filter((t) => t.tenantId === tenantId && t.bankStatementId === statementId)
      .sort((a, b) => a.sourceSequence - b.sourceSequence)
      .map((t) => ({ ...t }));
  }

  async listTransactions(
    tenantId: string,
    options?: { bankAccountId?: string; status?: BankTransactionStatus },
  ): Promise<BankTransactionEntity[]> {
    return Array.from(this.transactions.values())
      .filter((t) => {
        if (t.tenantId !== tenantId) {
          return false;
        }
        if (options?.bankAccountId && t.bankAccountId !== options.bankAccountId) {
          return false;
        }
        if (options?.status && t.status !== options.status) {
          return false;
        }
        return true;
      })
      .map((t) => ({ ...t }));
  }

  async updateTransactionStatus(
    tenantId: string,
    id: string,
    status: BankTransactionStatus,
  ): Promise<BankTransactionEntity> {
    const tx = await this.findBankTransactionById(tenantId, id);
    if (!tx) {
      throw new NotFoundError('Bank Transaction', id);
    }
    tx.status = status;
    this.transactions.set(tx.id, { ...tx });
    return { ...tx };
  }

  async updateTransactionStatuses(
    tenantId: string,
    ids: string[],
    status: BankTransactionStatus,
  ): Promise<void> {
    const idSet = new Set(ids);
    for (const [id, tx] of this.transactions.entries()) {
      if (tx.tenantId === tenantId && idSet.has(id)) {
        this.transactions.set(id, { ...tx, status });
      }
    }
  }

  // Proposals
  async createProposal(input: CreateProposalInput): Promise<ProposalEntity> {
    const prop: ProposalEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      bankTransactionId: input.bankTransactionId,
      invoiceId: input.invoiceId,
      counterpartyId: input.counterpartyId,
      proposalType: input.proposalType,
      debitAccountId: input.debitAccountId,
      creditAccountId: input.creditAccountId,
      amountCents: input.amountCents,
      confidenceScore: input.confidenceScore,
      evidence: input.evidence,
      rationale: input.rationale,
      status: 'PROPOSED',
      autoPostEligible: input.autoPostEligible,
      createdAt: new Date(),
    };
    this.proposals.set(prop.id, { ...prop });
    return { ...prop };
  }

  async createProposals(inputs: CreateProposalInput[]): Promise<ProposalEntity[]> {
    const results: ProposalEntity[] = [];
    for (const input of inputs) {
      const prop: ProposalEntity = {
        id: uuidv4(),
        tenantId: input.tenantId,
        bankTransactionId: input.bankTransactionId,
        invoiceId: input.invoiceId,
        counterpartyId: input.counterpartyId,
        proposalType: input.proposalType,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        amountCents: input.amountCents,
        confidenceScore: input.confidenceScore,
        evidence: input.evidence,
        rationale: input.rationale,
        status: 'PROPOSED',
        autoPostEligible: input.autoPostEligible,
        createdAt: new Date(),
      };
      this.proposals.set(prop.id, { ...prop });
      results.push({ ...prop });
    }
    return results;
  }

  async findProposalById(tenantId: string, id: string): Promise<ProposalEntity | null> {
    const p = this.proposals.get(id);
    if (!p || p.tenantId !== tenantId) {
      return null;
    }
    return { ...p };
  }

  async findProposalByTransactionId(
    tenantId: string,
    transactionId: string,
  ): Promise<ProposalEntity | null> {
    for (const p of this.proposals.values()) {
      if (p.tenantId === tenantId && p.bankTransactionId === transactionId) {
        return { ...p };
      }
    }
    return null;
  }

  async listProposals(tenantId: string, status?: ProposalStatus): Promise<ProposalEntity[]> {
    return Array.from(this.proposals.values())
      .filter((p) => p.tenantId === tenantId && (!status || p.status === status))
      .map((p) => ({ ...p }));
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
    const p = await this.findProposalById(tenantId, id);
    if (!p) {
      throw new NotFoundError('Proposal', id);
    }
    p.status = status;
    if (options?.userId) {
      p.resolvedByUserId = options.userId;
      p.resolvedAt = new Date();
    }
    if (options?.postedJournalEntryId) {
      p.postedJournalEntryId = options.postedJournalEntryId;
    }
    if (options?.modifications?.debitAccountId) {
      p.debitAccountId = options.modifications.debitAccountId;
    }
    if (options?.modifications?.creditAccountId) {
      p.creditAccountId = options.modifications.creditAccountId;
    }
    this.proposals.set(p.id, { ...p });
    return { ...p };
  }

  // Exception Items
  async createExceptionItem(input: CreateExceptionInput): Promise<ExceptionItemEntity> {
    const exc: ExceptionItemEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      exceptionType: input.exceptionType,
      severity: input.severity,
      reason: input.reason,
      evidence: input.evidence,
      proposedResolution: input.proposedResolution,
      status: 'OPEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.exceptions.set(exc.id, { ...exc });
    return { ...exc };
  }

  async createExceptionItems(inputs: CreateExceptionInput[]): Promise<ExceptionItemEntity[]> {
    const results: ExceptionItemEntity[] = [];
    for (const input of inputs) {
      const exc: ExceptionItemEntity = {
        id: uuidv4(),
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        exceptionType: input.exceptionType,
        severity: input.severity,
        reason: input.reason,
        evidence: input.evidence,
        proposedResolution: input.proposedResolution,
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.exceptions.set(exc.id, { ...exc });
      results.push({ ...exc });
    }
    return results;
  }

  async findExceptionItemById(tenantId: string, id: string): Promise<ExceptionItemEntity | null> {
    const e = this.exceptions.get(id);
    if (!e || e.tenantId !== tenantId) {
      return null;
    }
    return { ...e };
  }

  async listExceptionItems(
    tenantId: string,
    options?: { status?: ExceptionStatus; severity?: ExceptionSeverity },
  ): Promise<ExceptionItemEntity[]> {
    return Array.from(this.exceptions.values())
      .filter((e) => {
        if (e.tenantId !== tenantId) {
          return false;
        }
        if (options?.status && e.status !== options.status) {
          return false;
        }
        if (options?.severity && e.severity !== options.severity) {
          return false;
        }
        return true;
      })
      .map((e) => ({ ...e }));
  }

  async updateExceptionStatus(
    tenantId: string,
    id: string,
    status: ExceptionStatus,
    resolvedByUserId?: string,
  ): Promise<ExceptionItemEntity> {
    const exc = await this.findExceptionItemById(tenantId, id);
    if (!exc) {
      throw new NotFoundError('Exception Item', id);
    }
    exc.status = status;
    if (resolvedByUserId) {
      exc.resolvedByUserId = resolvedByUserId;
      exc.resolvedAt = new Date();
    }
    exc.updatedAt = new Date();
    this.exceptions.set(exc.id, { ...exc });
    return { ...exc };
  }

  // Reconciled Transactions
  async createReconciledTransaction(input: {
    tenantId: string;
    bankTransactionId: string;
    journalEntryId: string;
    reconciliationMethod: ReconciliationMethod;
    confidenceScore?: number;
    reconciledByUserId?: string;
  }): Promise<ReconciledTransactionEntity> {
    const recon: ReconciledTransactionEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      bankTransactionId: input.bankTransactionId,
      journalEntryId: input.journalEntryId,
      reconciliationMethod: input.reconciliationMethod,
      confidenceScore: input.confidenceScore,
      reconciledByUserId: input.reconciledByUserId,
      reconciledAt: new Date(),
    };
    this.reconciliations.set(recon.bankTransactionId, { ...recon });
    return { ...recon };
  }

  async findReconciliationByTransactionId(
    tenantId: string,
    bankTransactionId: string,
  ): Promise<ReconciledTransactionEntity | null> {
    const r = this.reconciliations.get(bankTransactionId);
    if (!r || r.tenantId !== tenantId) {
      return null;
    }
    return { ...r };
  }
}
