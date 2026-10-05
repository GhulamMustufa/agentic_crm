import { Injectable } from '@nestjs/common';


import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';

import type { AccountEntity, AccountClassification } from '../domain/account.entity';
import type { AccountBalanceEntity } from '../domain/balance.entity';
import type {
  JournalEntryEntity,
  JournalEntryStatus,
  JournalEntrySourceType,
} from '../domain/journal-entry.entity';
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
import type {
  ChartOfAccount,
  FiscalYear,
  AccountingPeriod,
  JournalEntry,
  JournalEntryLine,
  AccountMonthlyBalance,
} from '@prisma/client';

@Injectable()
export class PrismaLedgerRepository implements ILedgerRepository {
  private readonly knownTenants = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTenantExists(tenantId: string): Promise<void> {
    if (this.knownTenants.has(tenantId)) {
      return;
    }
    await this.prisma.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: `Tenant ${tenantId}`,
      },
    });
    this.knownTenants.add(tenantId);
  }

  private toAccountEntity(model: ChartOfAccount): AccountEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      accountCode: model.accountCode,
      name: model.name,
      classification: model.classification as AccountClassification,
      subClassification: model.subClassification || undefined,
      parentAccountId: model.parentAccountId || undefined,
      isActive: model.isActive,
      isSystemLocked: model.isSystemLocked,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      version: model.version,
    };
  }

  private toFiscalYearEntity(model: FiscalYear): FiscalYearEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      yearLabel: model.yearLabel,
      startDate: model.startDate.toISOString().split('T')[0] ?? '',
      endDate: model.endDate.toISOString().split('T')[0] ?? '',
      isClosed: model.isClosed,
      createdAt: model.createdAt,
    };
  }

  private toAccountingPeriodEntity(model: AccountingPeriod): AccountingPeriodEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      fiscalYearId: model.fiscalYearId,
      periodNumber: model.periodNumber,
      periodName: model.periodName,
      startDate: model.startDate.toISOString().split('T')[0] ?? '',
      endDate: model.endDate.toISOString().split('T')[0] ?? '',
      status: model.status as AccountingPeriodStatus,
      closedAt: model.closedAt || undefined,
      closedByUserId: model.closedByUserId || undefined,
      createdAt: model.createdAt,
    };
  }

  private toJournalEntryEntity(
    model: JournalEntry & { lines?: JournalEntryLine[] },
  ): JournalEntryEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      accountingPeriodId: model.accountingPeriodId,
      entryNumber: model.entryNumber,
      entryDate: model.entryDate.toISOString().split('T')[0] ?? '',
      description: model.description,
      status: model.status as JournalEntryStatus,
      sourceType: model.sourceType as JournalEntrySourceType,
      sourceId: model.sourceId || undefined,
      reversesEntryId: model.reversesEntryId || undefined,
      totalDebitCents: model.totalDebitCents,
      totalCreditCents: model.totalCreditCents,
      createdByUserId: model.createdByUserId || undefined,
      createdByAgentId: model.createdByAgentId || undefined,
      postedAt: model.postedAt || undefined,
      createdAt: model.createdAt,
      lines: (model.lines || []).map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        journalEntryId: l.journalEntryId,
        accountId: l.accountId,
        lineNumber: l.lineNumber,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        memo: l.memo || undefined,
        createdAt: l.createdAt,
      })),
    };
  }

  private toBalanceEntity(model: AccountMonthlyBalance): AccountBalanceEntity {
    return {
      id: model.id,
      tenantId: model.tenantId,
      accountId: model.accountId,
      accountingPeriodId: model.accountingPeriodId,
      openingBalanceCents: model.openingBalanceCents,
      totalDebitCents: model.totalDebitCents,
      totalCreditCents: model.totalCreditCents,
      closingBalanceCents: model.closingBalanceCents,
      updatedAt: model.updatedAt,
    };
  }

  // Accounts
  async createAccount(input: CreateAccountInput): Promise<AccountEntity> {
    await this.ensureTenantExists(input.tenantId);
    const existing = await this.findAccountByCode(input.tenantId, input.accountCode);
    if (existing) {
      throw new ConflictError(
        `Account code '${input.accountCode}' already exists for this organization`,
      );
    }

    const created = await this.prisma.chartOfAccount.create({
      data: {
        tenantId: input.tenantId,
        accountCode: input.accountCode.trim(),
        name: input.name.trim(),
        classification: input.classification,
        subClassification: input.subClassification,
        parentAccountId: input.parentAccountId,
        isSystemLocked: input.isSystemLocked ?? false,
      },
    });

    return this.toAccountEntity(created);
  }

  async findAccountById(tenantId: string, accountId: string): Promise<AccountEntity | null> {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || account.tenantId !== tenantId) {
      return null;
    }
    return this.toAccountEntity(account);
  }

  async findAccountByCode(tenantId: string, accountCode: string): Promise<AccountEntity | null> {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: {
        tenantId_accountCode: {
          tenantId,
          accountCode: accountCode.trim(),
        },
      },
    });
    return account ? this.toAccountEntity(account) : null;
  }

  async listAccounts(tenantId: string, activeOnly = false): Promise<AccountEntity[]> {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { accountCode: 'asc' },
    });
    return accounts.map((a) => this.toAccountEntity(a));
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

    const updated = await this.prisma.chartOfAccount.update({
      where: { id: accountId },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.subClassification !== undefined
          ? { subClassification: updates.subClassification }
          : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        version: { increment: 1 },
      },
    });

    return this.toAccountEntity(updated);
  }

  // Periods & Fiscal Years
  async createFiscalYear(
    input: Omit<FiscalYearEntity, 'id' | 'createdAt'>,
  ): Promise<FiscalYearEntity> {
    await this.ensureTenantExists(input.tenantId);
    const existing = await this.findFiscalYearByLabel(input.tenantId, input.yearLabel);
    if (existing) {
      throw new ConflictError(`Fiscal year '${input.yearLabel}' already exists`);
    }

    const created = await this.prisma.fiscalYear.create({
      data: {
        tenantId: input.tenantId,
        yearLabel: input.yearLabel,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        isClosed: input.isClosed,
      },
    });

    return this.toFiscalYearEntity(created);
  }

  async findFiscalYearByLabel(
    tenantId: string,
    yearLabel: string,
  ): Promise<FiscalYearEntity | null> {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: {
        tenantId_yearLabel: {
          tenantId,
          yearLabel,
        },
      },
    });
    return fy ? this.toFiscalYearEntity(fy) : null;
  }

  async createPeriod(
    input: Omit<AccountingPeriodEntity, 'id' | 'createdAt'>,
  ): Promise<AccountingPeriodEntity> {
    await this.ensureTenantExists(input.tenantId);
    const created = await this.prisma.accountingPeriod.create({
      data: {
        tenantId: input.tenantId,
        fiscalYearId: input.fiscalYearId,
        periodNumber: input.periodNumber,
        periodName: input.periodName,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: input.status,
      },
    });

    return this.toAccountingPeriodEntity(created);
  }

  async findPeriodById(tenantId: string, periodId: string): Promise<AccountingPeriodEntity | null> {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period || period.tenantId !== tenantId) {
      return null;
    }
    return this.toAccountingPeriodEntity(period);
  }

  async findPeriodByDate(tenantId: string, dateStr: string): Promise<AccountingPeriodEntity | null> {
    const targetDate = new Date(dateStr);
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
    });
    return period ? this.toAccountingPeriodEntity(period) : null;
  }

  async listPeriods(tenantId: string, fiscalYearId?: string): Promise<AccountingPeriodEntity[]> {
    const periods = await this.prisma.accountingPeriod.findMany({
      where: {
        tenantId,
        ...(fiscalYearId ? { fiscalYearId } : {}),
      },
      orderBy: { periodNumber: 'asc' },
    });
    return periods.map((p) => this.toAccountingPeriodEntity(p));
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

    const updated = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status,
        closedAt: status === 'CLOSED' ? new Date() : null,
        closedByUserId: status === 'CLOSED' ? closedByUserId : null,
      },
    });

    return this.toAccountingPeriodEntity(updated);
  }

  // Journal Entries
  async createEntry(input: CreateJournalEntryInput): Promise<JournalEntryEntity> {
    await this.ensureTenantExists(input.tenantId);
    const existing = await this.findEntryByNumber(input.tenantId, input.entryNumber);
    if (existing) {
      throw new ConflictError(`Journal entry '${input.entryNumber}' already exists`);
    }

    const created = await this.prisma.journalEntry.create({
      data: {
        tenantId: input.tenantId,
        accountingPeriodId: input.accountingPeriodId,
        entryNumber: input.entryNumber,
        entryDate: new Date(input.entryDate),
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
        lines: {
          create: input.lines.map((l) => ({
            tenantId: input.tenantId,
            accountId: l.accountId,
            lineNumber: l.lineNumber,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            memo: l.memo,
          })),
        },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.toJournalEntryEntity(created);
  }

  async findEntryById(tenantId: string, entryId: string): Promise<JournalEntryEntity | null> {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    if (!entry || entry.tenantId !== tenantId) {
      return null;
    }
    return this.toJournalEntryEntity(entry);
  }

  async findEntryByNumber(
    tenantId: string,
    entryNumber: string,
  ): Promise<JournalEntryEntity | null> {
    const entry = await this.prisma.journalEntry.findUnique({
      where: {
        tenantId_entryNumber: {
          tenantId,
          entryNumber,
        },
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    return entry ? this.toJournalEntryEntity(entry) : null;
  }

  async listEntries(
    tenantId: string,
    options?: { periodId?: string; status?: JournalEntryStatus },
  ): Promise<JournalEntryEntity[]> {
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        tenantId,
        ...(options?.periodId ? { accountingPeriodId: options.periodId } : {}),
        ...(options?.status ? { status: options.status } : {}),
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
      orderBy: { entryDate: 'desc' },
    });
    return entries.map((e) => this.toJournalEntryEntity(e));
  }

  async updateEntryStatus(
    tenantId: string,
    entryId: string,
    status: JournalEntryStatus,
    _reversedByEntryId?: string,
  ): Promise<JournalEntryEntity> {
    const entry = await this.findEntryById(tenantId, entryId);
    if (!entry) {
      throw new NotFoundError('Journal Entry', entryId);
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id: entryId },
      data: {
        status,
        ...(status === 'POSTED' && !entry.postedAt ? { postedAt: new Date() } : {}),
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    return this.toJournalEntryEntity(updated);
  }

  // Balances
  async upsertBalance(
    balance: Omit<AccountBalanceEntity, 'id' | 'updatedAt'>,
  ): Promise<AccountBalanceEntity> {
    await this.ensureTenantExists(balance.tenantId);
    const record = await this.prisma.accountMonthlyBalance.upsert({
      where: {
        tenantId_accountId_accountingPeriodId: {
          tenantId: balance.tenantId,
          accountId: balance.accountId,
          accountingPeriodId: balance.accountingPeriodId,
        },
      },
      update: {
        openingBalanceCents: balance.openingBalanceCents,
        totalDebitCents: balance.totalDebitCents,
        totalCreditCents: balance.totalCreditCents,
        closingBalanceCents: balance.closingBalanceCents,
      },
      create: {
        tenantId: balance.tenantId,
        accountId: balance.accountId,
        accountingPeriodId: balance.accountingPeriodId,
        openingBalanceCents: balance.openingBalanceCents,
        totalDebitCents: balance.totalDebitCents,
        totalCreditCents: balance.totalCreditCents,
        closingBalanceCents: balance.closingBalanceCents,
      },
    });

    return this.toBalanceEntity(record);
  }

  async findBalance(
    tenantId: string,
    accountId: string,
    periodId: string,
  ): Promise<AccountBalanceEntity | null> {
    const balance = await this.prisma.accountMonthlyBalance.findUnique({
      where: {
        tenantId_accountId_accountingPeriodId: {
          tenantId,
          accountId,
          accountingPeriodId: periodId,
        },
      },
    });
    return balance ? this.toBalanceEntity(balance) : null;
  }

  async listBalancesForPeriod(tenantId: string, periodId: string): Promise<AccountBalanceEntity[]> {
    const balances = await this.prisma.accountMonthlyBalance.findMany({
      where: {
        tenantId,
        accountingPeriodId: periodId,
      },
    });
    return balances.map((b) => this.toBalanceEntity(b));
  }
}
