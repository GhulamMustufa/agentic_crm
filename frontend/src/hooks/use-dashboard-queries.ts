'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { cleanBankPayee } from '@/lib/api/exceptions';

// --- Query Key Factories ---
export const queryKeys = {
  all: ['dashboard'] as const,
  transactions: (tenantId?: string | null) => ['bank-transactions', tenantId || 'active'] as const,
  accounts: (tenantId?: string | null) => ['bank-accounts', tenantId || 'active'] as const,
  statements: (tenantId?: string | null, bankAccountId?: string) =>
    ['bank-statements', tenantId || 'active', bankAccountId || 'all'] as const,
  invoices: (tenantId?: string | null) => ['invoices', tenantId || 'active'] as const,
  counterparties: (tenantId?: string | null) => ['counterparties', tenantId || 'active'] as const,
  ledgerAccounts: (tenantId?: string | null) => ['ledger-accounts', tenantId || 'active'] as const,
  overview: (tenantId?: string | null) => ['dashboard-overview', tenantId || 'active'] as const,
  reports: (reportType: string, periodId?: string, tenantId?: string | null) =>
    ['financial-reports', tenantId || 'active', reportType, periodId || 'default'] as const,
  periods: (tenantId?: string | null) => ['ledger-periods', tenantId || 'active'] as const,
};

// --- Interfaces ---
export interface TransactionItem {
  id: string;
  date: string;
  cleanPayee: string;
  rawMemo: string;
  accountName: string;
  accountCode: string;
  counterparty: string;
  inflow: number;
  outflow: number;
  status: 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW';
  isAuditLocked: boolean;
  currency: string;
}

export interface RawBankTransaction {
  id: string;
  transactionDate: string;
  amountCents: string | number;
  rawDescription: string;
  normalizedPayee?: string;
  currency?: string;
  status: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  tenantId: string;
  ledgerAccountId: string;
  accountName: string;
  institutionName: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
  currency: string;
  accountNumberLast4: string;
  currentBalanceCents: string | number;
  reconciledBalanceCents: string | number;
  isActive: boolean;
  createdAt: string;
}

export interface BankStatementRecord {
  id: string;
  fileName: string;
  bankAccountId?: string | null;
  statementStartDate?: string;
  statementEndDate?: string;
  openingBalanceCents?: string | number;
  closingBalanceCents?: string | number;
  totalDebitsCents?: string | number;
  totalCreditsCents?: string | number;
  bankDetected?: string;
  status:
    'UPLOADED' | 'PROCESSING' | 'PARSED' | 'RECONCILED' | 'FAILED' | 'EXCEPTION' | 'NEEDS_REVIEW';
  errorMessage?: string;
  createdAt: string;
}

export interface RawInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: 'INVOICE' | 'BILL';
  counterpartyId?: string;
  counterparty?: { legalName: string };
  issueDate: string;
  dueDate: string;
  totalCents: string | number;
  amountDueCents: string | number;
  currency?: string;
  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  type: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE';
  counterpartyName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  currency: string;
  status: 'DRAFT' | 'POSTED' | 'PAID' | 'OVERDUE' | 'VOID';
}

export interface Counterparty {
  id: string;
  legalName: string;
  type: 'VENDOR' | 'CUSTOMER' | 'BOTH';
}

export interface LedgerAccount {
  id: string;
  accountCode: string;
  name: string;
  classification: string;
  subClassification?: string;
}

export interface StatementLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amountCents: string | number;
}

export interface ProfitAndLossData {
  baseCurrency?: string;
  revenues: StatementLineItem[];
  expenses: StatementLineItem[];
  totalRevenueCents: string | number;
  totalExpenseCents: string | number;
  netIncomeCents: string | number;
}

export interface BalanceSheetData {
  baseCurrency?: string;
  assets: StatementLineItem[];
  liabilities: StatementLineItem[];
  equity: StatementLineItem[];
  totalAssetsCents: string | number;
  totalLiabilitiesCents: string | number;
  totalEquityCents: string | number;
  isBalanced: boolean;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  classification: string;
  debitCents: string | number;
  creditCents: string | number;
}

export interface TrialBalanceData {
  rows?: TrialBalanceRow[];
  items?: TrialBalanceRow[];
  totalDebitCents: string | number;
  totalCreditCents: string | number;
  isBalanced: boolean;
}

export interface DashboardOverviewData {
  accounts: BankAccount[];
  transactions: RawBankTransaction[];
  exceptionsCount: number;
  totalBalanceCents: number;
  totalReconciledCents: number;
  transactionCount: number;
  recentTransactions: RawBankTransaction[];
  primaryCurrency: string;
}

function getActiveTenantId(): string | null {
  return typeof window !== 'undefined' ? authStorage.getActiveTenantId() : null;
}

function getActiveTenantCurrency(): string {
  return (typeof window !== 'undefined' ? authStorage.getTenantCurrency() : 'MYR') || 'MYR';
}

// --- Query Hooks ---

/**
 * 1. Bank Transactions Query
 * Caches bank transactions with mapped formatting for 0ms page transitions.
 */
export function useBankTransactionsQuery(fallbackCurrency?: string) {
  const tenantId = getActiveTenantId();
  const defaultCurrency = fallbackCurrency || getActiveTenantCurrency();

  return useQuery<TransactionItem[]>({
    queryKey: queryKeys.transactions(tenantId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawBankTransaction[] }>('/banking/transactions');
      const rawList = res.data || [];

      return rawList.map((tx) => {
        const rawAmount = Number(tx.amountCents || 0) / 100;
        const isDeposit = rawAmount > 0;
        const absAmount = Math.abs(rawAmount);

        let status: TransactionItem['status'] = 'PENDING_REVIEW';
        if (tx.status === 'RECONCILED') status = 'RECONCILED';
        else if (tx.status === 'MATCHED' || tx.status === 'PROPOSED') status = 'AI_MATCHED';

        const rawMemo = tx.rawDescription || '';
        const cleanName = tx.normalizedPayee || cleanBankPayee(rawMemo);

        return {
          id: tx.id,
          date: tx.transactionDate || tx.createdAt,
          cleanPayee: cleanName,
          rawMemo: rawMemo,
          accountName: isDeposit ? 'Operating Cash (Deposit)' : 'Operating Cash (Disbursement)',
          accountCode: '1010',
          counterparty: cleanName,
          inflow: isDeposit ? absAmount : 0,
          outflow: isDeposit ? 0 : absAmount,
          status,
          isAuditLocked: tx.status === 'RECONCILED',
          currency: tx.currency || defaultCurrency,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 2. Bank Accounts Query
 */
export function useBankAccountsQuery() {
  const tenantId = getActiveTenantId();

  return useQuery<BankAccount[]>({
    queryKey: queryKeys.accounts(tenantId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: BankAccount[] }>('/banking/accounts');
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 3. Bank Statements Query
 */
export function useBankStatementsQuery(bankAccountId?: string) {
  const tenantId = getActiveTenantId();

  return useQuery<BankStatementRecord[]>({
    queryKey: queryKeys.statements(tenantId, bankAccountId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: BankStatementRecord[] }>('/banking/statements', {
        params: bankAccountId ? { bankAccountId } : undefined,
      });
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 4. Invoices & Bills Query
 */
export function useInvoicesQuery() {
  const tenantId = getActiveTenantId();

  return useQuery<InvoiceRecord[]>({
    queryKey: queryKeys.invoices(tenantId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawInvoice[] }>('/invoices');
      const list = res.data || [];

      return list.map((inv) => {
        let mappedStatus: InvoiceRecord['status'] = 'DRAFT';
        if (inv.status === 'PAID') mappedStatus = 'PAID';
        else if (inv.status === 'VOID') mappedStatus = 'VOID';
        else if (inv.status === 'POSTED' || inv.status === 'APPROVED') mappedStatus = 'POSTED';
        else mappedStatus = 'DRAFT';

        // Check if overdue
        if (mappedStatus === 'POSTED' && new Date(inv.dueDate) < new Date()) {
          mappedStatus = 'OVERDUE';
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          type:
            inv.invoiceType === 'INVOICE'
              ? ('ACCOUNTS_RECEIVABLE' as const)
              : ('ACCOUNTS_PAYABLE' as const),
          counterpartyName: inv.counterparty?.legalName || 'Unspecified Customer / Vendor',
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalAmount: Number(inv.totalCents || 0) / 100,
          currency: inv.currency || 'USD',
          status: mappedStatus,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 5. Counterparties Query
 */
export function useCounterpartiesQuery() {
  const tenantId = getActiveTenantId();

  return useQuery<Counterparty[]>({
    queryKey: queryKeys.counterparties(tenantId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: Counterparty[] }>('/counterparties');
      return res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 6. Ledger Accounts Query (with auto-seed fallback)
 */
export function useLedgerAccountsQuery() {
  const tenantId = getActiveTenantId();

  return useQuery<LedgerAccount[]>({
    queryKey: queryKeys.ledgerAccounts(tenantId),
    queryFn: async () => {
      const accRes = await apiClient.get<{ data: LedgerAccount[] }>('/ledger/accounts');
      let accounts = accRes.data || [];

      if (accounts.length === 0) {
        try {
          const seedRes = await apiClient.post<{ data: LedgerAccount[] }>(
            '/ledger/accounts/seed-standard',
            {},
          );
          accounts = seedRes.data || [];
        } catch {
          // Ignore seed errors if already seeded concurrently
        }
      }
      return accounts;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * 7. Dashboard Overview Metrics Query
 */
export function useDashboardOverviewQuery() {
  const tenantId = getActiveTenantId();
  const defaultCurrency = getActiveTenantCurrency();

  return useQuery<DashboardOverviewData>({
    queryKey: queryKeys.overview(tenantId),
    queryFn: async () => {
      const [accountsRes, txRes, excRes] = await Promise.allSettled([
        apiClient.get<{ data: BankAccount[] }>('/banking/accounts'),
        apiClient.get<{ data: RawBankTransaction[] }>('/banking/transactions'),
        apiClient.get<{ data: Array<{ id: string; status: string }> }>('/banking/exceptions', {
          params: { status: 'OPEN' },
        }),
      ]);

      const accounts = accountsRes.status === 'fulfilled' ? accountsRes.value.data || [] : [];
      const transactions = txRes.status === 'fulfilled' ? txRes.value.data || [] : [];
      const exceptions = excRes.status === 'fulfilled' ? excRes.value.data || [] : [];

      const openExceptions = exceptions.filter(
        (e) => !e.status || (e.status !== 'RESOLVED' && e.status !== 'DISMISSED'),
      );

      const totalBalanceCents = accounts.reduce(
        (sum, a) => sum + Number(a.currentBalanceCents || 0),
        0,
      );

      const reconciledSum = transactions
        .filter((t) => t.status === 'RECONCILED' || t.status === 'MATCHED')
        .reduce((sum, t) => sum + Math.abs(Number(t.amountCents || 0)), 0);

      const primaryCurrency = accounts[0]?.currency || transactions[0]?.currency || defaultCurrency;

      return {
        accounts,
        transactions,
        exceptionsCount: openExceptions.length,
        totalBalanceCents,
        totalReconciledCents: reconciledSum,
        transactionCount: transactions.length,
        recentTransactions: transactions.slice(0, 5),
        primaryCurrency,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 8. Accounting Periods Query
 */
export function usePeriodsQuery() {
  const tenantId = getActiveTenantId();

  return useQuery<Array<{ id: string; periodName: string }>>({
    queryKey: queryKeys.periods(tenantId),
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; periodName: string }> }>(
        '/ledger/periods',
      );
      return res.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// --- Invalidation Hooks ---

/**
 * Hook providing granular and coordinated cache invalidation helpers.
 */
export function useSmartInvalidate() {
  const queryClient = useQueryClient();

  return {
    invalidateBanking: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-statements'] });
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
    invalidateInvoices: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
    },
    invalidateExceptions: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
    invalidateReports: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-reports'] });
    },
  };
}
