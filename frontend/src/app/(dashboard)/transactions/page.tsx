'use client';

import * as React from 'react';
import {
  Receipt,
  Search,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface TransactionItem {
  id: string;
  date: string;
  description: string;
  accountName: string;
  accountCode: string;
  counterparty: string;
  debit: number;
  credit: number;
  status: 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW';
  isAuditLocked: boolean;
}

const mockTransactions: TransactionItem[] = [
  {
    id: 'tx-1',
    date: '2026-10-06T08:15:00.000Z',
    description: 'Customer Wire Payment - INV-2026-0103',
    accountName: 'Operating Cash',
    accountCode: '1010',
    counterparty: 'Starlight SaaS Technologies',
    debit: 9400.0,
    credit: 0,
    status: 'RECONCILED',
    isAuditLocked: true,
  },
  {
    id: 'tx-2',
    date: '2026-10-06T08:15:00.000Z',
    description: 'Accounts Receivable Relief - INV-2026-0103',
    accountName: 'Accounts Receivable',
    accountCode: '1200',
    counterparty: 'Starlight SaaS Technologies',
    debit: 0,
    credit: 9400.0,
    status: 'RECONCILED',
    isAuditLocked: true,
  },
  {
    id: 'tx-3',
    date: '2026-10-05T14:20:00.000Z',
    description: 'Monthly Infrastructure & CDN Compute',
    accountName: 'Cloud Infrastructure',
    accountCode: '6010',
    counterparty: 'Cloudflare Network Services',
    debit: 1420.0,
    credit: 0,
    status: 'AI_MATCHED',
    isAuditLocked: false,
  },
  {
    id: 'tx-4',
    date: '2026-10-05T14:20:00.000Z',
    description: 'Accounts Payable Accrual',
    accountName: 'Accounts Payable',
    accountCode: '2010',
    counterparty: 'Cloudflare Network Services',
    debit: 0,
    credit: 1420.0,
    status: 'AI_MATCHED',
    isAuditLocked: false,
  },
  {
    id: 'tx-5',
    date: '2026-10-04T10:00:00.000Z',
    description: 'Semi-Monthly Payroll Batch Run #18',
    accountName: 'Payroll Expense - Engineering',
    accountCode: '6100',
    counterparty: 'Payroll Processing',
    debit: 48500.0,
    credit: 0,
    status: 'RECONCILED',
    isAuditLocked: true,
  },
  {
    id: 'tx-6',
    date: '2026-10-04T10:00:00.000Z',
    description: 'Payroll Direct Deposits Outflow',
    accountName: 'Operating Cash',
    accountCode: '1010',
    counterparty: 'Payroll Clearing',
    debit: 0,
    credit: 48500.0,
    status: 'RECONCILED',
    isAuditLocked: true,
  },
  {
    id: 'tx-7',
    date: '2026-10-03T18:45:00.000Z',
    description: 'Unrecognized Card Swipe - Merchant #892',
    accountName: 'Suspense / Uncategorized',
    accountCode: '1999',
    counterparty: 'Unknown Vendor',
    debit: 340.0,
    credit: 0,
    status: 'PENDING_REVIEW',
    isAuditLocked: false,
  },
];

export default function TransactionsPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<
    'ALL' | 'RECONCILED' | 'AI_MATCHED' | 'PENDING_REVIEW'
  >('ALL');

  const filtered = mockTransactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.counterparty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.accountCode.includes(searchTerm);

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return tx.status === statusFilter;
  });

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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions & Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Immutable double-entry General Ledger audit trail and synced banking feed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Ledger
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ledger Debits</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">$59,660.00</div>
            <p className="text-xs text-muted-foreground mt-1">Current accounting period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ledger Credits</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">$59,660.00</div>
            <p className="text-xs text-muted-foreground mt-1">Balanced (Debits == Credits)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciliation Rate</CardTitle>
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">98.2%</div>
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

      {/* Transactions Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Journal Entry Records</CardTitle>
          <CardDescription>
            Live stream of posted debits and credits across the organization chart of accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatIsoDate(tx.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{tx.accountName}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        Code: {tx.accountCode}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{tx.description}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.counterparty}</TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {tx.debit > 0 ? (
                      <span className="text-foreground font-semibold">
                        {formatCurrency(tx.debit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {tx.credit > 0 ? (
                      <span className="text-foreground font-semibold">
                        {formatCurrency(tx.credit)}
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
    </div>
  );
}
