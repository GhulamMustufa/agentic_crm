import type { BankAccountEntity, BankAccountType } from './bank-account.entity';
import type { BankStatementEntity, BankStatementStatus } from './bank-statement.entity';
import type { BankTransactionEntity, BankTransactionStatus } from './bank-transaction.entity';
import type {
  ExceptionItemEntity,
  ExceptionStatus,
  ExceptionSeverity,
  ExceptionType,
} from './exception-item.entity';
import type {
  ProposalEntity,
  ProposalStatus,
  ProposalType,
  AiDecisionEvidence,
} from './proposal.entity';
import type {
  ReconciledTransactionEntity,
  ReconciliationMethod,
} from './reconciled-transaction.entity';

export const BANKING_REPOSITORY_TOKEN = Symbol('IBankingRepository');

export interface CreateBankAccountInput {
  tenantId: string;
  ledgerAccountId: string;
  accountName: string;
  institutionName: string;
  accountType: BankAccountType;
  currency?: string;
  accountNumberLast4: string;
}

export interface CreateBankStatementInput {
  tenantId: string;
  bankAccountId: string | null;
  sourceDocumentId?: string;
  fileName: string;
  fileSha256: string;
  mimeType: string;
  statementStartDate: string;
  statementEndDate: string;
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  totalDebitsCents: bigint;
  totalCreditsCents: bigint;
  pageCount?: number;
  extractionMode?: string;
  bankDetected?: string;
  formatDetected?: string;
  parserVersion?: string;
  bankAdapterVersion?: string;
  extractionPromptVersion?: string;
  aiModelVersion?: string;
  validationStatus?: string;
  reprocessingOfId?: string;
  metadata?: Record<string, unknown>;
  status?: BankStatementStatus;
}

export interface CreateBankTransactionInput {
  tenantId: string;
  bankStatementId: string;
  bankAccountId: string;
  transactionDate: string;
  amountCents: bigint;
  rawDescription: string;
  pageNumber?: number;
  sourceSequence?: number;
  sourceRowIndex?: number;
  valueDate?: string;
  direction?: 'DEBIT' | 'CREDIT';
  signedAmountCents?: bigint;
  runningBalanceCents?: bigint;
  rawPrimaryText?: string;
  rawContinuationText?: string;
  rawReferenceText?: string;
  bankReference?: string;
  counterpartyAccount?: string;
  normalizedPayee?: string;
  normalizedDescription?: string;
  categorySuggestion?: string;
  extractionMethod?: string;
  extractionConfidence?: number;
  entityResolutionConfidence?: number;
  accountingConfidence?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceEvidence?: Record<string, unknown>;
  transactionFingerprint?: string;
  referenceNumber?: string;
  transactionHash: string;
}

export interface CreateProposalInput {
  tenantId: string;
  bankTransactionId: string;
  invoiceId?: string;
  counterpartyId?: string;
  proposalType: ProposalType;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: bigint;
  confidenceScore: number;
  evidence: AiDecisionEvidence[];
  rationale: string;
  autoPostEligible: boolean;
}

export interface CreateExceptionInput {
  tenantId: string;
  entityType: 'STATEMENT' | 'BANK_TRANSACTION' | 'PROPOSAL' | 'INVOICE';
  entityId: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  reason: string;
  evidence?: unknown[];
  proposedResolution?: Record<string, unknown>;
}

export interface IBankingRepository {
  // Bank Accounts
  createBankAccount(input: CreateBankAccountInput): Promise<BankAccountEntity>;
  findBankAccountById(tenantId: string, id: string): Promise<BankAccountEntity | null>;
  listBankAccounts(tenantId: string, activeOnly?: boolean): Promise<BankAccountEntity[]>;
  updateBankAccountBalances(
    tenantId: string,
    id: string,
    currentBalanceCents: bigint,
    reconciledBalanceCents?: bigint,
  ): Promise<BankAccountEntity>;

  // Bank Statements
  createBankStatement(input: CreateBankStatementInput): Promise<BankStatementEntity>;
  findBankStatementById(tenantId: string, id: string): Promise<BankStatementEntity | null>;
  findBankStatementByHash(
    tenantId: string,
    fileSha256: string,
  ): Promise<BankStatementEntity | null>;
  findBankStatementByPeriod(
    tenantId: string,
    bankAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<BankStatementEntity | null>;
  listBankStatements(tenantId: string, bankAccountId?: string): Promise<BankStatementEntity[]>;
  updateBankStatementStatus(
    tenantId: string,
    id: string,
    status: BankStatementStatus,
    errorMessage?: string,
  ): Promise<BankStatementEntity>;
  incrementStatementRetryCount(tenantId: string, id: string): Promise<BankStatementEntity>;
  deleteBankStatement(tenantId: string, id: string): Promise<void>;

  // Bank Transactions
  createBankTransactions(inputs: CreateBankTransactionInput[]): Promise<BankTransactionEntity[]>;
  findBankTransactionById(tenantId: string, id: string): Promise<BankTransactionEntity | null>;
  findBankTransactionByHash(
    tenantId: string,
    bankAccountId: string,
    transactionHash: string,
  ): Promise<BankTransactionEntity | null>;
  findBankTransactionsByHashes?(
    tenantId: string,
    bankAccountId: string,
    transactionHashes: string[],
  ): Promise<Map<string, BankTransactionEntity>>;
  listTransactionsByStatementId(
    tenantId: string,
    statementId: string,
  ): Promise<BankTransactionEntity[]>;
  listTransactions(
    tenantId: string,
    options?: { bankAccountId?: string; status?: BankTransactionStatus },
  ): Promise<BankTransactionEntity[]>;
  updateTransactionStatus(
    tenantId: string,
    id: string,
    status: BankTransactionStatus,
  ): Promise<BankTransactionEntity>;
  updateTransactionStatuses?(
    tenantId: string,
    ids: string[],
    status: BankTransactionStatus,
  ): Promise<void>;

  // Proposals
  createProposal(input: CreateProposalInput): Promise<ProposalEntity>;
  createProposals?(inputs: CreateProposalInput[]): Promise<ProposalEntity[]>;
  findProposalById(tenantId: string, id: string): Promise<ProposalEntity | null>;
  findProposalByTransactionId(
    tenantId: string,
    transactionId: string,
  ): Promise<ProposalEntity | null>;
  listProposals(tenantId: string, status?: ProposalStatus): Promise<ProposalEntity[]>;
  updateProposalStatus(
    tenantId: string,
    id: string,
    status: ProposalStatus,
    options?: {
      userId?: string;
      postedJournalEntryId?: string;
      modifications?: { debitAccountId?: string; creditAccountId?: string };
    },
  ): Promise<ProposalEntity>;

  // Exception Items
  createExceptionItem(input: CreateExceptionInput): Promise<ExceptionItemEntity>;
  createExceptionItems?(inputs: CreateExceptionInput[]): Promise<ExceptionItemEntity[]>;
  findExceptionItemById(tenantId: string, id: string): Promise<ExceptionItemEntity | null>;
  listExceptionItems(
    tenantId: string,
    options?: { status?: ExceptionStatus; severity?: ExceptionSeverity },
  ): Promise<ExceptionItemEntity[]>;
  updateExceptionStatus(
    tenantId: string,
    id: string,
    status: ExceptionStatus,
    resolvedByUserId?: string,
  ): Promise<ExceptionItemEntity>;

  // Reconciled Transactions
  createReconciledTransaction(input: {
    tenantId: string;
    bankTransactionId: string;
    journalEntryId: string;
    reconciliationMethod: ReconciliationMethod;
    confidenceScore?: number;
    reconciledByUserId?: string;
  }): Promise<ReconciledTransactionEntity>;
  findReconciliationByTransactionId(
    tenantId: string,
    bankTransactionId: string,
  ): Promise<ReconciledTransactionEntity | null>;
}
