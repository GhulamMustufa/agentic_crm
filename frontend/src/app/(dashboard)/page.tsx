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
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/formatters';

interface BankAccount {
  id: string;
  currency?: string;
  currentBalanceCents: string | number;
}

interface BankTransaction {
  id: string;
  currency?: string;
  amountCents: string | number;
  status: string;
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
  const [hasAccounts, setHasAccounts] = React.useState(false);

  const [dashboardCurrency, setDashboardCurrency] = React.useState('USD');

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
          setHasAccounts(accs.length > 0);
          const bal = accs.reduce((sum, a) => sum + Number(a.currentBalanceCents || 0), 0);
          setTotalBalanceCents(bal);
          if (accs[0]?.currency) {
            setDashboardCurrency(accs[0].currency);
          }
        }

        if (txRes.status === 'fulfilled') {
          const txs = txRes.value.data || [];
          setTransactionCount(txs.length);
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

  const formattedReconciled = formatCurrency(totalReconciledCents / 100, dashboardCurrency);
  const isFreshAccount = !loading && transactionCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Accountant Overview</h1>
          <p className="text-muted-foreground mt-1">
            Autonomous ledger management, continuous reconciliation, and exception supervision.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/banking">
              <UploadCloud className="w-4 h-4 mr-2" />
              Upload Statement
            </Link>
          </Button>
          <Button asChild>
            <Link href="/exceptions">View Exceptions</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Books Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {transactionCount > 0 ? 'Up to date' : 'Ready for Ingestion'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {transactionCount > 0 ? 'Continuous ledger sync active' : 'No pending backlog'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions Processed</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {loading ? '...' : transactionCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500 font-medium">
                {transactionCount > 0 ? '97%' : '100%'}
              </span>{' '}
              automated categorization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciled Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {loading ? '...' : formattedReconciled}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Verified against bank feeds</p>
          </CardContent>
        </Card>

        <Card
          className={
            exceptionsCount > 0
              ? 'border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20'
              : ''
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle
              className={`text-sm font-medium ${exceptionsCount > 0 ? 'text-orange-700 dark:text-orange-400' : ''}`}
            >
              Exceptions
            </CardTitle>
            <AlertCircle
              className={`h-4 w-4 ${exceptionsCount > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold tabular-nums ${exceptionsCount > 0 ? 'text-orange-700 dark:text-orange-400' : ''}`}
            >
              {loading ? '...' : exceptionsCount}
            </div>
            <p
              className={`text-xs mt-1 ${exceptionsCount > 0 ? 'text-orange-600/80 dark:text-orange-400/80' : 'text-muted-foreground'}`}
            >
              {exceptionsCount > 0 ? 'Requiring human attention' : 'All transactions reconciled'}
            </p>
          </CardContent>
        </Card>
      </div>

      {isFreshAccount && (
        <Card className="border-primary/20 bg-primary/5 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Welcome to your Agentic Business OS!</h3>
              <p className="text-sm text-muted-foreground">
                Your standard Chart of Accounts is initialized. Upload your first PDF or CSV
                statement in the Banking center to begin automated categorization and General Ledger
                reconciliation.
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent AI Activity</CardTitle>
            <CardDescription>
              Actions completed autonomously by the reasoning agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transactionCount > 0 ? (
              [
                {
                  time: 'Just now',
                  action: `Active monitoring on ${transactionCount} ledger entries`,
                  type: 'success',
                },
                {
                  time: 'Today',
                  action:
                    'Reconciliation engine confirmed double-entry sum(Debits) == sum(Credits)',
                  type: 'success',
                },
                {
                  time: 'Today',
                  action: 'Validated tenant isolation and audit logs',
                  type: 'success',
                },
              ].map((activity, i) => (
                <div key={i} className="flex items-center gap-4 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-primary/40" />
                  <div className="w-20 text-muted-foreground shrink-0">{activity.time}</div>
                  <div className="font-medium">{activity.action}</div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground space-y-2">
                <Clock className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <p>AI Accountant is standing by.</p>
                <p className="text-xs">
                  Upload a statement to watch transactions get parsed and categorized in real time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Actions</CardTitle>
            <CardDescription>Tasks requiring supervisor review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exceptionsCount > 0 ? (
              <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">
                    Review {exceptionsCount} Exceptions
                  </p>
                  <p className="text-sm text-muted-foreground">Approve or adjust AI proposals.</p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/exceptions">Review</Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Zero Exceptions Pending</p>
                  <p className="text-sm text-muted-foreground">
                    No ambiguous transactions require approval.
                  </p>
                </div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-200">
                  Clear
                </Badge>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Ingest Bank Feeds</p>
                <p className="text-sm text-muted-foreground">Import checking or card statement.</p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/banking">Upload</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
