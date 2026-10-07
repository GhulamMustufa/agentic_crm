export type BankTransactionStatus =
  'UNRECONCILED' | 'PROPOSED' | 'MATCHED' | 'RECONCILED' | 'EXCLUDED' | 'FLAGGED';

export interface BankTransactionEntity {
  id: string;
  tenantId: string;
  bankStatementId: string;
  bankAccountId: string;
  pageNumber: number;
  sourceSequence: number;
  sourceRowIndex: number;
  transactionDate: string; // YYYY-MM-DD
  valueDate?: string; // YYYY-MM-DD
  direction: 'DEBIT' | 'CREDIT';
  amountCents: bigint; // Absolute amount in cents
  signedAmountCents: bigint; // Negative for debits/withdrawals, positive for deposits/credits
  runningBalanceCents?: bigint;
  rawDescription: string;
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
  transactionHash: string; // SHA-256 fingerprint
  status: BankTransactionStatus;
  createdAt: Date;
}
