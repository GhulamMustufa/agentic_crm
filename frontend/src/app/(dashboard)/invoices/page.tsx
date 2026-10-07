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
  Loader2,
  Trash2,
  X,
  Send,
  Building,
  User,
  Calendar,
  DollarSign,
  Receipt,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  counterpartyId?: string;
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

interface Counterparty {
  id: string;
  legalName: string;
  type: 'VENDOR' | 'CUSTOMER' | 'BOTH';
}

interface LedgerAccount {
  id: string;
  accountCode: string;
  name: string;
  classification: string;
  subClassification?: string;
}

interface FormLineItem {
  id: string;
  description: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
}

const getTodayDate = (): string => new Date().toISOString().split('T')[0];

const addDaysToDate = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export default function InvoicesPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'OVERDUE'>(
    'ALL',
  );
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Creation State
  const [isCreatingInvoice, setIsCreatingInvoice] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [postingInvoiceId, setPostingInvoiceId] = React.useState<string | null>(null);

  // Dependencies
  const [counterparties, setCounterparties] = React.useState<Counterparty[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = React.useState<LedgerAccount[]>([]);
  const [isLoadingDeps, setIsLoadingDeps] = React.useState(false);

  // Form Fields
  const [formType, setFormType] = React.useState<'INVOICE' | 'BILL'>('INVOICE');
  const [counterpartyMode, setCounterpartyMode] = React.useState<'select' | 'new'>('select');
  const [selectedCounterpartyId, setSelectedCounterpartyId] = React.useState('');
  const [newCounterpartyName, setNewCounterpartyName] = React.useState('');
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(getTodayDate());
  const [dueDate, setDueDate] = React.useState(addDaysToDate(getTodayDate(), 30));
  const [taxAmount, setTaxAmount] = React.useState<number>(0);
  const [postImmediately, setPostImmediately] = React.useState(true);
  const [formLines, setFormLines] = React.useState<FormLineItem[]>([
    {
      id: 'line-1',
      description: 'Consulting & Implementation Services',
      accountId: '',
      quantity: 1,
      unitPrice: 1250,
    },
  ]);

  // Load Dependencies (Counterparties & Ledger Accounts)
  const loadDependencies = React.useCallback(async () => {
    try {
      setIsLoadingDeps(true);

      // 1. Fetch counterparties
      const cpRes = await apiClient.get<{ data: Counterparty[] }>('/counterparties');
      const cps = cpRes.data || [];
      setCounterparties(cps);

      // If no counterparties exist yet, switch to 'new' mode
      if (cps.length === 0) {
        setCounterpartyMode('new');
      } else {
        setSelectedCounterpartyId(cps[0].id);
      }

      // 2. Fetch ledger accounts
      let accRes = await apiClient.get<{ data: LedgerAccount[] }>('/ledger/accounts');
      let accounts = accRes.data || [];

      // If empty, auto-seed standard COA
      if (accounts.length === 0) {
        const seedRes = await apiClient.post<{ data: LedgerAccount[] }>(
          '/ledger/accounts/seed-standard',
          {},
        );
        accounts = seedRes.data || [];
      }
      setLedgerAccounts(accounts);

      // Set default account for line items
      const defaultRevenue = accounts.find(
        (a) => a.accountCode === '4010' || a.classification === 'REVENUE',
      );
      if (defaultRevenue) {
        setFormLines((prev) =>
          prev.map((l) => (l.accountId ? l : { ...l, accountId: defaultRevenue.id })),
        );
      }
    } catch (err) {
      console.warn('Could not load counterparties or accounts:', err);
    } finally {
      setIsLoadingDeps(false);
    }
  }, []);

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
    loadDependencies();
  }, [fetchInvoices, loadDependencies]);

  // Sync default invoice number whenever type changes or modal opens
  React.useEffect(() => {
    const prefix = formType === 'INVOICE' ? 'INV' : 'BILL';
    const year = new Date().getFullYear();
    const count = invoices.length + 1;
    setInvoiceNumber(`${prefix}-${year}-${String(count).padStart(3, '0')}`);

    // Update account IDs to suit type
    if (ledgerAccounts.length > 0) {
      const preferredAccount =
        formType === 'INVOICE'
          ? ledgerAccounts.find((a) => a.classification === 'REVENUE' || a.accountCode === '4010')
          : ledgerAccounts.find(
              (a) =>
                a.classification === 'EXPENSE' ||
                a.accountCode === '5010' ||
                a.accountCode === '6010',
            );

      if (preferredAccount) {
        setFormLines((prev) =>
          prev.map((l) => ({ ...l, accountId: l.accountId || preferredAccount.id })),
        );
      }
    }
  }, [formType, invoices.length, ledgerAccounts]);

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

  // Line Items Handlers
  const handleAddLine = () => {
    const defaultAcc =
      formType === 'INVOICE'
        ? ledgerAccounts.find((a) => a.classification === 'REVENUE')?.id ||
          ledgerAccounts[0]?.id ||
          ''
        : ledgerAccounts.find((a) => a.classification === 'EXPENSE')?.id ||
          ledgerAccounts[0]?.id ||
          '';

    setFormLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        description: '',
        accountId: defaultAcc,
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (formLines.length === 1) return;
    setFormLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLine = (id: string, field: keyof FormLineItem, val: any) => {
    setFormLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  };

  const linesSubtotal = formLines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );
  const invoiceTotal = linesSubtotal + (Number(taxAmount) || 0);

  // Form Submit Handler
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      let targetCounterpartyId = selectedCounterpartyId;

      // Create new counterparty if requested
      if (counterpartyMode === 'new') {
        if (!newCounterpartyName.trim()) {
          toast.error('Please enter a counterparty / client legal name');
          setIsSubmitting(false);
          return;
        }

        const cpRes = await apiClient.post<{ data: Counterparty }>('/counterparties', {
          legalName: newCounterpartyName.trim(),
          type: formType === 'INVOICE' ? 'CUSTOMER' : 'VENDOR',
          paymentTermsDays: 30,
        });

        if (!cpRes.data?.id) {
          throw new Error('Failed to create new counterparty record');
        }

        targetCounterpartyId = cpRes.data.id;
        setCounterparties((prev) => [cpRes.data, ...prev]);
        setSelectedCounterpartyId(targetCounterpartyId);
      }

      if (!targetCounterpartyId) {
        toast.error('Please select or specify a counterparty');
        setIsSubmitting(false);
        return;
      }

      // Validate lines
      const validLines = formLines.filter(
        (l) => l.description.trim().length > 0 && l.accountId && l.quantity > 0,
      );

      if (validLines.length === 0) {
        toast.error(
          'Invoice must include at least one valid line item with a GL account and description',
        );
        setIsSubmitting(false);
        return;
      }

      const payload = {
        counterpartyId: targetCounterpartyId,
        invoiceType: formType,
        invoiceNumber: invoiceNumber.trim(),
        issueDate,
        dueDate,
        currency: 'USD',
        taxCents: Math.round(Number(taxAmount || 0) * 100),
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unitCostCents: Math.round(Number(l.unitPrice) * 100),
        })),
      };

      const res = await apiClient.post<{ data: { id: string } }>('/invoices', payload);
      const createdInvoice = res.data;

      if (postImmediately && createdInvoice?.id) {
        // Ensure fiscal period is open
        try {
          const year = new Date(issueDate).getFullYear() || 2026;
          await apiClient.post('/ledger/fiscal-years', { year });
        } catch {
          // Fiscal year might already exist
        }

        await apiClient.post(`/invoices/${createdInvoice.id}/post`, {});
        toast.success(
          formType === 'INVOICE'
            ? 'Customer invoice created and posted to General Ledger!'
            : 'Vendor bill created and posted to General Ledger!',
        );
      } else {
        toast.success('Invoice draft saved successfully');
      }

      // Reset and refresh
      setIsCreatingInvoice(false);
      setNewCounterpartyName('');
      await fetchInvoices();
    } catch (err: any) {
      console.error('Invoice creation error:', err);
      const msg = err?.data?.message || err?.message || 'Failed to create invoice';
      toast.error(typeof msg === 'string' ? msg : 'Invoice creation failed. Please check entries.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Immediate post from table row
  const handlePostDraftInvoice = async (invoiceId: string, invIssueDate: string) => {
    try {
      setPostingInvoiceId(invoiceId);
      const year = new Date(invIssueDate).getFullYear() || 2026;
      try {
        await apiClient.post('/ledger/fiscal-years', { year });
      } catch {}

      await apiClient.post(`/invoices/${invoiceId}/post`, {});
      toast.success('Invoice posted to General Ledger successfully');
      await fetchInvoices();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.data?.message || err?.message || 'Failed to post invoice');
    } finally {
      setPostingInvoiceId(null);
    }
  };

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
          <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setIsCreatingInvoice((prev) => !prev);
              if (!isCreatingInvoice && counterparties.length === 0) {
                loadDependencies();
              }
            }}
          >
            {isCreatingInvoice ? (
              <>
                <X className="w-4 h-4 mr-2" />
                Close Form
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Invoice
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Creation Modal / Inline Form Card */}
      {isCreatingInvoice && (
        <Card className="border-primary/30 bg-card/95 shadow-xl backdrop-blur-sm transition-all duration-300">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Create New {formType === 'INVOICE' ? 'Customer Invoice (AR)' : 'Vendor Bill (AP)'}
                </CardTitle>
                <CardDescription className="mt-1">
                  Balanced double-entry journal entries will be generated against Accounts{' '}
                  {formType === 'INVOICE' ? 'Receivable (1200)' : 'Payable (2010)'}.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCreatingInvoice(false)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Type Switcher Pills */}
            <div className="flex gap-2 pt-3">
              <Button
                type="button"
                size="sm"
                variant={formType === 'INVOICE' ? 'default' : 'outline'}
                onClick={() => setFormType('INVOICE')}
                className="rounded-full"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Customer Invoice (AR - Incoming)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={formType === 'BILL' ? 'default' : 'outline'}
                onClick={() => setFormType('BILL')}
                className="rounded-full"
              >
                <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-blue-400" />
                Vendor Bill (AP - Outgoing)
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <form id="invoice-form" onSubmit={handleCreateInvoice} className="space-y-6">
              {/* Row 1: Counterparty & Invoice Number */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Counterparty Selection */}
                <div className="space-y-2 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label
                      htmlFor="counterpartySelect"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {formType === 'INVOICE' ? 'Customer / Client' : 'Vendor / Supplier'}
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        setCounterpartyMode((prev) => (prev === 'select' ? 'new' : 'select'))
                      }
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {counterpartyMode === 'select' ? '+ Add New Client' : '← Select Existing'}
                    </button>
                  </div>

                  {counterpartyMode === 'select' && counterparties.length > 0 ? (
                    <select
                      id="counterpartySelect"
                      value={selectedCounterpartyId}
                      onChange={(e) => setSelectedCounterpartyId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    >
                      {counterparties.map((cp) => (
                        <option key={cp.id} value={cp.id}>
                          {cp.legalName} ({cp.type})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <Input
                        id="newCounterpartyName"
                        value={newCounterpartyName}
                        onChange={(e) => setNewCounterpartyName(e.target.value)}
                        placeholder={
                          formType === 'INVOICE'
                            ? 'e.g. Acme Corp Inc.'
                            : 'e.g. Amazon Web Services'
                        }
                        className="pl-9"
                        required={counterpartyMode === 'new' || counterparties.length === 0}
                      />
                      <Building className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  )}
                </div>

                {/* Invoice Number */}
                <div className="space-y-2">
                  <Label
                    htmlFor="invoiceNumber"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {formType === 'INVOICE' ? 'Invoice #' : 'Bill #'}
                  </Label>
                  <Input
                    id="invoiceNumber"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-001"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Dates & Terms */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="issueDate"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Issue Date
                  </Label>
                  <div className="relative">
                    <Input
                      id="issueDate"
                      type="date"
                      value={issueDate}
                      onChange={(e) => {
                        setIssueDate(e.target.value);
                        setDueDate(addDaysToDate(e.target.value, 30));
                      }}
                      className="pl-9"
                      required
                    />
                    <Calendar className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="dueDate"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Due Date
                  </Label>
                  <div className="relative">
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="pl-9"
                      required
                    />
                    <Calendar className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  </div>
                </div>

                {/* Payment Terms Quick Pills */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Terms
                  </Label>
                  <div className="flex gap-1.5 pt-1">
                    {[
                      { label: 'Due Now', days: 0 },
                      { label: 'Net 15', days: 15 },
                      { label: 'Net 30', days: 30 },
                      { label: 'Net 60', days: 60 },
                    ].map((term) => (
                      <Button
                        key={term.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 px-2 flex-1"
                        onClick={() => setDueDate(addDaysToDate(issueDate, term.days))}
                      >
                        {term.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-semibold tracking-wide">
                    Line Items & Ledger Accounts
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLine}
                    className="text-xs h-8"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line Item
                  </Button>
                </div>

                <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-muted/20">
                  {formLines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pb-3 border-b border-border/30 last:border-0 last:pb-0"
                    >
                      {/* Description */}
                      <div className="md:col-span-4 space-y-1">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Input
                          placeholder="e.g. Consulting Services, SaaS Platform, Hardware"
                          value={line.description}
                          onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                          required
                        />
                      </div>

                      {/* General Ledger Account */}
                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> GL Account
                        </Label>
                        <select
                          value={line.accountId}
                          onChange={(e) => handleUpdateLine(line.id, 'accountId', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          required
                        >
                          {ledgerAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountCode} - {acc.name} ({acc.classification})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            handleUpdateLine(line.id, 'quantity', Number(e.target.value))
                          }
                          required
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Unit Price ($)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitPrice}
                            onChange={(e) =>
                              handleUpdateLine(line.id, 'unitPrice', Number(e.target.value))
                            }
                            className="pl-7 tabular-nums"
                            required
                          />
                          <span className="absolute left-2.5 top-2.5 text-xs text-muted-foreground">
                            $
                          </span>
                        </div>
                      </div>

                      {/* Remove Line */}
                      <div className="md:col-span-1 flex justify-end pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={formLines.length === 1}
                          onClick={() => handleRemoveLine(line.id)}
                          className="h-9 w-9 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals & Posting Options */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-2 border-t border-border/50">
                {/* Left: General Ledger sync options */}
                <div className="space-y-3 max-w-sm">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={postImmediately}
                      onChange={(e) => setPostImmediately(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-medium">
                        Post to General Ledger Immediately
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Generates a balanced double-entry journal entry and updates ledger accounts
                        (
                        {formType === 'INVOICE'
                          ? 'Debit AR 1200 / Credit Revenue 4010'
                          : 'Debit Expense 5010 / Credit AP 2010'}
                        ).
                      </p>
                    </div>
                  </label>
                </div>

                {/* Right: Calculations */}
                <div className="w-full md:w-64 space-y-2 text-right">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(linesSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Sales Tax ($):</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(Number(e.target.value) || 0)}
                      className="w-28 h-8 text-right text-xs tabular-nums"
                    />
                  </div>
                  <div className="flex justify-between text-base font-bold text-foreground border-t border-border/50 pt-2">
                    <span>Total Amount:</span>
                    <span className="text-primary tabular-nums">
                      {formatCurrency(invoiceTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>

          <CardFooter className="border-t border-border/50 flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreatingInvoice(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="invoice-form"
              disabled={isSubmitting || isLoadingDeps}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {postImmediately ? 'Create & Post Invoice' : 'Save as Draft'}
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

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
              <Button
                size="sm"
                onClick={() => {
                  setIsCreatingInvoice(true);
                  if (counterparties.length === 0) {
                    loadDependencies();
                  }
                }}
              >
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
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell className="text-right">
                      {inv.status === 'DRAFT' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePostDraftInvoice(inv.id, inv.issueDate)}
                          disabled={postingInvoiceId === inv.id}
                          className="h-8 text-xs text-primary"
                        >
                          {postingInvoiceId === inv.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <Send className="w-3.5 h-3.5 mr-1" />
                          )}
                          Post to Ledger
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          In Ledger
                        </span>
                      )}
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
