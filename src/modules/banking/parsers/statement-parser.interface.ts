export interface ParsedTransactionLine {
  date: string; // YYYY-MM-DD
  amountCents: bigint; // Signed: Negative for debits/withdrawals, positive for credits/deposits
  description: string;
  referenceNumber?: string;
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
  extractionMethod?: string;
  extractionConfidence?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceEvidence?: Record<string, unknown>;
}

export interface ParsedStatementResult {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  totalDebitsCents: bigint;
  totalCreditsCents: bigint;
  transactions: ParsedTransactionLine[];
  bankName?: string;
  accountType?: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
  accountNumberLast4?: string;
  pageCount?: number;
  extractionMode?: string;
  bankDetected?: string;
  formatDetected?: string;
  parserVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface IStatementParser {
  parse(content: string | Buffer): Promise<ParsedStatementResult>;
}
