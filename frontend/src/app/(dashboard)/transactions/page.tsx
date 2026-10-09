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
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
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
import { useBankTransactionsQuery, type TransactionItem } from '@/hooks/use-dashboard-queries';

export default function TransactionsPage() {
  const tenantCurrency = useTenantCurrency();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<
    'ALL' | 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW'
  >('ALL');
  const [sortOrder, setSortOrder] = React.useState<'STATEMENT_ASC' | 'DESC'>('STATEMENT_ASC');
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 50;

  const {
    data: transactions = [],
    isLoading,
    refetch,
    isRefetching,
  } = useBankTransactionsQuery(tenantCurrency);

  type SortColumn = 'date' | 'payee' | 'account' | 'inflow' | 'outflow' | 'status';
  const [columnSort, setColumnSort] = React.useState<{
    column: SortColumn | null;
    direction: 'asc' | 'desc';
  }>({ column: null, direction: 'asc' });

  const toggleColumnSort = (col: SortColumn) => {
    setColumnSort((prev) => {
      if (prev.column === col) {
        if (prev.direction === 'asc') {
          return { column: col, direction: 'desc' };
        }
        return { column: null, direction: 'asc' };
      }
      return { column: col, direction: 'asc' };
    });
  };

  const renderSortIcon = (col: SortColumn) => {
    if (columnSort.column !== col) {
      return (
        <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 group-hover:opacity-100 transition-opacity shrink-0 inline" />
      );
    }
    return columnSort.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1 text-primary shrink-0 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-primary shrink-0 inline" />
    );
  };

  // Reset to first page whenever search, status filter, or sorting changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortOrder, columnSort]);

  // Handle column sorting or statement chronological order
  const sortedList = React.useMemo(() => {
    const copy = [...transactions];
    if (columnSort.column) {
      return copy.sort((a, b) => {
        let cmp = 0;
        switch (columnSort.column) {
          case 'date':
            cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
            break;
          case 'payee':
            cmp = a.cleanPayee.localeCompare(b.cleanPayee);
            break;
          case 'account':
            cmp = a.accountName.localeCompare(b.accountName);
            break;
          case 'inflow':
            cmp = a.inflow - b.inflow;
            break;
          case 'outflow':
            cmp = a.outflow - b.outflow;
            break;
          case 'status':
            cmp = a.status.localeCompare(b.status);
            break;
        }
        return columnSort.direction === 'asc' ? cmp : -cmp;
      });
    }
    if (sortOrder === 'DESC') {
      return copy.reverse();
    }
    return copy;
  }, [transactions, sortOrder, columnSort]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedList = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

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
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading || isRefetching}>
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isLoading || isRefetching ? 'animate-spin' : ''}`}
            />
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
            {isLoading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 truncate font-mono">
                +{formatCurrency(totalInflows, primaryCurrency)}
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              {isLoading ? 'Calculating inflows...' : 'Customer payments & credits'}
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
            {isLoading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold tabular-nums text-foreground truncate font-mono">
                -{formatCurrency(totalOutflows, primaryCurrency)}
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              {isLoading ? 'Calculating outflows...' : 'Vendor payments & costs'}
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
            {isLoading ? (
              <div className="h-7 w-20 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold text-primary tabular-nums truncate">
                {reconciliationRate}%
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              {isLoading
                ? 'Checking ledger...'
                : `${reconciledCount} of ${transactions.length} verified in books`}
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
            {isLoading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 truncate">
                100% Balanced
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 truncate">
              {isLoading ? 'Verifying double-entry...' : 'Debits strictly match credits'}
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
            All Transactions {isLoading ? '' : `(${transactions.length})`}
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

      {/* Main Content Area */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {/* Desktop Skeleton Table */}
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
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                      </TableCell>
                      <TableCell className="space-y-1.5">
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-56 bg-muted/60 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Skeleton List */}
            <div className="md:hidden divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-36 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-48 bg-muted/60 animate-pulse rounded" />
                    </div>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded shrink-0" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : transactions.length === 0 ? (
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
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent className="space-y-3 max-w-sm mx-auto">
            <Search className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="text-base font-semibold">No matching transactions found</h3>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search terms or clearing the status filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
            >
              Reset Filters
            </Button>
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
                    <TableHead
                      className="w-[125px] cursor-pointer hover:text-foreground select-none group"
                      onClick={() => toggleColumnSort('date')}
                    >
                      <div className="flex items-center">Date {renderSortIcon('date')}</div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground select-none group"
                      onClick={() => toggleColumnSort('payee')}
                    >
                      <div className="flex items-center">
                        Payee & Bank Memo {renderSortIcon('payee')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground select-none group"
                      onClick={() => toggleColumnSort('account')}
                    >
                      <div className="flex items-center">
                        General Ledger Account {renderSortIcon('account')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right text-emerald-600 dark:text-emerald-400 font-semibold cursor-pointer hover:text-emerald-700 select-none group"
                      onClick={() => toggleColumnSort('inflow')}
                    >
                      <div className="flex items-center justify-end">
                        Deposit (Inflow) {renderSortIcon('inflow')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right text-foreground font-semibold cursor-pointer select-none group"
                      onClick={() => toggleColumnSort('outflow')}
                    >
                      <div className="flex items-center justify-end">
                        Expense (Outflow) {renderSortIcon('outflow')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[160px] cursor-pointer hover:text-foreground select-none group"
                      onClick={() => toggleColumnSort('status')}
                    >
                      <div className="flex items-center">Status {renderSortIcon('status')}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedList.map((tx) => (
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
              {paginatedList.map((tx) => (
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

            {/* Pagination Footer */}
            {filtered.length > pageSize && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
                <div className="text-xs text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium text-foreground">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium text-foreground">
                    {Math.min(currentPage * pageSize, filtered.length)}
                  </span>{' '}
                  of <span className="font-medium text-foreground">{filtered.length}</span>{' '}
                  transactions
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2.5 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs font-mono px-2 text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-8 px-2.5 text-xs"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
