import type { AccountClassification } from './account.entity';

export interface AccountBalanceEntity {
  id: string;
  tenantId: string;
  accountId: string;
  accountingPeriodId: string;
  openingBalanceCents: bigint;
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  closingBalanceCents: bigint;
  updatedAt: Date;
}

export interface TrialBalanceItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  classification: AccountClassification;
  debitBalanceCents: bigint;
  creditBalanceCents: bigint;
}

export interface TrialBalanceReport {
  tenantId: string;
  periodId: string;
  items: TrialBalanceItem[];
  totalDebitCents: bigint;
  totalCreditCents: bigint;
  isBalanced: boolean;
}

export interface StatementLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amountCents: bigint;
}

export interface ProfitAndLossReport {
  tenantId: string;
  periodId: string;
  baseCurrency?: string;
  revenues: StatementLineItem[];
  expenses: StatementLineItem[];
  totalRevenueCents: bigint;
  totalExpenseCents: bigint;
  netIncomeCents: bigint;
}

export interface BalanceSheetReport {
  tenantId: string;
  asOfPeriodId: string;
  baseCurrency?: string;
  assets: StatementLineItem[];
  liabilities: StatementLineItem[];
  equity: StatementLineItem[];
  totalAssetsCents: bigint;
  totalLiabilitiesCents: bigint;
  totalEquityCents: bigint;
  retainedEarningsCents: bigint;
  isBalanced: boolean;
}
