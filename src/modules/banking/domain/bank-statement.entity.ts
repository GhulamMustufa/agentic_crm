export type BankStatementStatus =
  'UPLOADED' | 'PROCESSING' | 'PARSED' | 'RECONCILED' | 'FAILED' | 'EXCEPTION' | 'NEEDS_REVIEW';

export interface BankStatementEntity {
  id: string;
  tenantId: string;
  bankAccountId: string | null;
  sourceDocumentId?: string;
  fileName: string;
  fileSha256: string;
  mimeType: string;
  statementStartDate: string; // YYYY-MM-DD
  statementEndDate: string; // YYYY-MM-DD
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  totalDebitsCents: bigint;
  totalCreditsCents: bigint;
  status: BankStatementStatus;
  retryCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
