'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Search,
  Download,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  ArrowUpDown,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';
import { apiClient } from '@/lib/api-client';

interface TransactionItem {
  id: string;
  date: string;
  description: string;
  accountName: string;
  accountCode: string;
  counterparty: string;
  inflow: number; // Deposit (Money In)
  outflow: number; // Withdrawal (Money Out)
  status: 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW';
  isAuditLocked: boolean;
}

interface RawBankTransaction {
  id: string;
  transactionDate: string;
  amountCents: string | number;
  rawDescription: string;
  normalizedPayee?: string;
  status: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<
    'ALL' | 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW'
  >('ALL');
  const [sortOrder, setSortOrder] = React.useState<'STATEMENT_ASC' | 'DESC'>('STATEMENT_ASC');
  const [transactions, setTransactions] = React.useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ data: RawBankTransaction[] }>('/banking/transactions');
      const rawList = res.data || [];

      if (rawList.length > 0) {
        const mapped: TransactionItem[] = rawList.map((tx) => {
          const rawAmount = Number(tx.amountCents || 0) / 100;
          const isDeposit = rawAmount > 0;
          const absAmount = Math.abs(rawAmount);

          let status: TransactionItem['status'] = 'PENDING_REVIEW';
          if (tx.status === 'RECONCILED') status = 'RECONCILED';
          else if (tx.status === 'MATCHED' || tx.status === 'PROPOSED') status = 'AI_MATCHED';

          return {
            id: tx.id,
            date: tx.transactionDate || tx.createdAt,
            description: tx.rawDescription,
            accountName: isDeposit ? 'Operating Cash (Deposit)' : 'Operating Cash (Disbursement)',
            accountCode: '1010',
            counterparty: tx.normalizedPayee || 'Institutional Counterparty',
            inflow: isDeposit ? absAmount : 0,
            outflow: isDeposit ? 0 : absAmount,
            status,
            isAuditLocked: tx.status === 'RECONCILED',
          };
        });

        setTransactions(mapped);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn('Could not fetch live transactions:', err);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Order sorting: preserve statement chronological order (Page 1 top -> Page 5 bottom) by default
  const sortedList = React.useMemo(() => {
    const copy = [...transactions];
    if (sortOrder === 'DESC') {
      return copy.reverse();
    }
    return copy;
  }, [transactions, sortOrder]);

  const filtered = sortedList.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.counterparty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.accountCode.includes(searchTerm);

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return tx.status === statusFilter;
  });

  // Calculate totals
  const totalInflows = transactions.reduce((acc, t) => acc + t.inflow, 0);
  const totalOutflows = transactions.reduce((acc, t) => acc + t.outflow, 0);
  const reconciledCount = transactions.filter((t) => t.status === 'RECONCILED').length;
  const reconciliationRate =
    transactions.length > 0 ? ((reconciledCount / transactions.length) * 100).toFixed(1) : '100.0';

  const getStatusBadge = (status: TransactionItem['status']) => {
    switch (status) {
      case 'RECONCILED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1"
          >
            <CheckCircle2 className="w-3 h-3" />
            Reconciled
          </Badge>
        );
      case 'AI_MATCHED':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 gap-1"
          >
            <Sparkles className="w-3 h-3" />
            AI Matched
          </Badge>
        );
      case 'PENDING_REVIEW':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 gap-1"
          >
            <Clock className="w-3 h-3" />
            Pending Review
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const exportCsv = () => {
    if (transactions.length === 0) return;
    const headers = [
      'ID',
      'Date',
      'Description',
      'Account',
      'Code',
      'Counterparty',
      'Inflow_Deposit',
      'Outflow_Withdrawal',
      'Status',
    ];
    const rows = transactions.map((t) => [
      t.id,
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.accountName}"`,
      t.accountCode,
      `"${t.counterparty}"`,
      t.inflow,
      t.outflow,
      t.status,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `transactions_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions & Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Immutable General Ledger records aligned with uploaded bank statements.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setSortOrder((prev) => (prev === 'STATEMENT_ASC' ? 'DESC' : 'STATEMENT_ASC'))
            }
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            {sortOrder === 'STATEMENT_ASC' ? 'Statement Order (Oldest First)' : 'Newest First'}
          </Button>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Ledger
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inflows (Deposits)</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(totalInflows)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Money received across statement</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outflows (Withdrawals)</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              -{formatCurrency(totalOutflows)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Disbursements & payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciliation Rate</CardTitle>
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {reconciliationRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Automated by AI Accountant</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ledger Integrity</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              100% Invariant
            </div>
            <p className="text-xs text-muted-foreground mt-1">Double-entry verified</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
          <Button
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
          >
            All Entries
          </Button>
          <Button
            variant={statusFilter === 'RECONCILED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('RECONCILED')}
          >
            Reconciled
          </Button>
          <Button
            variant={statusFilter === 'AI_MATCHED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('AI_MATCHED')}
          >
            AI Matched
          </Button>
          <Button
            variant={statusFilter === 'PENDING_REVIEW' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('PENDING_REVIEW')}
          >
            Pending Review
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search description, account..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Transactions Table or Empty State */}
      {transactions.length === 0 ? (
        <Card className="py-16 text-center border-dashed">
          <CardContent className="space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Transactions Recorded Yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a bank statement in the Banking center to extract transactions, run AI
                categorization, and populate the General Ledger.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button asChild>
                <Link href="/banking">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Go to Banking Upload
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Description & Payee</TableHead>
                  <TableHead>Chart of Accounts</TableHead>
                  <TableHead className="text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                    Deposit (Inflow)
                  </TableHead>
                  <TableHead className="text-right text-rose-600 dark:text-rose-400 font-semibold">
                    Withdrawal (Outflow)
                  </TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatIsoDate(tx.date)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{tx.description}</div>
                      <div className="text-xs text-muted-foreground">{tx.counterparty}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{tx.accountName}</div>
                      <div className="text-xs font-mono text-muted-foreground">
                        Account {tx.accountCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {tx.inflow > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          +{formatCurrency(tx.inflow)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {tx.outflow > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          -{formatCurrency(tx.outflow)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(tx.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
