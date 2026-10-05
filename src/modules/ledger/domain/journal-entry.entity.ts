export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type JournalEntrySourceType =
  'MANUAL' | 'INVOICE' | 'BILL' | 'PAYMENT' | 'PAYROLL' | 'BANK_RECONCILIATION' | 'INVENTORY';

export interface JournalEntryLineEntity {
  id: string;
  tenantId: string;
  journalEntryId: string;
  accountId: string;
  lineNumber: number;
  debitCents: bigint;
  creditCents: bigint;
  memo?: string;
  createdAt: Date;
}

export interface JournalEntryEntity {
  id: string;
  tenantId: string;
  accountingPeriodId: string;
  entryNumber: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  status: JournalEntryStatus;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  createdByUserId?: string;
  createdByAgentId?: string;
  postedAt?: Date;
  createdAt: Date;
  lines: JournalEntryLineEntity[];
}
