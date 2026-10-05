import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ConflictError, NotFoundError } from '../../../core/errors/app-error';

import type { AccountEntity } from '../domain/account.entity';
import type { AccountBalanceEntity } from '../domain/balance.entity';
import type { JournalEntryEntity, JournalEntryStatus } from '../domain/journal-entry.entity';
import type {
  ILedgerRepository,
  CreateAccountInput,
  CreateJournalEntryInput,
} from '../domain/ledger.repository.interface';
import type {
  FiscalYearEntity,
  AccountingPeriodEntity,
  AccountingPeriodStatus,
} from '../domain/period.entity';

@Injectable()
export class InMemoryLedgerRepository implements ILedgerRepository {
  private readonly accounts = new Map<string, AccountEntity>();
  private readonly fiscalYears = new Map<string, FiscalYearEntity>();
  private readonly periods = new Map<string, AccountingPeriodEntity>();
  private readonly journalEntries = new Map<string, JournalEntryEntity>();
  private readonly balances = new Map<string, AccountBalanceEntity>();

  // Accounts
  async createAccount(input: CreateAccountInput): Promise<AccountEntity> {
    const existing = await this.findAccountByCode(input.tenantId, input.accountCode);
    if (existing) {
      throw new ConflictError(
        `Account code '${input.accountCode}' already exists for this organization`,
      );
    }

    const now = new Date();
    const account: AccountEntity = {
      id: uuidv4(),
      tenantId: input.tenantId,
      accountCode: input.accountCode.trim(),
      name: input.name.trim(),
      classification: input.classification,
      subClassification: input.subClassification,
      parentAccountId: input.parentAccountId,
      isActive: true,
      isSystemLocked: input.isSystemLocked ?? false,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.accounts.set(account.id, { ...account });
    return { ...account };
  }

  async findAccountById(tenantId: string, accountId: string): Promise<AccountEntity | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.tenantId !== tenantId) {
      return null;
    }
    return { ...account };
  }

  async findAccountByCode(tenantId: string, accountCode: string): Promise<AccountEntity | null> {
    for (const account of this.accounts.values()) {
      if (
        account.tenantId === tenantId &&
        account.accountCode.toLowerCase() === accountCode.toLowerCase()
      ) {
        return { ...account };
      }
    }
    return null;
  }

  async listAccounts(tenantId: string, activeOnly = false): Promise<AccountEntity[]> {
    return Array.from(this.accounts.values())
      .filter((a) => a.tenantId === tenantId && (!activeOnly || a.isActive))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
      .map((a) => ({ ...a }));
  }

  async updateAccount(
    tenantId: string,
    accountId: string,
    updates: Partial<Pick<AccountEntity, 'name' | 'subClassification' | 'isActive'>>,
  ): Promise<AccountEntity> {
    const account = await this.findAccountById(tenantId, accountId);
    if (!account) {
      throw new NotFoundError('Account', accountId);
    }

    const updated: AccountEntity = {
      ...account,
      ...updates,
      updatedAt: new Date(),
      version: account.version + 1,
    };

    this.accounts.set(accountId, { ...updated });
    return { ...updated };
  }

  // Periods & Fiscal Years
  async createFiscalYear(
    input: Omit<FiscalYearEntity, 'id' | 'createdAt'>,
  ): Promise<FiscalYearEntity> {
    const existing = await this.findFiscalYearByLabel(input.tenantId, input.yearLabel);
    if (existing) {
      throw new ConflictError(`Fiscal year '${input.yearLabel}' already exists`);
    }

    const fy: FiscalYearEntity = {
      id: uuidv4(),
      ...input,
      createdAt: new Date(),
    };

    this.fiscalYears.set(fy.id, { ...fy });
    return { ...fy };
  }

  async findFiscalYearByLabel(
    tenantId: string,
    yearLabel: string,
  ): Promise<FiscalYearEntity | null> {
    for (const fy of this.fiscalYears.values()) {
      if (fy.tenantId === tenantId && fy.yearLabel === yearLabel) {
        return { ...fy };
      }
    }
    return null;
  }

  async createPeriod(
    input: Omit<AccountingPeriodEntity, 'id' | 'createdAt'>,
  ): Promise<AccountingPeriodEntity> {
    const period: AccountingPeriodEntity = {
      id: uuidv4(),
      ...input,
      createdAt: new Date(),
    };

    this.periods.set(period.id, { ...period });
    return { ...period };
  }

  async findPeriodById(tenantId: string, periodId: string): Promise<AccountingPeriodEntity | null> {
    const period = this.periods.get(periodId);
    if (!period || period.tenantId !== tenantId) {
      return null;
    }
    return { ...period };
  }

  async findPeriodByDate(tenantId: string, date: string): Promise<AccountingPeriodEntity | null> {
    for (const period of this.periods.values()) {
      if (period.tenantId === tenantId && date >= period.startDate && date <= period.endDate) {
        return { ...period };
      }
    }
    return null;
  }

  async listPeriods(tenantId: string, fiscalYearId?: string): Promise<AccountingPeriodEntity[]> {
    return Array.from(this.periods.values())
      .filter((p) => p.tenantId === tenantId && (!fiscalYearId || p.fiscalYearId === fiscalYearId))
      .sort((a, b) => a.periodNumber - b.periodNumber)
      .map((p) => ({ ...p }));
  }

  async updatePeriodStatus(
    tenantId: string,
    periodId: string,
    status: AccountingPeriodStatus,
    closedByUserId?: string,
  ): Promise<AccountingPeriodEntity> {
    const period = await this.findPeriodById(tenantId, periodId);
    if (!period) {
      throw new NotFoundError('Accounting Period', periodId);
    }

    const updated: AccountingPeriodEntity = {
      ...period,
      status,
      closedAt: status === 'CLOSED' ? new Date() : undefined,
      closedByUserId: status === 'CLOSED' ? closedByUserId : undefined,
    };

    this.periods.set(periodId, { ...updated });
    return { ...updated };
  }

  // Journal Entries
  async createEntry(input: CreateJournalEntryInput): Promise<JournalEntryEntity> {
    const existing = await this.findEntryByNumber(input.tenantId, input.entryNumber);
    if (existing) {
      throw new ConflictError(`Journal entry '${input.entryNumber}' already exists`);
    }

    const entryId = uuidv4();
    const now = new Date();

    const lines = input.lines.map((l) => ({
      id: uuidv4(),
      tenantId: input.tenantId,
      journalEntryId: entryId,
      accountId: l.accountId,
      lineNumber: l.lineNumber,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      memo: l.memo,
      createdAt: now,
    }));

    const entry: JournalEntryEntity = {
      id: entryId,
      tenantId: input.tenantId,
      accountingPeriodId: input.accountingPeriodId,
      entryNumber: input.entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      status: input.status,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversesEntryId: input.reversesEntryId,
      totalDebitCents: input.totalDebitCents,
      totalCreditCents: input.totalCreditCents,
      createdByUserId: input.createdByUserId,
      createdByAgentId: input.createdByAgentId,
      postedAt: input.postedAt,
      createdAt: now,
      lines,
    };

    this.journalEntries.set(entryId, { ...entry, lines: [...lines] });
    return { ...entry, lines: [...lines] };
  }

  async findEntryById(tenantId: string, entryId: string): Promise<JournalEntryEntity | null> {
    const entry = this.journalEntries.get(entryId);
    if (!entry || entry.tenantId !== tenantId) {
      return null;
    }
    return { ...entry, lines: entry.lines.map((l) => ({ ...l })) };
  }

  async findEntryByNumber(
    tenantId: string,
    entryNumber: string,
  ): Promise<JournalEntryEntity | null> {
    for (const entry of this.journalEntries.values()) {
      if (
        entry.tenantId === tenantId &&
        entry.entryNumber.toLowerCase() === entryNumber.toLowerCase()
      ) {
        return { ...entry, lines: entry.lines.map((l) => ({ ...l })) };
      }
    }
    return null;
  }

  async listEntries(
    tenantId: string,
    options?: { periodId?: string; status?: JournalEntryStatus },
  ): Promise<JournalEntryEntity[]> {
    return Array.from(this.journalEntries.values())
      .filter((e) => {
        if (e.tenantId !== tenantId) {
          return false;
        }
        if (options?.periodId && e.accountingPeriodId !== options.periodId) {
          return false;
        }
        if (options?.status && e.status !== options.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
      .map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
  }

  async updateEntryStatus(
    tenantId: string,
    entryId: string,
    status: JournalEntryStatus,
    reversedByEntryId?: string,
  ): Promise<JournalEntryEntity> {
    const entry = await this.findEntryById(tenantId, entryId);
    if (!entry) {
      throw new NotFoundError('Journal Entry', entryId);
    }

    const updated: JournalEntryEntity = {
      ...entry,
      status,
      reversedByEntryId: reversedByEntryId ?? entry.reversedByEntryId,
      postedAt: status === 'POSTED' ? (entry.postedAt ?? new Date()) : entry.postedAt,
    };

    this.journalEntries.set(entryId, { ...updated });
    return { ...updated };
  }

  // Balances
  private balanceKey(tenantId: string, accountId: string, periodId: string): string {
    return `${tenantId}:${accountId}:${periodId}`;
  }

  async upsertBalance(
    balance: Omit<AccountBalanceEntity, 'id' | 'updatedAt'>,
  ): Promise<AccountBalanceEntity> {
    const key = this.balanceKey(balance.tenantId, balance.accountId, balance.accountingPeriodId);
    const existing = this.balances.get(key);

    const record: AccountBalanceEntity = {
      id: existing ? existing.id : uuidv4(),
      ...balance,
      updatedAt: new Date(),
    };

    this.balances.set(key, { ...record });
    return { ...record };
  }

  async findBalance(
    tenantId: string,
    accountId: string,
    periodId: string,
  ): Promise<AccountBalanceEntity | null> {
    const key = this.balanceKey(tenantId, accountId, periodId);
    const balance = this.balances.get(key);
    return balance ? { ...balance } : null;
  }

  async listBalancesForPeriod(tenantId: string, periodId: string): Promise<AccountBalanceEntity[]> {
    return Array.from(this.balances.values())
      .filter((b) => b.tenantId === tenantId && b.accountingPeriodId === periodId)
      .map((b) => ({ ...b }));
  }
}
