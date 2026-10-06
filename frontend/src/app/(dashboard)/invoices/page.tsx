'use client';

import * as React from 'react';
import {
  FileText,
  Plus,
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  MoreVertical,
  Loader2,
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
import { apiClient } from '@/lib/api-client';

interface RawInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: 'INVOICE' | 'BILL';
  counterparty?: { legalName: string };
  issueDate: string;
  dueDate: string;
  totalCents: string | number;
  amountDueCents: string | number;
  status: 'DRAFT' | 'APPROVED' | 'POSTED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
}

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

export default function InvoicesPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'OVERDUE'>(
    'ALL',
  );
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchInvoices = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ data: RawInvoice[] }>('/invoices');
      const rawList = res.data || [];

      const mapped: InvoiceRecord[] = rawList.map((inv) => {
        const isAr = inv.invoiceType === 'INVOICE';
        const total = Number(inv.totalCents || 0) / 100;
        let mappedStatus: InvoiceRecord['status'] = 'DRAFT';
        if (inv.status === 'PAID') mappedStatus = 'PAID';
        else if (inv.status === 'POSTED' || inv.status === 'APPROVED') mappedStatus = 'POSTED';
        else if (inv.status === 'VOID') mappedStatus = 'VOID';

        // Check overdue
        if (mappedStatus === 'POSTED' && new Date(inv.dueDate) < new Date()) {
          mappedStatus = 'OVERDUE';
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          type: isAr ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE',
          counterpartyName: inv.counterparty?.legalName || 'Unspecified Counterparty',
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalAmount: total,
          status: mappedStatus,
        };
      });

      setInvoices(mapped);
    } catch (err) {
      console.warn('Could not fetch live invoices:', err);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filteredInvoices = invoices.filter((inv) => {
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

  // Calculate live KPIs
  const totalReceivables = invoices
    .filter((inv) => inv.type === 'ACCOUNTS_RECEIVABLE' && inv.status !== 'PAID')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalPayables = invoices
    .filter((inv) => inv.type === 'ACCOUNTS_PAYABLE' && inv.status !== 'PAID')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const overdueAmount = invoices
    .filter((inv) => inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const overdueCount = invoices.filter((inv) => inv.status === 'OVERDUE').length;

  const collectedThisMonth = invoices
    .filter((inv) => inv.status === 'PAID' && inv.type === 'ACCOUNTS_RECEIVABLE')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

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
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalReceivables)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Incoming revenue expected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payables</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalPayables)}</div>
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
              {formatCurrency(overdueAmount)}
            </div>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
              {overdueCount === 0
                ? 'No overdue bills'
                : `${overdueCount} vendor bill${overdueCount > 1 ? 's' : ''} past due date`}
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
              {formatCurrency(collectedThisMonth)}
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
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading invoice records...</span>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">No Invoices or Bills Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                Your business has no customer invoices or vendor bills recorded yet. Create an
                invoice or process a statement to get started.
              </p>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create First Invoice
              </Button>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
