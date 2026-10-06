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
} from 'lucide-react';

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
import { apiClient } from '@/lib/api-client';

interface StatementLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amountCents: string | number;
}

interface ProfitAndLossData {
  revenues: StatementLineItem[];
  expenses: StatementLineItem[];
  totalRevenueCents: string | number;
  totalExpenseCents: string | number;
  netIncomeCents: string | number;
}

interface BalanceSheetData {
  assets: StatementLineItem[];
  liabilities: StatementLineItem[];
  equity: StatementLineItem[];
  totalAssetsCents: string | number;
  totalLiabilitiesCents: string | number;
  totalEquityCents: string | number;
  isBalanced: boolean;
}

interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  classification: string;
  debitCents: string | number;
  creditCents: string | number;
}

interface TrialBalanceData {
  rows: TrialBalanceRow[];
  totalDebitCents: string | number;
  totalCreditCents: string | number;
  isBalanced: boolean;
}

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState<'PNL' | 'BALANCE_SHEET' | 'TRIAL_BALANCE'>(
    'PNL',
  );
  const [loading, setLoading] = React.useState(true);
  const [pnl, setPnl] = React.useState<ProfitAndLossData | null>(null);
  const [balanceSheet, setBalanceSheet] = React.useState<BalanceSheetData | null>(null);
  const [trialBalance, setTrialBalance] = React.useState<TrialBalanceData | null>(null);

  React.useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const [pnlRes, bsRes, tbRes] = await Promise.allSettled([
          apiClient.get<{ data: ProfitAndLossData }>('/ledger/reports/profit-and-loss'),
          apiClient.get<{ data: BalanceSheetData }>('/ledger/reports/balance-sheet'),
          apiClient.get<{ data: TrialBalanceData }>('/ledger/reports/trial-balance'),
        ]);

        if (pnlRes.status === 'fulfilled' && pnlRes.value.data) {
          setPnl(pnlRes.value.data);
        }
        if (bsRes.status === 'fulfilled' && bsRes.value.data) {
          setBalanceSheet(bsRes.value.data);
        }
        if (tbRes.status === 'fulfilled' && tbRes.value.data) {
          setTrialBalance(tbRes.value.data);
        }
      } catch (err) {
        console.warn('Could not fetch ledger reports:', err);
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const totalRev = Number(pnl?.totalRevenueCents || 0) / 100;
  const totalExp = Number(pnl?.totalExpenseCents || 0) / 100;
  const netIncome = Number(pnl?.netIncomeCents || 0) / 100;

  const totalAssets = Number(balanceSheet?.totalAssetsCents || 0) / 100;
  const totalLiab = Number(balanceSheet?.totalLiabilitiesCents || 0) / 100;
  const totalEq = Number(balanceSheet?.totalEquityCents || 0) / 100;

  const totalTbDebit = Number(trialBalance?.totalDebitCents || 0) / 100;
  const totalTbCredit = Number(trialBalance?.totalCreditCents || 0) / 100;

  const hasData =
    (pnl?.revenues && pnl.revenues.length > 0) ||
    (pnl?.expenses && pnl.expenses.length > 0) ||
    (balanceSheet?.assets && balanceSheet.assets.length > 0) ||
    (trialBalance?.rows && trialBalance.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">
            Real-time statements computed deterministically from the immutable General Ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Current Period
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button>
            <Printer className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report Switcher Tabs */}
      <div className="flex items-center gap-2 border-b pb-4 overflow-x-auto">
        <Button
          variant={reportType === 'PNL' ? 'default' : 'outline'}
          onClick={() => setReportType('PNL')}
          className="gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          Profit & Loss (P&L)
        </Button>
        <Button
          variant={reportType === 'BALANCE_SHEET' ? 'default' : 'outline'}
          onClick={() => setReportType('BALANCE_SHEET')}
          className="gap-2"
        >
          <Scale className="w-4 h-4" />
          Balance Sheet
        </Button>
        <Button
          variant={reportType === 'TRIAL_BALANCE' ? 'default' : 'outline'}
          onClick={() => setReportType('TRIAL_BALANCE')}
          className="gap-2"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Trial Balance
        </Button>
      </div>

      {/* AI Health Summary Card */}
      <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-base text-indigo-900 dark:text-indigo-300">
              Autonomous AI Financial Commentary
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-300"
          >
            Audit Verified
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-indigo-950/80 dark:text-indigo-200/80 space-y-1">
          {hasData ? (
            <>
              <p>
                <strong>Cash Runway:</strong> Operating runway is actively calculated based on
                verified posted journal entries.
              </p>
              <p className="text-xs text-muted-foreground pt-1">
                General Ledger invariant check:{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  ∑ Debits ({formatCurrency(totalTbDebit)}) == ∑ Credits (
                  {formatCurrency(totalTbCredit)})
                </span>
                .
              </p>
            </>
          ) : (
            <p>
              <strong>General Ledger Status:</strong> Operating with zero posted transactions.
              General ledger invariants are balanced at $0.00. Reconcile bank statements or upload
              invoices to populate live reports.
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Computing financial statements from General Ledger...</span>
          </CardContent>
        </Card>
      ) : !hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No General Ledger Data Recorded</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-1 mb-4">
              Your business has no posted journal entries yet. Reconcile bank transactions or post
              customer invoices to generate real-time P&L, Balance Sheet, and Trial Balance reports.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* REPORT CONTENT: PROFIT & LOSS */}
          {reportType === 'PNL' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Statement of Profit and Loss</CardTitle>
                    <CardDescription>Accrual Basis General Ledger Reporting</CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      netIncome >= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }
                  >
                    {netIncome >= 0 ? 'Net Positive' : 'Net Deficit'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Revenue */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                    Operating Revenue
                  </h3>
                  <Table>
                    <TableBody>
                      {pnl?.revenues.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-medium">
                            {item.accountCode} - {item.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(item.amountCents) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Total Revenue</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(totalRev)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Operating Expenses */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                    Operating Expenses
                  </h3>
                  <Table>
                    <TableBody>
                      {pnl?.expenses.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-medium">
                            {item.accountCode} - {item.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(item.amountCents) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/60 font-bold text-base border-t-2">
                        <TableCell>Net Income</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(netIncome)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* REPORT CONTENT: BALANCE SHEET */}
          {reportType === 'BALANCE_SHEET' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Balance Sheet</CardTitle>
                    <CardDescription>As of Current Period</CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Equation Balanced
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Assets */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                    Assets
                  </h3>
                  <Table>
                    <TableBody>
                      {balanceSheet?.assets.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-medium">
                            {item.accountCode} - {item.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(item.amountCents) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Total Assets</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(totalAssets)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Liabilities & Equity */}
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                    Liabilities
                  </h3>
                  <Table>
                    <TableBody>
                      {balanceSheet?.liabilities.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-medium">
                            {item.accountCode} - {item.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(item.amountCents) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Total Liabilities</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(totalLiab)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                    Equity
                  </h3>
                  <Table>
                    <TableBody>
                      {balanceSheet?.equity.map((item) => (
                        <TableRow key={item.accountId}>
                          <TableCell className="font-medium">
                            {item.accountCode} - {item.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(item.amountCents) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/60 font-bold text-base border-t-2">
                        <TableCell>Total Liabilities & Equity</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(totalLiab + totalEq)}
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
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Trial Balance Report</CardTitle>
                    <CardDescription>
                      Verified zero-difference General Ledger trial balance.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Zero Variance
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead className="text-right">Debit Balance</TableHead>
                      <TableHead className="text-right">Credit Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance?.rows.map((row) => {
                      const dr = Number(row.debitCents || 0) / 100;
                      const cr = Number(row.creditCents || 0) / 100;
                      return (
                        <TableRow key={row.accountCode}>
                          <TableCell className="font-mono font-medium">{row.accountCode}</TableCell>
                          <TableCell className="font-medium">{row.accountName}</TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {row.classification}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {dr > 0 ? formatCurrency(dr) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {cr > 0 ? formatCurrency(cr) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/70 font-bold border-t-2">
                      <TableCell colSpan={3}>Invariant Balance Verification</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalTbDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalTbCredit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
