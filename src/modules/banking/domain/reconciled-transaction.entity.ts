export type ReconciliationMethod = 'AUTO_HIGH_CONFIDENCE' | 'HUMAN_APPROVED' | 'MANUAL_MATCH';

export interface ReconciledTransactionEntity {
  id: string;
  tenantId: string;
  bankTransactionId: string;
  journalEntryId: string;
  reconciliationMethod: ReconciliationMethod;
  confidenceScore?: number;
  reconciledByUserId?: string;
  reconciledAt: Date;
}
