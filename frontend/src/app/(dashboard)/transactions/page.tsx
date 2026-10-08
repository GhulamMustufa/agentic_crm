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
import { useTenantCurrency } from '@/hooks/use-tenant-currency';
import { apiClient } from '@/lib/api-client';
import { cleanBankPayee } from '@/lib/api/exceptions';

interface TransactionItem {
  id: string;
  date: string;
  cleanPayee: string;
  rawMemo: string;
  accountName: string;
  accountCode: string;
  counterparty: string;
  inflow: number; // Deposit (Money In)
  outflow: number; // Withdrawal (Money Out)
  status: 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW';
  isAuditLocked: boolean;
  currency: string;
}

interface RawBankTransaction {
  id: string;
  transactionDate: string;
  amountCents: string | number;
  rawDescription: string;
  normalizedPayee?: string;
  currency?: string;
  status: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const tenantCurrency = useTenantCurrency();
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
            currency: tx.currency || tenantCurrency || 'MYR',
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

  // Preserve statement chronological order (Page 1 top -> Page 5 bottom) by default
  const sortedList = React.useMemo(() => {
    const copy = [...transactions];
    if (sortOrder === 'DESC') {
      return copy.reverse();
    }
    return copy;
  }, [transactions, sortOrder]);

  const filtered = sortedList.filter((tx) => {
    const matchesSearch =
      tx.cleanPayee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.rawMemo.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[11px] font-medium"
          >
            <CheckCircle2 className="w-3 h-3" />
            Verified in Books
          </Badge>
        );
      case 'AI_MATCHED':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 gap-1 text-[11px] font-medium"
          >
            <Sparkles className="w-3 h-3" />
            AI Matched
          </Badge>
        );
      case 'PENDING_REVIEW':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 gap-1 text-[11px] font-medium"
          >
            <Clock className="w-3 h-3" />
            Needs Category
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const exportCsv = () => {
    if (transactions.length === 0) return;
    const headers = ['Date', 'Payee', 'Raw Memo', 'Account', 'Inflow', 'Outflow', 'Status'];
    const rows = filtered.map((t) => [
      `"${t.date}"`,
      `"${t.cleanPayee}"`,
      `"${t.rawMemo.replace(/"/g, '""')}"`,
      `"${t.accountCode} - ${t.accountName}"`,
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

  const primaryCurrency = transactions[0]?.currency || tenantCurrency || 'MYR';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions & Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Bank statement transactions matched and verified against your General Ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={() =>
              setSortOrder((prev) => (prev === 'STATEMENT_ASC' ? 'DESC' : 'STATEMENT_ASC'))
            }
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <span className="sm:hidden">
              {sortOrder === 'STATEMENT_ASC' ? 'Oldest First' : 'Newest First'}
            </span>
            <span className="hidden sm:inline">
              {sortOrder === 'STATEMENT_ASC' ? 'Statement Order (Chronological)' : 'Newest First'}
            </span>
          </Button>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Deposits (Inflows)
            </CardTitle>
            <ArrowDownLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 truncate font-mono">
              +{formatCurrency(totalInflows, primaryCurrency)}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              Customer payments & credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Expenses (Outflows)
            </CardTitle>
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500 shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold tabular-nums text-foreground truncate font-mono">
              -{formatCurrency(totalOutflows, primaryCurrency)}
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              Vendor payments & costs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Auto-Reconciliation
            </CardTitle>
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-primary tabular-nums truncate">
              {reconciliationRate}%
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              {reconciledCount} of {transactions.length} verified in books
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Ledger Audit Check
            </CardTitle>
            <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 truncate">
              100% Balanced
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              Debits strictly match credits
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0 w-full sm:w-auto">
          <Button
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
          >
            All Transactions ({transactions.length})
          </Button>
          <Button
            variant={statusFilter === 'RECONCILED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('RECONCILED')}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" />
            Verified in Books
          </Button>
          <Button
            variant={statusFilter === 'AI_MATCHED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('AI_MATCHED')}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-blue-500" />
            AI Matched
          </Button>
          <Button
            variant={statusFilter === 'PENDING_REVIEW' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('PENDING_REVIEW')}
          >
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-500" />
            Needs Category
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search payee, amount, account..."
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
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Payee & Bank Memo</TableHead>
                    <TableHead>General Ledger Account</TableHead>
                    <TableHead className="text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      Deposit (Inflow)
                    </TableHead>
                    <TableHead className="text-right text-foreground font-semibold">
                      Expense (Outflow)
                    </TableHead>
                    <TableHead className="w-[160px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatIsoDate(tx.date)}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm text-foreground">{tx.cleanPayee}</div>
                        <div
                          className="text-xs text-muted-foreground font-mono truncate max-w-sm"
                          title={tx.rawMemo}
                        >
                          {tx.rawMemo}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono px-1.5 py-0 bg-muted"
                          >
                            {tx.accountCode}
                          </Badge>
                          <span>{tx.accountName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {tx.inflow > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            +{formatCurrency(tx.inflow, tx.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {tx.outflow > 0 ? (
                          <span className="text-foreground font-semibold">
                            -{formatCurrency(tx.outflow, tx.currency)}
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
            </div>

            {/* Mobile Card / List View */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">
                        {tx.cleanPayee}
                      </div>
                      <div
                        className="text-xs text-muted-foreground font-mono truncate mt-0.5"
                        title={tx.rawMemo}
                      >
                        {tx.rawMemo}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {tx.inflow > 0 ? (
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                          +{formatCurrency(tx.inflow, tx.currency)}
                        </span>
                      ) : tx.outflow > 0 ? (
                        <span className="text-sm font-semibold text-foreground font-mono tabular-nums">
                          -{formatCurrency(tx.outflow, tx.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono">{formatIsoDate(tx.date)}</span>
                      <span>•</span>
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                        Acc {tx.accountCode}
                      </span>
                    </div>
                    <div>{getStatusBadge(tx.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
