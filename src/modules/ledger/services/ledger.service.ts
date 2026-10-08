import { Inject, Injectable } from '@nestjs/common';

import {
  ValidationError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../../core/errors/app-error';
import { AuditService } from '../../audit/services/audit.service';
import { type AccountEntity, isDebitNormal } from '../domain/account.entity';
import {
  LEDGER_REPOSITORY_TOKEN,
  type ILedgerRepository,
} from '../domain/ledger.repository.interface';
import {
  type CreateAccountDto,
  type CreateJournalEntryDto,
  type ReverseJournalEntryDto,
  createAccountSchema,
  createJournalEntrySchema,
  reverseJournalEntrySchema,
} from '../dto/ledger.dto';

import type {
  TrialBalanceReport,
  TrialBalanceItem,
  ProfitAndLossReport,
  BalanceSheetReport,
  StatementLineItem,
} from '../domain/balance.entity';
import type { JournalEntryEntity } from '../domain/journal-entry.entity';
import type { AccountingPeriodEntity, FiscalYearEntity } from '../domain/period.entity';

@Injectable()
export class LedgerService {
  constructor(
    @Inject(LEDGER_REPOSITORY_TOKEN)
    private readonly ledgerRepo: ILedgerRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Seeds standard Chart of Accounts for a newly created organization.
   */
  async seedStandardChartOfAccounts(tenantId: string): Promise<AccountEntity[]> {
    const defaultAccounts = [
      {
        accountCode: '1010',
        name: 'Operating Checking Account',
        classification: 'ASSET' as const,
        subClassification: 'CASH',
        isSystemLocked: true,
      },
      {
        accountCode: '1200',
        name: 'Accounts Receivable',
        classification: 'ASSET' as const,
        subClassification: 'CURRENT_ASSET',
        isSystemLocked: true,
      },
      {
        accountCode: '1500',
        name: 'Inventory Asset',
        classification: 'ASSET' as const,
        subClassification: 'CURRENT_ASSET',
      },
      {
        accountCode: '2010',
        name: 'Accounts Payable',
        classification: 'LIABILITY' as const,
        subClassification: 'CURRENT_LIABILITY',
        isSystemLocked: true,
      },
      {
        accountCode: '2200',
        name: 'Sales Tax Payable',
        classification: 'LIABILITY' as const,
        subClassification: 'CURRENT_LIABILITY',
      },
      {
        accountCode: '3010',
        name: "Owner's Equity / Common Stock",
        classification: 'EQUITY' as const,
        subClassification: 'EQUITY',
      },
      {
        accountCode: '3999',
        name: 'Retained Earnings',
        classification: 'EQUITY' as const,
        subClassification: 'EQUITY',
        isSystemLocked: true,
      },
      {
        accountCode: '4010',
        name: 'Sales Revenue',
        classification: 'REVENUE' as const,
        subClassification: 'OPERATING_REVENUE',
      },
      {
        accountCode: '5010',
        name: 'Cost of Goods Sold',
        classification: 'EXPENSE' as const,
        subClassification: 'DIRECT_COST',
      },
      {
        accountCode: '6010',
        name: 'General & Administrative Expense',
        classification: 'EXPENSE' as const,
        subClassification: 'OPERATING_EXPENSE',
      },
      {
        accountCode: '6020',
        name: 'Payroll Expense',
        classification: 'EXPENSE' as const,
        subClassification: 'PAYROLL',
      },
    ];

    const created: AccountEntity[] = [];
    for (const acc of defaultAccounts) {
      const existing = await this.ledgerRepo.findAccountByCode(tenantId, acc.accountCode);
      if (!existing) {
        const item = await this.ledgerRepo.createAccount({
          tenantId,
          ...acc,
        });
        created.push(item);
      }
    }
    return created;
  }

  async createAccount(tenantId: string, rawDto: CreateAccountDto): Promise<AccountEntity> {
    const parseResult = createAccountSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Account validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    if (dto.parentAccountId) {
      const parent = await this.ledgerRepo.findAccountById(tenantId, dto.parentAccountId);
      if (!parent) {
        throw new NotFoundError('Parent Account', dto.parentAccountId);
      }
    }

    return this.ledgerRepo.createAccount({
      tenantId,
      accountCode: dto.accountCode,
      name: dto.name,
      classification: dto.classification,
      subClassification: dto.subClassification,
      parentAccountId: dto.parentAccountId,
    });
  }

  async listAccounts(tenantId: string, activeOnly = false): Promise<AccountEntity[]> {
    return this.ledgerRepo.listAccounts(tenantId, activeOnly);
  }

  async findAccountByCode(tenantId: string, code: string): Promise<AccountEntity | null> {
    return this.ledgerRepo.findAccountByCode(tenantId, code);
  }

  async getAccountById(tenantId: string, id: string): Promise<AccountEntity | null> {
    return this.ledgerRepo.findAccountById(tenantId, id);
  }

  /**
   * Initializes a Fiscal Year and 12 monthly accounting periods.
   */
  async createFiscalYearAndPeriods(
    tenantId: string,
    year: number,
  ): Promise<{ fiscalYear: FiscalYearEntity; periods: AccountingPeriodEntity[] }> {
    const yearLabel = `FY-${year}`;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    let fiscalYear = await this.ledgerRepo.findFiscalYearByLabel(tenantId, yearLabel);
    if (!fiscalYear) {
      fiscalYear = await this.ledgerRepo.createFiscalYear({
        tenantId,
        yearLabel,
        startDate,
        endDate,
        isClosed: false,
      });
    } else {
      const existingPeriods = await this.ledgerRepo.listPeriods(tenantId, fiscalYear.id);
      if (existingPeriods.length > 0) {
        return { fiscalYear, periods: existingPeriods };
      }
    }

    const periods: AccountingPeriodEntity[] = [];
    const monthDays = [
      31,
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    for (let m = 0; m < 12; m++) {
      const periodNum = m + 1;
      const mm = String(periodNum).padStart(2, '0');
      const pStart = `${year}-${mm}-01`;
      const pEnd = `${year}-${mm}-${String(monthDays[m]).padStart(2, '0')}`;

      const period = await this.ledgerRepo.createPeriod({
        tenantId,
        fiscalYearId: fiscalYear.id,
        periodNumber: periodNum,
        periodName: `${monthNames[m]} ${year}`,
        startDate: pStart,
        endDate: pEnd,
        status: 'OPEN',
      });
      periods.push(period);
    }

    return { fiscalYear, periods };
  }

  async getPeriodByDate(tenantId: string, date: string): Promise<AccountingPeriodEntity | null> {
    return this.ledgerRepo.findPeriodByDate(tenantId, date);
  }

  async closeAccountingPeriod(
    tenantId: string,
    userId: string,
    periodId: string,
  ): Promise<AccountingPeriodEntity> {
    const period = await this.ledgerRepo.findPeriodById(tenantId, periodId);
    if (!period) {
      throw new NotFoundError('Accounting Period', periodId);
    }
    return this.ledgerRepo.updatePeriodStatus(tenantId, periodId, 'CLOSED', userId);
  }

  /**
   * Posts an authoritative double-entry Journal Entry to the General Ledger.
   * Deterministically validates accounting invariants: sum(Debits) === sum(Credits).
   */
  async postJournalEntry(
    tenantId: string,
    userId: string,
    rawDto: CreateJournalEntryDto,
    agentId?: string,
  ): Promise<JournalEntryEntity> {
    const parseResult = createJournalEntrySchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Journal Entry validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    // 1. Validate accounting period
    const period = await this.ledgerRepo.findPeriodByDate(tenantId, dto.entryDate);
    if (!period) {
      throw new NotFoundError(
        'Accounting Period',
        `No open fiscal period found covering entry date '${dto.entryDate}'`,
      );
    }

    if (period.status !== 'OPEN') {
      throw new UnprocessableEntityError(
        `Accounting period '${period.periodName}' is ${period.status}. Transactions cannot be posted to closed/locked periods.`,
      );
    }

    // 2. Validate all accounts exist and belong to tenant
    const accountMap = new Map<string, AccountEntity>();
    for (const line of dto.lines) {
      if (!accountMap.has(line.accountId)) {
        const account = await this.ledgerRepo.findAccountById(tenantId, line.accountId);
        if (!account) {
          throw new NotFoundError('Account', line.accountId);
        }
        if (!account.isActive) {
          throw new UnprocessableEntityError(
            `Account '${account.accountCode} - ${account.name}' is inactive.`,
          );
        }
        accountMap.set(line.accountId, account);
      }
    }

    // 3. Compute totals and generate entry number
    const totalDebits = dto.lines.reduce((sum, l) => sum + l.debitCents, 0n);
    const totalCredits = dto.lines.reduce((sum, l) => sum + l.creditCents, 0n);

    const count = (await this.ledgerRepo.listEntries(tenantId)).length + 1;
    const entryNumber = `JE-${dto.entryDate.replace(/-/g, '')}-${String(count).padStart(5, '0')}`;

    // 4. Persist Journal Entry and Lines
    const entry = await this.ledgerRepo.createEntry({
      tenantId,
      accountingPeriodId: period.id,
      entryNumber,
      entryDate: dto.entryDate,
      description: dto.description,
      status: 'POSTED',
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      totalDebitCents: totalDebits,
      totalCreditCents: totalCredits,
      createdByUserId: userId,
      createdByAgentId: agentId,
      postedAt: new Date(),
      lines: dto.lines.map((line, idx) => ({
        accountId: line.accountId,
        lineNumber: idx + 1,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
      })),
    });

    // 5. Update Monthly Rollup Balances
    await this.applyLinesToBalances(tenantId, period.id, entry.lines, accountMap, false);

    // 6. Record Audit Event
    await this.auditService.recordEvent({
      tenantId,
      action: 'JOURNAL_ENTRY_POSTED',
      entityType: 'JOURNAL_ENTRY',
      entityId: entry.id,
      actorType: agentId ? 'AI_AGENT' : 'USER',
      actorId: agentId || userId,
      newState: {
        entryNumber: entry.entryNumber,
        totalDebitCents: entry.totalDebitCents.toString(),
        totalCreditCents: entry.totalCreditCents.toString(),
        lineCount: entry.lines.length,
      },
    });

    return entry;
  }

  /**
   * Reverses a previously posted Journal Entry with an immutable inverse entry.
   */
  async reverseJournalEntry(
    tenantId: string,
    userId: string,
    entryId: string,
    rawDto: ReverseJournalEntryDto,
  ): Promise<JournalEntryEntity> {
    const parseResult = reverseJournalEntrySchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new ValidationError(
        'Reversal validation failed',
        parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }
    const dto = parseResult.data;

    const original = await this.ledgerRepo.findEntryById(tenantId, entryId);
    if (!original) {
      throw new NotFoundError('Journal Entry', entryId);
    }

    if (original.status !== 'POSTED') {
      throw new UnprocessableEntityError(
        `Cannot reverse journal entry with status '${original.status}'. Only POSTED entries can be reversed.`,
      );
    }

    const reversalDate = dto.reversalDate || (new Date().toISOString().split('T')[0] ?? '');
    const period = await this.ledgerRepo.findPeriodByDate(tenantId, reversalDate);
    if (!period || period.status !== 'OPEN') {
      throw new UnprocessableEntityError('No open accounting period available for reversal date');
    }

    // 1. Invert lines: swap debits and credits
    const invertedLines = original.lines.map((l) => ({
      accountId: l.accountId,
      debitCents: l.creditCents,
      creditCents: l.debitCents,
      memo: `Reversal of ${original.entryNumber}: ${dto.reason}`,
    }));

    // 2. Post reversing entry
    const count = (await this.ledgerRepo.listEntries(tenantId)).length + 1;
    const entryNumber = `REV-${original.entryNumber}-${String(count).padStart(3, '0')}`;

    const reversingEntry = await this.ledgerRepo.createEntry({
      tenantId,
      accountingPeriodId: period.id,
      entryNumber,
      entryDate: reversalDate,
      description: `Reversal of ${original.entryNumber}: ${dto.reason}`,
      status: 'POSTED',
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      reversesEntryId: original.id,
      totalDebitCents: original.totalCreditCents,
      totalCreditCents: original.totalDebitCents,
      createdByUserId: userId,
      postedAt: new Date(),
      lines: invertedLines.map((line, idx) => ({
        accountId: line.accountId,
        lineNumber: idx + 1,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
      })),
    });

    // 3. Mark original entry as REVERSED
    await this.ledgerRepo.updateEntryStatus(tenantId, original.id, 'REVERSED', reversingEntry.id);

    // 4. Update balances with reversal lines
    const accountMap = new Map<string, AccountEntity>();
    for (const line of reversingEntry.lines) {
      if (!accountMap.has(line.accountId)) {
        const account = await this.ledgerRepo.findAccountById(tenantId, line.accountId);
        if (account) {
          accountMap.set(line.accountId, account);
        }
      }
    }
    await this.applyLinesToBalances(tenantId, period.id, reversingEntry.lines, accountMap, false);

    // 5. Audit Event
    await this.auditService.recordEvent({
      tenantId,
      action: 'JOURNAL_ENTRY_REVERSED',
      entityType: 'JOURNAL_ENTRY',
      entityId: original.id,
      actorType: 'USER',
      actorId: userId,
      previousState: { status: 'POSTED' },
      newState: { status: 'REVERSED', reversingEntryId: reversingEntry.id },
    });

    return reversingEntry;
  }

  private async applyLinesToBalances(
    tenantId: string,
    periodId: string,
    lines: Array<{ accountId: string; debitCents: bigint; creditCents: bigint }>,
    accountMap: Map<string, AccountEntity>,
    isNegating: boolean,
  ): Promise<void> {
    for (const line of lines) {
      const account = accountMap.get(line.accountId);
      if (!account) {
        continue;
      }

      const existingBalance = await this.ledgerRepo.findBalance(tenantId, line.accountId, periodId);
      const openingBalance = existingBalance?.openingBalanceCents || 0n;
      let totalDebits = existingBalance?.totalDebitCents || 0n;
      let totalCredits = existingBalance?.totalCreditCents || 0n;

      const dr = isNegating ? -line.debitCents : line.debitCents;
      const cr = isNegating ? -line.creditCents : line.creditCents;

      totalDebits += dr;
      totalCredits += cr;

      // Normal balance calculation
      let closingBalance: bigint;
      if (isDebitNormal(account.classification)) {
        closingBalance = openingBalance + totalDebits - totalCredits;
      } else {
        closingBalance = openingBalance + totalCredits - totalDebits;
      }

      await this.ledgerRepo.upsertBalance({
        tenantId,
        accountId: line.accountId,
        accountingPeriodId: periodId,
        openingBalanceCents: openingBalance,
        totalDebitCents: totalDebits,
        totalCreditCents: totalCredits,
        closingBalanceCents: closingBalance,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Financial Statements Engine
  // ---------------------------------------------------------------------------

  /**
   * Generates a Trial Balance report for an accounting period.
   * Invariant: Total Debits must equal Total Credits.
   */
  async getTrialBalance(tenantId: string, periodId?: string): Promise<TrialBalanceReport> {
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const today = new Date().toISOString().split('T')[0]!;
      const currentPeriod = await this.ledgerRepo.findPeriodByDate(tenantId, today);
      targetPeriodId = currentPeriod?.id;
    }

    if (!targetPeriodId) {
      return {
        tenantId,
        periodId: '',
        items: [],
        totalDebitCents: 0n,
        totalCreditCents: 0n,
        isBalanced: true,
      };
    }

    const period = await this.ledgerRepo.findPeriodById(tenantId, targetPeriodId);
    if (!period) {
      return {
        tenantId,
        periodId: targetPeriodId,
        items: [],
        totalDebitCents: 0n,
        totalCreditCents: 0n,
        isBalanced: true,
      };
    }

    const accounts = await this.ledgerRepo.listAccounts(tenantId);
    const balances = await this.ledgerRepo.listBalancesForPeriod(tenantId, targetPeriodId);
    const balanceMap = new Map(balances.map((b) => [b.accountId, b]));

    const items: TrialBalanceItem[] = [];
    let totalDebitSum = 0n;
    let totalCreditSum = 0n;

    for (const acc of accounts) {
      const bal = balanceMap.get(acc.id);
      const net = bal?.closingBalanceCents || 0n;

      if (net === 0n && !bal) {
        continue;
      }

      let drBalance = 0n;
      let crBalance = 0n;

      if (isDebitNormal(acc.classification)) {
        if (net >= 0n) {
          drBalance = net;
        } else {
          crBalance = -net;
        }
      } else {
        if (net >= 0n) {
          crBalance = net;
        } else {
          drBalance = -net;
        }
      }

      items.push({
        accountId: acc.id,
        accountCode: acc.accountCode,
        accountName: acc.name,
        classification: acc.classification,
        debitBalanceCents: drBalance,
        creditBalanceCents: crBalance,
      });

      totalDebitSum += drBalance;
      totalCreditSum += crBalance;
    }

    return {
      tenantId,
      periodId: targetPeriodId,
      items,
      totalDebitCents: totalDebitSum,
      totalCreditCents: totalCreditSum,
      isBalanced: totalDebitSum === totalCreditSum,
    };
  }

  /**
   * Generates a Profit & Loss (Income Statement) report.
   * Net Income = Total Revenues - Total Expenses.
   */
  async getProfitAndLoss(tenantId: string, periodId?: string): Promise<ProfitAndLossReport> {
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const today = new Date().toISOString().split('T')[0]!;
      const currentPeriod = await this.ledgerRepo.findPeriodByDate(tenantId, today);
      targetPeriodId = currentPeriod?.id;
    }

    if (!targetPeriodId) {
      return {
        tenantId,
        periodId: '',
        revenues: [],
        expenses: [],
        totalRevenueCents: 0n,
        totalExpenseCents: 0n,
        netIncomeCents: 0n,
      };
    }

    const accounts = await this.ledgerRepo.listAccounts(tenantId);
    const balances = await this.ledgerRepo.listBalancesForPeriod(tenantId, targetPeriodId);
    const balanceMap = new Map(balances.map((b) => [b.accountId, b]));

    const revenues: StatementLineItem[] = [];
    const expenses: StatementLineItem[] = [];

    let totalRevenue = 0n;
    let totalExpense = 0n;

    for (const acc of accounts) {
      const bal = balanceMap.get(acc.id);
      const amount = bal?.closingBalanceCents || 0n;

      if (acc.classification === 'REVENUE') {
        revenues.push({
          accountId: acc.id,
          accountCode: acc.accountCode,
          accountName: acc.name,
          amountCents: amount,
        });
        totalRevenue += amount;
      } else if (acc.classification === 'EXPENSE') {
        expenses.push({
          accountId: acc.id,
          accountCode: acc.accountCode,
          accountName: acc.name,
          amountCents: amount,
        });
        totalExpense += amount;
      }
    }

    return {
      tenantId,
      periodId: targetPeriodId,
      baseCurrency: 'USD',
      revenues,
      expenses,
      totalRevenueCents: totalRevenue,
      totalExpenseCents: totalExpense,
      netIncomeCents: totalRevenue - totalExpense,
    };
  }

  /**
   * Generates a Balance Sheet as of a specified accounting period.
   * Invariant: Assets === Liabilities + Equity + Net Income.
   */
  async getBalanceSheet(tenantId: string, asOfPeriodId?: string): Promise<BalanceSheetReport> {
    let targetPeriodId = asOfPeriodId;
    if (!targetPeriodId) {
      const today = new Date().toISOString().split('T')[0]!;
      const currentPeriod = await this.ledgerRepo.findPeriodByDate(tenantId, today);
      targetPeriodId = currentPeriod?.id;
    }

    if (!targetPeriodId) {
      return {
        tenantId,
        asOfPeriodId: '',
        assets: [],
        liabilities: [],
        equity: [],
        totalAssetsCents: 0n,
        totalLiabilitiesCents: 0n,
        totalEquityCents: 0n,
        retainedEarningsCents: 0n,
        isBalanced: true,
      };
    }

    const accounts = await this.ledgerRepo.listAccounts(tenantId);
    const balances = await this.ledgerRepo.listBalancesForPeriod(tenantId, targetPeriodId);
    const balanceMap = new Map(balances.map((b) => [b.accountId, b]));

    const assets: StatementLineItem[] = [];
    const liabilities: StatementLineItem[] = [];
    const equity: StatementLineItem[] = [];

    let totalAssets = 0n;
    let totalLiabilities = 0n;
    let totalEquity = 0n;

    for (const acc of accounts) {
      const bal = balanceMap.get(acc.id);
      const amount = bal?.closingBalanceCents || 0n;

      if (acc.classification === 'ASSET') {
        assets.push({
          accountId: acc.id,
          accountCode: acc.accountCode,
          accountName: acc.name,
          amountCents: amount,
        });
        totalAssets += amount;
      } else if (acc.classification === 'LIABILITY') {
        liabilities.push({
          accountId: acc.id,
          accountCode: acc.accountCode,
          accountName: acc.name,
          amountCents: amount,
        });
        totalLiabilities += amount;
      } else if (acc.classification === 'EQUITY') {
        equity.push({
          accountId: acc.id,
          accountCode: acc.accountCode,
          accountName: acc.name,
          amountCents: amount,
        });
        totalEquity += amount;
      }
    }

    // Compute Net Income for current period to reflect in retained earnings
    const pnl = await this.getProfitAndLoss(tenantId, targetPeriodId);
    const retainedEarningsCents = pnl.netIncomeCents;

    const totalEquityWithIncome = totalEquity + retainedEarningsCents;
    const isBalanced = totalAssets === totalLiabilities + totalEquityWithIncome;

    return {
      tenantId,
      asOfPeriodId: targetPeriodId,
      baseCurrency: 'USD',
      assets,
      liabilities,
      equity,
      totalAssetsCents: totalAssets,
      totalLiabilitiesCents: totalLiabilities,
      totalEquityCents: totalEquityWithIncome,
      retainedEarningsCents,
      isBalanced,
    };
  }

  async getEntryById(tenantId: string, entryId: string): Promise<JournalEntryEntity | null> {
    return this.ledgerRepo.findEntryById(tenantId, entryId);
  }

  async listEntries(
    tenantId: string,
    options?: { periodId?: string; status?: 'DRAFT' | 'POSTED' | 'REVERSED' },
  ) {
    return this.ledgerRepo.listEntries(tenantId, options);
  }
}
