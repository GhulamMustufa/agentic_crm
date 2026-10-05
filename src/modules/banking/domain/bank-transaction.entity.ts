export type BankTransactionStatus =
  'UNRECONCILED' | 'PROPOSED' | 'MATCHED' | 'RECONCILED' | 'EXCLUDED' | 'FLAGGED';

export interface BankTransactionEntity {
  id: string;
  tenantId: string;
  bankStatementId: string;
  bankAccountId: string;
  transactionDate: string; // YYYY-MM-DD
  amountCents: bigint; // Negative for debits/withdrawals, positive for deposits/credits
  rawDescription: string;
  normalizedPayee?: string;
  referenceNumber?: string;
  transactionHash: string; // SHA-256(tenant_id + bank_account_id + date + amount + description)
  status: BankTransactionStatus;
  createdAt: Date;
}
