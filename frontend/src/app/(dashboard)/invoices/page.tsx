'use client';

import * as React from 'react';
import {
  FileText,
  Plus,
  Search,
  Download,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  MoreVertical,
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

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  type: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE';
  counterpartyName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  status: 'DRAFT' | 'POSTED' | 'PAID' | 'OVERDUE' | 'VOID';
}

const mockInvoices: InvoiceRecord[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-0104',
    type: 'ACCOUNTS_RECEIVABLE',
    counterpartyName: 'Acme Global Industries',
    issueDate: '2026-10-01T00:00:00.000Z',
    dueDate: '2026-10-31T00:00:00.000Z',
    totalAmount: 18500.0,
    status: 'POSTED',
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-2026-0103',
    type: 'ACCOUNTS_RECEIVABLE',
    counterpartyName: 'Starlight SaaS Technologies',
    issueDate: '2026-09-28T00:00:00.000Z',
    dueDate: '2026-10-15T00:00:00.000Z',
    totalAmount: 9400.0,
    status: 'PAID',
  },
  {
    id: 'inv-3',
    invoiceNumber: 'BILL-2026-0089',
    type: 'ACCOUNTS_PAYABLE',
    counterpartyName: 'Cloudflare Network Services',
    issueDate: '2026-10-02T00:00:00.000Z',
    dueDate: '2026-10-12T00:00:00.000Z',
    totalAmount: 1420.0,
    status: 'POSTED',
  },
  {
    id: 'inv-4',
    invoiceNumber: 'BILL-2026-0088',
    type: 'ACCOUNTS_PAYABLE',
    counterpartyName: 'Amazon Web Services (AWS)',
    issueDate: '2026-09-15T00:00:00.000Z',
    dueDate: '2026-10-01T00:00:00.000Z',
    totalAmount: 4250.0,
    status: 'OVERDUE',
  },
  {
    id: 'inv-5',
    invoiceNumber: 'INV-2026-0105',
    type: 'ACCOUNTS_RECEIVABLE',
    counterpartyName: 'Helios Logistics Group',
    issueDate: '2026-10-05T00:00:00.000Z',
    dueDate: '2026-11-05T00:00:00.000Z',
    totalAmount: 12100.0,
    status: 'DRAFT',
  },
  {
    id: 'inv-6',
    invoiceNumber: 'BILL-2026-0090',
    type: 'ACCOUNTS_PAYABLE',
    counterpartyName: 'Google Cloud Platform',
    issueDate: '2026-09-20T00:00:00.000Z',
    dueDate: '2026-10-05T00:00:00.000Z',
    totalAmount: 3820.0,
    status: 'PAID',
  },
];

export default function InvoicesPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'OVERDUE'>(
    'ALL',
  );

  const filteredInvoices = mockInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.counterpartyName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (activeTab === 'ALL') return true;
    if (activeTab === 'RECEIVABLE') return inv.type === 'ACCOUNTS_RECEIVABLE';
    if (activeTab === 'PAYABLE') return inv.type === 'ACCOUNTS_PAYABLE';
    if (activeTab === 'OVERDUE') return inv.status === 'OVERDUE';
    return true;
  });

  const getStatusBadge = (status: InvoiceRecord['status']) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            Paid
          </Badge>
        );
      case 'POSTED':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
          >
            Awaiting Payment
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge
            variant="outline"
            className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
          >
            Overdue
          </Badge>
        );
      case 'DRAFT':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
          >
            Draft
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
          <h1 className="text-3xl font-bold tracking-tight">Invoices & Bills</h1>
          <p className="text-muted-foreground mt-1">
            Deterministic Accounts Receivable (AR) & Accounts Payable (AP) ledger integration.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">$40,000.00</div>
            <p className="text-xs text-muted-foreground mt-1">Incoming revenue expected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payables</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">$9,490.00</div>
            <p className="text-xs text-muted-foreground mt-1">Upcoming vendor obligations</p>
          </CardContent>
        </Card>

        <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400">
              Overdue Invoices
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
              $4,250.00
            </div>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
              1 vendor bill past due date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected This Month</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              $13,220.00
            </div>
            <p className="text-xs text-muted-foreground mt-1">Reconciled against general ledger</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
          <Button
            variant={activeTab === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('ALL')}
          >
            All Invoices
          </Button>
          <Button
            variant={activeTab === 'RECEIVABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('RECEIVABLE')}
          >
            Customer Invoices (AR)
          </Button>
          <Button
            variant={activeTab === 'PAYABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('PAYABLE')}
          >
            Vendor Bills (AP)
          </Button>
          <Button
            variant={activeTab === 'OVERDUE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('OVERDUE')}
          >
            Overdue
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice or vendor..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Invoices & Bills Ledger</CardTitle>
          <CardDescription>
            Showing {filteredInvoices.length} entries with double-entry general ledger
            synchronization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-semibold">{inv.invoiceNumber}</TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-muted-foreground">
                      {inv.type === 'ACCOUNTS_RECEIVABLE' ? 'Customer (AR)' : 'Vendor (AP)'}
                    </span>
                  </TableCell>
                  <TableCell>{inv.counterpartyName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatIsoDate(inv.issueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatIsoDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(inv.totalAmount)}
                  </TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
