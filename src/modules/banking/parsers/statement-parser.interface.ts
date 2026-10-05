export interface ParsedTransactionLine {
  date: string; // YYYY-MM-DD
  amountCents: bigint; // Negative for debits/withdrawals, positive for credits/deposits
  description: string;
  referenceNumber?: string;
}

export interface ParsedStatementResult {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  totalDebitsCents: bigint;
  totalCreditsCents: bigint;
  transactions: ParsedTransactionLine[];
}

export interface IStatementParser {
  parse(content: string | Buffer): Promise<ParsedStatementResult>;
}
