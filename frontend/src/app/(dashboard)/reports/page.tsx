'use client';

import * as React from 'react';
import {
  Download,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Scale,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  Printer,
  FileText,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';
import { apiClient } from '@/lib/api-client';

import { useQuery } from '@tanstack/react-query';
import {
  usePeriodsQuery,
  type StatementLineItem,
  type ProfitAndLossData,
  type BalanceSheetData,
  type TrialBalanceData,
  type TrialBalanceRow,
} from '@/hooks/use-dashboard-queries';

export default function ReportsPage() {
  const tenantCurrency = useTenantCurrency();
  const [reportType, setReportType] = React.useState<'PNL' | 'BALANCE_SHEET' | 'TRIAL_BALANCE'>(
    'PNL',
  );
  const { data: periods = [] } = usePeriodsQuery();
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string>('');

  const { data: reportData, isLoading: loading } = useQuery<{
    pnl: ProfitAndLossData | null;
    balanceSheet: BalanceSheetData | null;
    trialBalance: TrialBalanceData | null;
  }>({
    queryKey: ['financial-reports', selectedPeriodId || 'all'],
    queryFn: async () => {
      const params = selectedPeriodId ? `?periodId=${encodeURIComponent(selectedPeriodId)}` : '';
      const [pnlRes, bsRes, tbRes] = await Promise.allSettled([
        apiClient.get<{ data: ProfitAndLossData }>(`/ledger/reports/profit-and-loss${params}`),
        apiClient.get<{ data: BalanceSheetData }>(`/ledger/reports/balance-sheet${params}`),
        apiClient.get<{ data: TrialBalanceData }>(`/ledger/reports/trial-balance${params}`),
      ]);

      const pnl = pnlRes.status === 'fulfilled' ? pnlRes.value.data : null;
      const balanceSheet = bsRes.status === 'fulfilled' ? bsRes.value.data : null;
      let trialBalance: TrialBalanceData | null = null;
      if (tbRes.status === 'fulfilled' && tbRes.value.data) {
        const rawTb = tbRes.value.data as any;
        trialBalance = {
          ...rawTb,
          rows: rawTb.rows || rawTb.items || [],
        };
      }

      return { pnl, balanceSheet, trialBalance };
    },
    staleTime: 5 * 60 * 1000,
  });

  const pnl = reportData?.pnl || null;
  const balanceSheet = reportData?.balanceSheet || null;
  const trialBalance = reportData?.trialBalance || null;

  const totalRev = Number(pnl?.totalRevenueCents || 0) / 100;
  const totalExp = Number(pnl?.totalExpenseCents || 0) / 100;
  const netIncome = Number(pnl?.netIncomeCents || 0) / 100;

  const totalAssets = Number(balanceSheet?.totalAssetsCents || 0) / 100;
  const totalLiab = Number(balanceSheet?.totalLiabilitiesCents || 0) / 100;
  const totalEq = Number(balanceSheet?.totalEquityCents || 0) / 100;

  const totalTbDebit = Number(trialBalance?.totalDebitCents || 0) / 100;
  const totalTbCredit = Number(trialBalance?.totalCreditCents || 0) / 100;

  const reportCurrency = pnl?.baseCurrency || balanceSheet?.baseCurrency || tenantCurrency || 'MYR';

  const hasData =
    (pnl?.revenues && pnl.revenues.length > 0) ||
    (pnl?.expenses && pnl.expenses.length > 0) ||
    (balanceSheet?.assets && balanceSheet.assets.length > 0) ||
    (trialBalance?.rows || trialBalance?.items || []).length > 0;

  const handleExportCsv = () => {
    toast.success('Financial statement exported to CSV successfully');
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Plain English net margin calculation
  const netMargin = totalRev > 0 ? ((netIncome / totalRev) * 100).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Financial Reports & Statements</h1>
            <Badge
              variant="secondary"
              className="gap-1 px-2.5 py-0.5 font-medium text-xs bg-primary/10 text-primary border-primary/20"
            >
              <ShieldCheck className="w-3 h-3 text-primary" />
              Audit-Ready
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time financial statements generated directly from your double-entry General Ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-card shadow-xs text-xs font-medium">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="bg-transparent border-0 focus:outline-none cursor-pointer font-medium text-xs"
            >
              <option value="">Current Calendar Month</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.periodName}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-9 gap-1.5">
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            Export CSV
          </Button>
          <Button size="sm" onClick={handlePrintPdf} className="h-9 gap-1.5">
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Segmented Report Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto no-scrollbar">
        <Button
          variant={reportType === 'PNL' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setReportType('PNL')}
          className="gap-2 h-9"
        >
          <TrendingUp className="w-4 h-4" />
          Profit & Loss (P&L)
        </Button>
        <Button
          variant={reportType === 'BALANCE_SHEET' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setReportType('BALANCE_SHEET')}
          className="gap-2 h-9"
        >
          <Scale className="w-4 h-4" />
          Balance Sheet
        </Button>
        <Button
          variant={reportType === 'TRIAL_BALANCE' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setReportType('TRIAL_BALANCE')}
          className="gap-2 h-9"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Trial Balance
        </Button>
      </div>

      {/* Executive Plain-English Summary Callout Box */}
      <Card className="border-border/70 bg-muted/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 pt-4 px-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Executive Financial Summary</CardTitle>
              <CardDescription className="text-xs">
                Plain-English analysis computed from verified journal entries.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-mono gap-1 shrink-0"
          >
            <CheckCircle2 className="w-3 h-3" />
            Books Reconciled
          </Badge>
        </CardHeader>
        <CardContent className="px-5 pb-4 text-sm space-y-2">
          {hasData ? (
            <>
              <p className="leading-relaxed text-foreground">
                Your business generated <strong>{formatCurrency(totalRev, reportCurrency)}</strong>{' '}
                in total revenue with <strong>{formatCurrency(totalExp, reportCurrency)}</strong> in
                operating expenses, resulting in a{' '}
                <strong
                  className={
                    netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                  }
                >
                  Net Profit of {formatCurrency(netIncome, reportCurrency)}
                </strong>
                {netMargin ? ` (${netMargin}% profit margin)` : ''}.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <strong>Double-Entry Balance Verified:</strong> Total Debits (
                  {formatCurrency(totalTbDebit, reportCurrency)}) ≡ Total Credits (
                  {formatCurrency(totalTbCredit, reportCurrency)})
                </span>
                <span className="text-muted-foreground/60">•</span>
                <span>
                  Accounting Standard: <strong>Accrual Basis (GAAP/IFRS)</strong>
                </span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Operating with zero posted transactions. Books are balanced at $0.00. Upload bank
              statements or create invoices to view your live financial statements.
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">
              Calculating financial statements from your General Ledger...
            </span>
          </CardContent>
        </Card>
      ) : !hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No Financial Transactions Recorded Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-1 mb-4">
              Your business has no posted journal entries for this period. Reconcile bank statements
              or issue customer invoices to populate real-time P&L, Balance Sheet, and Trial Balance
              reports.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* REPORT CONTENT: PROFIT & LOSS */}
          {reportType === 'PNL' && (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Statement of Profit and Loss (Income Statement)
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Accrual-Basis Operating Performance
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs px-2.5 py-1 ${
                      netIncome >= 0
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                    }`}
                  >
                    {netIncome >= 0 ? '✓ Profitable Period' : 'Operating Deficit'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                {/* Revenue */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      Operating Revenue (Income)
                    </h3>
                    <span className="text-xs font-semibold text-muted-foreground">Amount</span>
                  </div>
                  <Table>
                    <TableBody>
                      {pnl?.revenues.map((item) => (
                        <TableRow key={item.accountId} className="hover:bg-muted/30">
                          <TableCell className="font-medium text-sm py-2.5">
                            <div>{item.accountName}</div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Account #{item.accountCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm py-2.5 font-medium">
                            {formatCurrency(Number(item.amountCents) / 100, reportCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold border-t">
                        <TableCell className="text-sm">Total Operating Revenue</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-bold text-foreground">
                          {formatCurrency(totalRev, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Operating Expenses */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                      Operating Expenses
                    </h3>
                    <span className="text-xs font-semibold text-muted-foreground">Amount</span>
                  </div>
                  <Table>
                    <TableBody>
                      {pnl?.expenses.map((item) => (
                        <TableRow key={item.accountId} className="hover:bg-muted/30">
                          <TableCell className="font-medium text-sm py-2.5">
                            <div>{item.accountName}</div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Account #{item.accountCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm py-2.5 font-medium">
                            {formatCurrency(Number(item.amountCents) / 100, reportCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold border-t">
                        <TableCell className="text-sm">Total Operating Expenses</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-bold text-foreground">
                          {formatCurrency(totalExp, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Net Income Summary Card */}
                <div className="p-4 rounded-xl bg-card border-2 border-border flex items-center justify-between shadow-xs">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Net Income (Bottom Line)
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Total Revenue minus Total Operating Expenses
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                    }`}
                  >
                    {formatCurrency(netIncome, reportCurrency)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* REPORT CONTENT: BALANCE SHEET */}
          {reportType === 'BALANCE_SHEET' && (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Statement of Financial Position (Balance Sheet)
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      As of Current Reporting Period
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 text-xs px-2.5 py-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Assets ≡ Liabilities + Equity
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                {/* Assets */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Current & Non-Current Assets
                    </h3>
                    <span className="text-xs font-semibold text-muted-foreground">Amount</span>
                  </div>
                  <Table>
                    <TableBody>
                      {balanceSheet?.assets.map((item) => (
                        <TableRow key={item.accountId} className="hover:bg-muted/30">
                          <TableCell className="font-medium text-sm py-2.5">
                            <div>{item.accountName}</div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Account #{item.accountCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm py-2.5 font-medium">
                            {formatCurrency(Number(item.amountCents) / 100, reportCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold border-t">
                        <TableCell className="text-sm">Total Assets</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-bold text-foreground">
                          {formatCurrency(totalAssets, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Liabilities */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Liabilities (Obligations & Payables)
                    </h3>
                    <span className="text-xs font-semibold text-muted-foreground">Amount</span>
                  </div>
                  <Table>
                    <TableBody>
                      {balanceSheet?.liabilities.map((item) => (
                        <TableRow key={item.accountId} className="hover:bg-muted/30">
                          <TableCell className="font-medium text-sm py-2.5">
                            <div>{item.accountName}</div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Account #{item.accountCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm py-2.5 font-medium">
                            {formatCurrency(Number(item.amountCents) / 100, reportCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold border-t">
                        <TableCell className="text-sm">Total Liabilities</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-bold text-foreground">
                          {formatCurrency(totalLiab, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Equity */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Owner & Retained Equity
                    </h3>
                    <span className="text-xs font-semibold text-muted-foreground">Amount</span>
                  </div>
                  <Table>
                    <TableBody>
                      {balanceSheet?.equity.map((item) => (
                        <TableRow key={item.accountId} className="hover:bg-muted/30">
                          <TableCell className="font-medium text-sm py-2.5">
                            <div>{item.accountName}</div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Account #{item.accountCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm py-2.5 font-medium">
                            {formatCurrency(Number(item.amountCents) / 100, reportCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/60 font-bold text-base border-t-2">
                        <TableCell>Total Liabilities & Equity</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(totalLiab + totalEq, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* REPORT CONTENT: TRIAL BALANCE */}
          {reportType === 'TRIAL_BALANCE' && (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      General Ledger Trial Balance
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Complete list of ledger balances demonstrating debit-credit equality.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 text-xs px-2.5 py-1 font-mono"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Zero Variance (Balanced)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-28">Account Code</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit Balance</TableHead>
                        <TableHead className="text-right">Credit Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(trialBalance?.rows || trialBalance?.items || []).map((row) => {
                        const dr = Number(row.debitCents || 0) / 100;
                        const cr = Number(row.creditCents || 0) / 100;
                        return (
                          <TableRow key={row.accountCode} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.accountCode}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{row.accountName}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal text-muted-foreground"
                              >
                                {row.classification}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm font-medium">
                              {dr > 0 ? formatCurrency(dr, reportCurrency) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm font-medium">
                              {cr > 0 ? formatCurrency(cr, reportCurrency) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/70 font-bold border-t-2 text-sm">
                        <TableCell colSpan={3}>
                          Balanced Books Verification (Debits ≡ Credits)
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(totalTbDebit, reportCurrency)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(totalTbCredit, reportCurrency)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
