import type { AccountEntity, AccountClassification } from './account.entity';
import type { AccountBalanceEntity } from './balance.entity';
import type {
  JournalEntryEntity,
  JournalEntryStatus,
  JournalEntrySourceType,
} from './journal-entry.entity';
import type {
  FiscalYearEntity,
  AccountingPeriodEntity,
  AccountingPeriodStatus,
} from './period.entity';

export const LEDGER_REPOSITORY_TOKEN = Symbol('LEDGER_REPOSITORY_TOKEN');

export interface CreateAccountInput {
  tenantId: string;
  accountCode: string;
  name: string;
  classification: AccountClassification;
  subClassification?: string;
  parentAccountId?: string;
  isSystemLocked?: boolean;
}

export interface CreateJournalEntryInput {
  tenantId: string;
  accountingPeriodId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: JournalEntryStatus;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  reversesEntryId?: string;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  createdByUserId?: string;
  createdByAgentId?: string;
  postedAt?: Date;
  lines: Array<{
    accountId: string;
    lineNumber: number;
    debitCents: bigint;
    creditCents: bigint;
    memo?: string;
  }>;
}

export interface ILedgerRepository {
  // Accounts
  createAccount(input: CreateAccountInput): Promise<AccountEntity>;
  findAccountById(tenantId: string, accountId: string): Promise<AccountEntity | null>;
  findAccountByCode(tenantId: string, accountCode: string): Promise<AccountEntity | null>;
  listAccounts(tenantId: string, activeOnly?: boolean): Promise<AccountEntity[]>;
  updateAccount(
    tenantId: string,
    accountId: string,
    updates: Partial<Pick<AccountEntity, 'name' | 'subClassification' | 'isActive'>>,
  ): Promise<AccountEntity>;

  // Periods & Fiscal Years
  createFiscalYear(input: Omit<FiscalYearEntity, 'id' | 'createdAt'>): Promise<FiscalYearEntity>;
  findFiscalYearByLabel(tenantId: string, yearLabel: string): Promise<FiscalYearEntity | null>;
  createPeriod(
    input: Omit<AccountingPeriodEntity, 'id' | 'createdAt'>,
  ): Promise<AccountingPeriodEntity>;
  findPeriodById(tenantId: string, periodId: string): Promise<AccountingPeriodEntity | null>;
  findPeriodByDate(tenantId: string, date: string): Promise<AccountingPeriodEntity | null>;
  listPeriods(tenantId: string, fiscalYearId?: string): Promise<AccountingPeriodEntity[]>;
  updatePeriodStatus(
    tenantId: string,
    periodId: string,
    status: AccountingPeriodStatus,
    closedByUserId?: string,
  ): Promise<AccountingPeriodEntity>;

  // Journal Entries & Lines
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntryEntity>;
  findEntryById(tenantId: string, entryId: string): Promise<JournalEntryEntity | null>;
  findEntryByNumber(tenantId: string, entryNumber: string): Promise<JournalEntryEntity | null>;
  listEntries(
    tenantId: string,
    options?: { periodId?: string; status?: JournalEntryStatus },
  ): Promise<JournalEntryEntity[]>;
  updateEntryStatus(
    tenantId: string,
    entryId: string,
    status: JournalEntryStatus,
    reversedByEntryId?: string,
  ): Promise<JournalEntryEntity>;

  // Balances
  upsertBalance(
    balance: Omit<AccountBalanceEntity, 'id' | 'updatedAt'>,
  ): Promise<AccountBalanceEntity>;
  findBalance(
    tenantId: string,
    accountId: string,
    periodId: string,
  ): Promise<AccountBalanceEntity | null>;
  listBalancesForPeriod(tenantId: string, periodId: string): Promise<AccountBalanceEntity[]>;
}
