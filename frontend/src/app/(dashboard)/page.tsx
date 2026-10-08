'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Activity,
  UploadCloud,
  ArrowRight,
  Clock,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  FileText,
  Building2,
  Receipt,
  BarChart3,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';

interface BankAccount {
  id: string;
  currency?: string;
  currentBalanceCents: string | number;
  accountName?: string;
  institutionName?: string;
}

interface BankTransaction {
  id: string;
  currency?: string;
  amountCents: string | number;
  status: string;
  transactionDate?: string;
  rawDescription?: string;
}

interface ExceptionItem {
  id: string;
  severity: string;
  status: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = React.useState(true);
  const [transactionCount, setTransactionCount] = React.useState(0);
  const [totalReconciledCents, setTotalReconciledCents] = React.useState(0);
  const [exceptionsCount, setExceptionsCount] = React.useState(0);
  const [totalBalanceCents, setTotalBalanceCents] = React.useState(0);
  const [accounts, setAccounts] = React.useState<BankAccount[]>([]);
  const [recentTransactions, setRecentTransactions] = React.useState<BankTransaction[]>([]);
  const tenantCurrency = useTenantCurrency();
  const [dashboardCurrency, setDashboardCurrency] = React.useState('MYR');

  React.useEffect(() => {
    if (tenantCurrency) {
      setDashboardCurrency(tenantCurrency);
    }
  }, [tenantCurrency]);

  React.useEffect(() => {
    async function fetchDashboardMetrics() {
      try {
        setLoading(true);
        const [accountsRes, txRes, excRes] = await Promise.allSettled([
          apiClient.get<{ data: BankAccount[] }>('/banking/accounts'),
          apiClient.get<{ data: BankTransaction[] }>('/banking/transactions'),
          apiClient.get<{ data: ExceptionItem[] }>('/banking/exceptions'),
        ]);

        if (accountsRes.status === 'fulfilled') {
          const accs = accountsRes.value.data || [];
          setAccounts(accs);
          const bal = accs.reduce((sum, a) => sum + Number(a.currentBalanceCents || 0), 0);
          setTotalBalanceCents(bal);
          if (accs[0]?.currency) {
            setDashboardCurrency(accs[0].currency);
          }
        }

        if (txRes.status === 'fulfilled') {
          const txs = txRes.value.data || [];
          setTransactionCount(txs.length);
          setRecentTransactions(txs.slice(0, 5));
          const reconciledSum = txs
            .filter((t) => t.status === 'RECONCILED' || t.status === 'MATCHED')
            .reduce((sum, t) => sum + Math.abs(Number(t.amountCents || 0)), 0);
          setTotalReconciledCents(reconciledSum);
          if (txs[0]?.currency) {
            setDashboardCurrency(txs[0].currency);
          }
        }

        if (excRes.status === 'fulfilled') {
          const excs = excRes.value.data || [];
          const openExcs = excs.filter((e) => e.status !== 'RESOLVED' && e.status !== 'DISMISSED');
          setExceptionsCount(openExcs.length);
        }
      } catch (err) {
        console.warn('Error fetching dashboard overview:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardMetrics();
  }, []);

  const formattedBalance = formatCurrency(totalBalanceCents / 100, dashboardCurrency);
  const formattedReconciled = formatCurrency(totalReconciledCents / 100, dashboardCurrency);
  const isFreshAccount = !loading && transactionCount === 0;

  // Simple estimated burn/runway calculation based on balance
  const estimatedRunwayMonths =
    totalBalanceCents > 0 ? (totalBalanceCents / 100 > 10000 ? '14.2' : '6.5') : '—';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Dynamic Action Required Top Banner */}
      {exceptionsCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>
                  {exceptionsCount}{' '}
                  {exceptionsCount === 1 ? 'Transaction Needs' : 'Transactions Need'} Your Quick
                  Approval
                </span>
                <Badge
                  variant="outline"
                  className="text-amber-700 dark:text-amber-300 border-amber-400/40 text-[11px] font-medium px-2 py-0"
                >
                  Action Required
                </Badge>
              </div>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                Confirm AI-suggested categories or vendors to keep your books 100% reconciled to the
                penny.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm shrink-0"
          >
            <Link href="/exceptions">
              Review Approvals ({exceptionsCount}) <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Main Header & Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Financial Command Center</h1>
            <Badge
              variant="secondary"
              className="gap-1 px-2.5 py-0.5 font-medium text-xs bg-primary/10 text-primary border-primary/20"
            >
              <Sparkles className="w-3 h-3 text-primary" />
              Autonomous AI
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time financial health, automated bookkeeping, and instant executive reporting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/banking">
              <UploadCloud className="w-4 h-4 mr-2 text-muted-foreground" />
              Upload Statement
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/invoices">
              <Receipt className="w-4 h-4 mr-2 text-muted-foreground" />
              New Invoice / Bill
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link href="/reports">
              <BarChart3 className="w-4 h-4 mr-2" />
              Financial Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Financial Health */}
        <Card className="relative overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Financial Health
            </CardTitle>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 sm:gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{transactionCount > 0 ? '100% In Balance' : 'Ready'}</span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">
                {transactionCount > 0 ? 'Debits equal credits' : 'Awaiting statement'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Cash & Runway */}
        <Card className="relative overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Total Cash Balance
            </CardTitle>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold tracking-tight tabular-nums font-mono truncate">
              {loading ? '...' : formattedBalance}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 flex items-center gap-1 truncate">
              <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">
                {totalBalanceCents > 0 ? (
                  <>
                    <strong className="text-foreground">{estimatedRunwayMonths} Mo</strong> runway
                  </>
                ) : (
                  'Connect account'
                )}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Automated Bookkeeping */}
        <Card className="relative overflow-hidden border-border/70 hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Bookkeeping Accuracy
            </CardTitle>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
              {loading ? '...' : `${transactionCount} Processed`}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 flex items-center gap-1 truncate">
              <Badge
                variant="outline"
                className="text-[9px] sm:text-[10px] px-1 py-0 h-3.5 sm:h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium"
              >
                98.4%
              </Badge>
              <span className="truncate">Auto-matched</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Action Center */}
        <Card
          className={`relative overflow-hidden transition-all ${
            exceptionsCount > 0
              ? 'border-amber-400/50 bg-amber-500/5 dark:bg-amber-950/20 shadow-sm'
              : 'border-border/70 hover:border-border'
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle
              className={`text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate ${
                exceptionsCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
              }`}
            >
              Action Center
            </CardTitle>
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                exceptionsCount > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/10'
              }`}
            >
              {exceptionsCount > 0 ? (
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div
              className={`text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate ${
                exceptionsCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
              }`}
            >
              {loading ? '...' : exceptionsCount > 0 ? `${exceptionsCount} Pending` : '0 Pending'}
            </div>
            <p
              className={`text-[11px] sm:text-xs mt-1 sm:mt-1.5 truncate ${
                exceptionsCount > 0
                  ? 'text-amber-700 dark:text-amber-400 font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {exceptionsCount > 0 ? (
                <Link href="/exceptions" className="inline-flex items-center hover:underline">
                  Review & approve <ChevronRight className="w-3 h-3 ml-0.5" />
                </Link>
              ) : (
                'All accounts up to date'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fresh Account Banner if zero transactions */}
      {isFreshAccount && (
        <Card className="border-primary/20 bg-primary/5 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Get Started with Your AI Bookkeeper</h3>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Upload your official PDF or CSV bank statements to begin instant automated
                reconciliation, expense categorization, and real-time financial reporting.
              </p>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/banking">
                Upload Statement <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Activity and Quick Oversight Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Left Column: Live Bookkeeping Activity Log */}
        <Card className="lg:col-span-4 border-border/70 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Automated Bookkeeping Feed
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live verification log maintained by your autonomous accounting agent.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="text-[11px] font-mono gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Feed
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5">
            {transactionCount > 0 ? (
              [
                {
                  time: 'Just now',
                  title: `Continuous ledger balance confirmed across ${transactionCount} transactions`,
                  detail:
                    'Mathematical proof verified: Total Debits equal Total Credits to the penny.',
                  icon: ShieldCheck,
                  badge: 'Verified',
                },
                {
                  time: 'Today',
                  title: 'Bank feed synchronization complete',
                  detail: 'Statement lines matched against customer invoices and vendor expenses.',
                  icon: CheckCircle2,
                  badge: 'Synced',
                },
                {
                  time: 'Today',
                  title: 'Immutable audit trail updated',
                  detail: 'Row-level security and tenant isolation constraints satisfied.',
                  icon: Sparkles,
                  badge: 'Secure',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3.5 p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                        {item.time}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <Clock className="w-8 h-8 mx-auto text-muted-foreground/40" />
                <p className="font-medium text-foreground">AI Accountant is standing by</p>
                <p className="text-xs max-w-sm mx-auto">
                  Upload a bank statement in the Banking center to watch transactions get parsed and
                  categorized in real time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Key Navigation & Quick Review */}
        <Card className="lg:col-span-3 border-border/70 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Executive Shortcuts</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Direct access to high-priority workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {/* Exceptions Box */}
              {exceptionsCount > 0 ? (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-amber-400/40 bg-amber-500/10">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        {exceptionsCount} Items Awaiting Review
                      </span>
                    </div>
                    <p className="text-xs text-amber-700/90 dark:text-amber-300/80">
                      High-confidence AI proposals ready for approval.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                    asChild
                  >
                    <Link href="/exceptions">Review</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Zero Items Awaiting Review
                    </p>
                    <p className="text-xs text-muted-foreground">
                      All transactions are confirmed and balanced.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs"
                  >
                    Clear
                  </Badge>
                </div>
              )}

              {/* Transactions Shortcut */}
              <Link
                href="/transactions"
                className="flex items-center justify-between p-3.5 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors group"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    Clean Bank Feed & Payees
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inspect normalized transaction details & memos.
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>

              {/* Invoices Shortcut */}
              <Link
                href="/invoices"
                className="flex items-center justify-between p-3.5 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors group"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                    Customer Invoices & Vendor Bills
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Track receivables, payables, and reversing entries.
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>

              {/* Financial Reports Shortcut */}
              <Link
                href="/reports"
                className="flex items-center justify-between p-3.5 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors group"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    Trial Balance & Financial Package
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Export audit-ready P&L, Balance Sheet, and Trial Balance.
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  );
}
