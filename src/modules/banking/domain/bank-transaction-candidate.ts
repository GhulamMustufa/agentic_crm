export interface BankTransactionCandidate {
  sourceSequence: number;
  pageNumber: number;
  sourceRowIndex?: number;
  transactionDate: string; // YYYY-MM-DD
  valueDate?: string; // YYYY-MM-DD
  direction: 'DEBIT' | 'CREDIT';
  amountCents: bigint; // Signed: negative for debit/outflow, positive for credit/inflow
  signedAmountCents: bigint;
  runningBalanceCents?: bigint;
  rawPrimaryText: string;
  rawContinuationText?: string;
  rawReferenceText?: string;
  bankReference?: string;
  counterpartyAccount?: string;
  description: string;
  normalizedPayee?: string;
  referenceNumber?: string;
  categorySuggestion?: string;
  extractionMethod: 'DETERMINISTIC_LAYOUT' | 'BANK_ADAPTER' | 'AI_VISION';
  extractionConfidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceEvidence?: Record<string, unknown>;
}
