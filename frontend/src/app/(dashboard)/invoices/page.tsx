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
  Calendar,
  Receipt,
  BookOpen,
  Edit2,
  Ban,
  Sparkles,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCurrency, formatIsoDate, getCurrencySymbol } from '@/lib/formatters';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

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
  currency?: string;
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
  currency: string;
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

  // Creation / Editing Modal State
  const [isCreatingInvoice, setIsCreatingInvoice] = React.useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [postingInvoiceId, setPostingInvoiceId] = React.useState<string | null>(null);
  const [voidingInvoiceId, setVoidingInvoiceId] = React.useState<string | null>(null);

  // Dependencies
  const [counterparties, setCounterparties] = React.useState<Counterparty[]>([]);
  const [bankStatementSuggestions, setBankStatementSuggestions] = React.useState<string[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = React.useState<LedgerAccount[]>([]);
  const [isLoadingDeps, setIsLoadingDeps] = React.useState(false);

  // Form Fields
  const [formType, setFormType] = React.useState<'INVOICE' | 'BILL'>('INVOICE');
  const [lineMode, setLineMode] = React.useState<'simple' | 'itemized'>('simple');
  const [counterpartyMode, setCounterpartyMode] = React.useState<'select' | 'new'>('select');
  const [selectedCounterpartyId, setSelectedCounterpartyId] = React.useState('');
  const [newCounterpartyName, setNewCounterpartyName] = React.useState('');
  const [invoiceNumber, setInvoiceNumber] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(getTodayDate());
  const [dueDate, setDueDate] = React.useState(addDaysToDate(getTodayDate(), 30));
  const [formCurrency, setFormCurrency] = React.useState('USD');
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

  const getSuggestedAccountForType = React.useCallback(
    (type: 'INVOICE' | 'BILL', accounts: LedgerAccount[]) => {
      if (type === 'INVOICE') {
        return (
          accounts.find((a) => a.accountCode === '4010') ||
          accounts.find((a) => a.classification === 'REVENUE') ||
          accounts[0]
        );
      } else {
        return (
          accounts.find((a) => a.accountCode === '5010') ||
          accounts.find((a) => a.accountCode === '6010') ||
          accounts.find((a) => a.classification === 'EXPENSE') ||
          accounts[0]
        );
      }
    },
    [],
  );

  const getNextInvoiceNumber = React.useCallback(
    (type: 'INVOICE' | 'BILL', existingInvoices: InvoiceRecord[]) => {
      const prefix = type === 'INVOICE' ? 'INV' : 'BILL';
      const year = new Date().getFullYear();
      const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
      let maxSeq = 0;
      for (const inv of existingInvoices) {
        const match = inv.invoiceNumber?.match(pattern);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
      const nextSeq = maxSeq > 0 ? maxSeq + 1 : existingInvoices.length + 1;
      return `${prefix}-${year}-${String(nextSeq).padStart(3, '0')}`;
    },
    [],
  );

  const handleSwitchFormType = (newType: 'INVOICE' | 'BILL') => {
    setFormType(newType);
    if (!editingInvoiceId) {
      setInvoiceNumber(getNextInvoiceNumber(newType, invoices));
      const suggested = getSuggestedAccountForType(newType, ledgerAccounts);
      if (suggested) {
        setFormLines((prev) =>
          prev.map((l) => ({
            ...l,
            accountId: suggested.id,
            description:
              l.description === 'Consulting & Implementation Services' ||
              l.description === 'Vendor Goods / Operating Expense'
                ? newType === 'INVOICE'
                  ? 'Consulting & Implementation Services'
                  : 'Vendor Goods / Operating Expense'
                : l.description,
          })),
        );
      }
    }
  };

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

      // 3. Fetch bank statement transactions for suggestion pills
      try {
        const txRes = await apiClient.get<{
          data: Array<{
            normalizedPayee?: string;
            rawDescription?: string;
            rawPrimaryText?: string;
            direction?: string;
          }>;
        }>('/banking/transactions');
        const txList = txRes.data || [];
        const suggestions = new Set<string>();
        txList.forEach((t) => {
          const name = (t.normalizedPayee || t.rawPrimaryText || t.rawDescription || '').trim();
          if (
            name &&
            name.length > 2 &&
            !name.toLowerCase().includes('wire fee') &&
            !name.toLowerCase().includes('transfer') &&
            !name.toLowerCase().includes('charge')
          ) {
            const clean = name.replace(/^[\s\*\-\/]+|[\s\*\-\/]+$/g, '');
            if (clean.length > 2 && clean.length < 50) {
              suggestions.add(clean);
            }
          }
        });
        setBankStatementSuggestions(Array.from(suggestions).slice(0, 8));
      } catch {
        // Silently catch if banking not yet uploaded or configured
      }
    } catch (err: any) {
      if (
        err?.status === 401 ||
        err?.statusCode === 401 ||
        err?.message?.includes('expired') ||
        err?.message?.includes('UNAUTHORIZED')
      ) {
        toast.error('Session expired. Redirecting to login...');
        authStorage.clearAuthSession();
        setTimeout(() => {
          window.location.href = '/login?expired=true';
        }, 1200);
      }
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
          currency: inv.currency || 'USD',
          status: mappedStatus,
        };
      });

      setInvoices(mapped);
    } catch (err: any) {
      if (
        err?.status === 401 ||
        err?.statusCode === 401 ||
        err?.message?.includes('expired') ||
        err?.message?.includes('UNAUTHORIZED')
      ) {
        toast.error('Session expired. Redirecting to login...');
        authStorage.clearAuthSession();
        setTimeout(() => {
          window.location.href = '/login?expired=true';
        }, 1200);
      } else {
        setInvoices([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInvoices();
    loadDependencies();
  }, [fetchInvoices, loadDependencies]);

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCreatingInvoice) {
        setIsCreatingInvoice(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreatingInvoice]);

  // Sync default invoice number whenever type changes or modal opens
  React.useEffect(() => {
    if (editingInvoiceId) return;

    setInvoiceNumber(getNextInvoiceNumber(formType, invoices));

    // Update account IDs to suit type
    if (ledgerAccounts.length > 0) {
      const preferredAccount = getSuggestedAccountForType(formType, ledgerAccounts);
      if (preferredAccount) {
        setFormLines((prev) =>
          prev.map((l) => ({ ...l, accountId: l.accountId || preferredAccount.id })),
        );
      }
    }
  }, [
    formType,
    invoices,
    ledgerAccounts,
    getNextInvoiceNumber,
    getSuggestedAccountForType,
    editingInvoiceId,
  ]);

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
  const handleCreateInvoice = async (e?: React.FormEvent, shouldPostOverride?: boolean) => {
    if (e) e.preventDefault();
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

      // Ensure each line has a valid GL account fallback
      const fallbackAccount = getSuggestedAccountForType(formType, ledgerAccounts);
      const normalizedLines = formLines.map((l) => ({
        ...l,
        accountId: l.accountId || fallbackAccount?.id || '',
        quantity: Number(l.quantity) || 1,
      }));

      // Validate lines
      const validLines = normalizedLines.filter(
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
        currency: formCurrency,
        taxCents: Math.round(Number(taxAmount || 0) * 100),
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unitCostCents: Math.round(Number(l.unitPrice) * 100),
        })),
      };

      let targetInvoiceId = editingInvoiceId;

      if (editingInvoiceId) {
        await apiClient.put(`/invoices/${editingInvoiceId}`, payload);
      } else {
        const res = await apiClient.post<{ data: { id: string } }>('/invoices', payload);
        targetInvoiceId = res.data?.id;
      }

      const willPost = shouldPostOverride !== undefined ? shouldPostOverride : postImmediately;

      if (willPost && targetInvoiceId) {
        // Ensure fiscal period is open
        try {
          const year = new Date(issueDate).getFullYear() || 2026;
          await apiClient.post('/ledger/fiscal-years', { year });
        } catch {
          // Fiscal year might already exist
        }

        await apiClient.post(`/invoices/${targetInvoiceId}/post`, {});
        toast.success(
          editingInvoiceId
            ? 'Draft invoice updated and posted to General Ledger!'
            : formType === 'INVOICE'
              ? 'Customer invoice created and posted to General Ledger!'
              : 'Vendor bill created and posted to General Ledger!',
        );
      } else {
        toast.success(
          editingInvoiceId
            ? 'Draft invoice updated successfully'
            : 'Invoice draft saved successfully',
        );
      }

      // Reset and refresh
      setIsCreatingInvoice(false);
      setEditingInvoiceId(null);
      setNewCounterpartyName('');
      await fetchInvoices();
    } catch (err: any) {
      if (
        err?.status === 401 ||
        err?.statusCode === 401 ||
        err?.message?.includes('expired') ||
        err?.message?.includes('UNAUTHORIZED')
      ) {
        toast.error('Your session expired. Redirecting to login...');
        authStorage.clearAuthSession();
        setTimeout(() => {
          window.location.href = '/login?expired=true';
        }, 1200);
      } else {
        const msg = err?.data?.message || err?.message || 'Failed to save invoice';
        toast.error(
          typeof msg === 'string' ? msg : 'Invoice operation failed. Please check entries.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCreateInvoice = () => {
    setEditingInvoiceId(null);
    setInvoiceNumber(getNextInvoiceNumber(formType, invoices));
    setLineMode('simple');
    setIssueDate(getTodayDate());
    setDueDate(addDaysToDate(getTodayDate(), 30));
    setTaxAmount(0);
    setPostImmediately(true);
    if (counterparties.length > 0) {
      setCounterpartyMode('select');
      setSelectedCounterpartyId(counterparties[0].id);
    } else {
      setCounterpartyMode('new');
    }
    const suggested = getSuggestedAccountForType(formType, ledgerAccounts);
    setFormLines([
      {
        id: 'line-1',
        description:
          formType === 'INVOICE'
            ? 'Consulting & Implementation Services'
            : 'Vendor Goods / Operating Expense',
        accountId: suggested?.id || '',
        quantity: 1,
        unitPrice: 1250,
      },
    ]);
    setNewCounterpartyName('');
    setIsCreatingInvoice(true);
  };

  const handleOpenEditDraft = async (invoiceId: string) => {
    try {
      setLoading(true);
      const res = await apiClient.get<{
        data: {
          id: string;
          invoiceNumber: string;
          invoiceType: 'INVOICE' | 'BILL';
          counterpartyId?: string;
          issueDate: string;
          dueDate: string;
          currency?: string;
          taxCents?: string | number;
          lines?: Array<{
            description: string;
            accountId: string;
            quantity: number;
            unitCostCents: string | number;
          }>;
        };
      }>(`/invoices/${invoiceId}`);
      const inv = res.data;
      if (!inv) return;

      setEditingInvoiceId(inv.id);
      setFormType(inv.invoiceType || 'INVOICE');
      if (inv.currency) {
        setFormCurrency(inv.currency);
      }
      if (inv.counterpartyId) {
        setSelectedCounterpartyId(inv.counterpartyId);
        setCounterpartyMode('select');
      }
      setInvoiceNumber(inv.invoiceNumber);
      setIssueDate(inv.issueDate ? inv.issueDate.split('T')[0] : getTodayDate());
      setDueDate(inv.dueDate ? inv.dueDate.split('T')[0] : addDaysToDate(getTodayDate(), 30));
      setTaxAmount(Number(inv.taxCents || 0) / 100);
      setPostImmediately(false);

      if (inv.lines && inv.lines.length > 0) {
        setFormLines(
          inv.lines.map((l, idx: number) => ({
            id: `line-${idx + 1}`,
            description: l.description,
            accountId: l.accountId,
            quantity: Number(l.quantity) || 1,
            unitPrice: Number(l.unitCostCents || 0) / 100,
          })),
        );
        setLineMode(inv.lines.length > 1 ? 'itemized' : 'simple');
      } else {
        setLineMode('simple');
      }
      setIsCreatingInvoice(true);
    } catch {
      toast.error('Failed to load invoice for editing');
    } finally {
      setLoading(false);
    }
  };

  const handleVoidInvoice = async (invoiceId: string, invoiceNum: string) => {
    const reason = window.prompt(
      `Void Invoice ${invoiceNum}?\n\nThis will post an automated reversing journal entry to cancel out Accounts Receivable / Revenue in the General Ledger.\n\nPlease enter reason for voiding:`,
      'Billed in error / cancelled by client',
    );
    if (!reason || !reason.trim()) return;

    try {
      setVoidingInvoiceId(invoiceId);
      await apiClient.post(`/invoices/${invoiceId}/void`, { reason: reason.trim() });
      toast.success(`Invoice ${invoiceNum} voided. Ledger reversing entry recorded.`);
      await fetchInvoices();
    } catch (err: unknown) {
      const errorObj = err as { data?: { message?: string }; message?: string };
      toast.error(errorObj?.data?.message || errorObj?.message || 'Failed to void invoice');
    } finally {
      setVoidingInvoiceId(null);
    }
  };

  const handleSelectBankSuggestion = (suggestion: string) => {
    const matched = counterparties.find(
      (c) => c.legalName.toLowerCase() === suggestion.toLowerCase(),
    );
    if (matched) {
      setCounterpartyMode('select');
      setSelectedCounterpartyId(matched.id);
      toast.info(`Matched existing client: "${matched.legalName}"`);
    } else {
      setCounterpartyMode('new');
      setNewCounterpartyName(suggestion);
      toast.info(`Selected "${suggestion}" from bank statement as new client`);
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
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        statusCode?: number;
        message?: string;
        data?: { message?: string };
      };
      if (
        errorObj?.status === 401 ||
        errorObj?.statusCode === 401 ||
        errorObj?.message?.includes('expired') ||
        errorObj?.message?.includes('UNAUTHORIZED')
      ) {
        toast.error('Session expired. Redirecting to login...');
        authStorage.clearAuthSession();
        setTimeout(() => {
          window.location.href = '/login?expired=true';
        }, 1200);
      } else {
        toast.error(errorObj?.data?.message || errorObj?.message || 'Failed to post invoice');
      }
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
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleOpenCreateInvoice}
            className="cursor-pointer font-semibold shadow-md"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Creation / Edit Modal Dialog Overlay */}
      {isCreatingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingInvoice(false);
          }}
        >
          <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl p-6 my-4 animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-border/50 pb-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  {editingInvoiceId ? 'Edit Draft' : 'Create New'}{' '}
                  {formType === 'INVOICE' ? 'Customer Invoice (AR)' : 'Vendor Bill (AP)'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Balanced double-entry journal entries will be generated against Accounts{' '}
                  {formType === 'INVOICE' ? 'Receivable (1200)' : 'Payable (2010)'}.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCreatingInvoice(false)}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Type Switcher Pills */}
            <div className="flex flex-wrap gap-2 pt-4 pb-2">
              <Button
                type="button"
                size="sm"
                variant={formType === 'INVOICE' ? 'default' : 'outline'}
                onClick={() => handleSwitchFormType('INVOICE')}
                className="rounded-full cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Customer Invoice (AR - Incoming)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={formType === 'BILL' ? 'default' : 'outline'}
                onClick={() => handleSwitchFormType('BILL')}
                className="rounded-full cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-blue-400" />
                Vendor Bill (AP - Outgoing)
              </Button>
            </div>

            {/* Form */}
            <form
              id="invoice-modal-form"
              onSubmit={(e) => handleCreateInvoice(e)}
              className="space-y-5 pt-3"
            >
              {/* Row 1: Counterparty & Invoice Number */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Counterparty Selection */}
                <div className="space-y-1.5 md:col-span-2">
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
                      className="text-xs text-primary hover:underline font-medium cursor-pointer"
                    >
                      {counterpartyMode === 'select' ? '+ Add New Client' : '← Select Existing'}
                    </button>
                  </div>

                  {counterpartyMode === 'select' && counterparties.length > 0 ? (
                    <select
                      id="counterpartySelect"
                      value={selectedCounterpartyId}
                      onChange={(e) => setSelectedCounterpartyId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
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
                            ? 'e.g. Acme Corporation Inc.'
                            : 'e.g. Amazon Web Services'
                        }
                        className="pl-9"
                        required={counterpartyMode === 'new' || counterparties.length === 0}
                      />
                      <Building className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  )}

                  {/* Bank Statement Suggestions */}
                  {bankStatementSuggestions.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" /> From Bank Statement:
                      </span>
                      {bankStatementSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSelectBankSuggestion(suggestion)}
                          className="text-[11px] bg-secondary/80 hover:bg-primary/15 text-foreground hover:text-primary px-2.5 py-0.5 rounded-full border border-border/60 transition-colors cursor-pointer"
                          title={`Auto-fill "${suggestion}"`}
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invoice Number */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label
                      htmlFor="invoiceNumber"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {formType === 'INVOICE' ? 'Invoice #' : 'Bill #'}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setInvoiceNumber(getNextInvoiceNumber(formType, invoices))}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      title="Re-generate next sequential number"
                    >
                      <RotateCw className="w-3 h-3" /> Auto-Sequence
                    </button>
                  </div>
                  <Input
                    id="invoiceNumber"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder={formType === 'INVOICE' ? 'INV-2026-001' : 'BILL-2026-001'}
                    required
                  />
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="formCurrency"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Currency
                  </Label>
                  <select
                    id="formCurrency"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="USD">USD ($ - US Dollar)</option>
                    <option value="MYR">MYR (RM - Malaysian Ringgit)</option>
                    <option value="SGD">SGD (S$ - Singapore Dollar)</option>
                    <option value="EUR">EUR (€ - Euro)</option>
                    <option value="GBP">GBP (£ - British Pound)</option>
                    <option value="AED">AED (AED - UAE Dirham)</option>
                    <option value="CAD">CAD (C$ - Canadian Dollar)</option>
                    <option value="AUD">AUD (A$ - Australian Dollar)</option>
                    <option value="INR">INR (₹ - Indian Rupee)</option>
                    <option value="PKR">PKR (Rs - Pakistani Rupee)</option>
                    <option value="JPY">JPY (¥ - Japanese Yen)</option>
                    <option value="CNY">CNY (¥ - Chinese Yuan)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Dates & Terms */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
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

                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Terms
                  </Label>
                  <div className="flex gap-1.5 pt-0.5">
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
                        className="text-xs h-8 px-2 flex-1 cursor-pointer"
                        onClick={() => setDueDate(addDaysToDate(issueDate, term.days))}
                      >
                        {term.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Line Items Mode Switcher & Content */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border border-border/60 self-start">
                    <button
                      type="button"
                      onClick={() => setLineMode('simple')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        lineMode === 'simple'
                          ? 'bg-background shadow-xs text-foreground font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ⚡ Quick 1-Line Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineMode('itemized')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        lineMode === 'itemized'
                          ? 'bg-background shadow-xs text-foreground font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Detailed Itemized Mode
                    </button>
                  </div>

                  {lineMode === 'itemized' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLine}
                      className="text-xs h-8 cursor-pointer self-end sm:self-auto"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Line Item
                    </Button>
                  )}
                </div>

                {lineMode === 'simple' ? (
                  /* Quick Simple Mode Card */
                  <div className="rounded-xl border border-border/70 p-4 bg-muted/20 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      {/* Description */}
                      <div className="md:col-span-8 space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Description / Purpose
                        </Label>
                        <Input
                          placeholder={
                            formType === 'INVOICE'
                              ? 'e.g. Consulting & Implementation Services'
                              : 'e.g. Vendor Goods / Operating Expense'
                          }
                          value={formLines[0]?.description || ''}
                          onChange={(e) =>
                            handleUpdateLine(
                              formLines[0]?.id || 'line-1',
                              'description',
                              e.target.value,
                            )
                          }
                          required
                        />
                      </div>

                      {/* Amount */}
                      <div className="md:col-span-4 space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Amount ({getCurrencySymbol(formCurrency)})
                        </Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formLines[0]?.unitPrice ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              handleUpdateLine(formLines[0]?.id || 'line-1', 'unitPrice', val);
                              handleUpdateLine(formLines[0]?.id || 'line-1', 'quantity', 1);
                            }}
                            className="pl-8 tabular-nums font-medium"
                            required
                          />
                          <span className="absolute left-2.5 top-2.5 text-xs font-semibold text-muted-foreground">
                            {getCurrencySymbol(formCurrency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Auto-allocated GL Account */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground flex items-center gap-1 font-medium">
                          <BookOpen className="w-3.5 h-3.5 text-primary" /> Auto-allocated Ledger
                          Account:
                        </span>
                        <select
                          value={formLines[0]?.accountId || ''}
                          onChange={(e) =>
                            handleUpdateLine(
                              formLines[0]?.id || 'line-1',
                              'accountId',
                              e.target.value,
                            )
                          }
                          className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium cursor-pointer"
                          required
                        >
                          {ledgerAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountCode} - {acc.name} ({acc.classification})
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="text-[11px] text-muted-foreground italic">
                        {formType === 'INVOICE'
                          ? 'Balances with AR 1200 on post'
                          : 'Balances with AP 2010 on post'}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Itemized Breakdown Table */
                  <div className="space-y-2 border border-border/60 rounded-lg p-3 bg-muted/20">
                    {formLines.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pb-3 border-b border-border/30 last:border-0 last:pb-0"
                      >
                        {/* Description */}
                        <div className="md:col-span-4 space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Input
                            placeholder="e.g. Monthly Retainer, Server Infrastructure"
                            value={line.description}
                            onChange={(e) =>
                              handleUpdateLine(line.id, 'description', e.target.value)
                            }
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
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
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
                          <Label className="text-xs text-muted-foreground">
                            Unit Price ({getCurrencySymbol(formCurrency)})
                          </Label>
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
                              {getCurrencySymbol(formCurrency)}
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
                            className="h-9 w-9 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals & Summary */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-2 border-t border-border/50">
                {/* Left: Financial posting context */}
                <div className="space-y-1.5 max-w-sm text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Double-Entry General Ledger Integration
                  </span>
                  <p>
                    {formType === 'INVOICE'
                      ? 'Posting automatically records Debit AR (1200) and Credit Revenue (4010).'
                      : 'Posting automatically records Debit Expense (5010/6010) and Credit AP (2010).'}
                  </p>
                </div>

                {/* Right: Calculations */}
                <div className="w-full md:w-64 space-y-2 text-right">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(linesSubtotal, formCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Sales Tax ({getCurrencySymbol(formCurrency)}):</span>
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
                      {formatCurrency(invoiceTotal, formCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatingInvoice(false)}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto cursor-pointer"
                >
                  Cancel
                </Button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => handleCreateInvoice(e, false)}
                    disabled={isSubmitting || isLoadingDeps}
                    className="flex-1 sm:flex-initial cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 mr-1.5 text-muted-foreground" />
                    )}
                    Save as Draft
                  </Button>

                  <Button
                    type="button"
                    onClick={(e) => handleCreateInvoice(e, true)}
                    disabled={isSubmitting || isLoadingDeps}
                    className="flex-1 sm:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 cursor-pointer shadow-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        {editingInvoiceId ? 'Update & Post to Ledger' : 'Post to Ledger'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
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
              {formatCurrency(totalReceivables, invoices[0]?.currency || 'USD')}
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
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalPayables, invoices[0]?.currency || 'USD')}
            </div>
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
              {formatCurrency(overdueAmount, invoices[0]?.currency || 'USD')}
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
              {formatCurrency(collectedThisMonth, invoices[0]?.currency || 'USD')}
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
            className="cursor-pointer"
          >
            All Invoices
          </Button>
          <Button
            variant={activeTab === 'RECEIVABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('RECEIVABLE')}
            className="cursor-pointer"
          >
            Customer Invoices (AR)
          </Button>
          <Button
            variant={activeTab === 'PAYABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('PAYABLE')}
            className="cursor-pointer"
          >
            Vendor Bills (AP)
          </Button>
          <Button
            variant={activeTab === 'OVERDUE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('OVERDUE')}
            className="cursor-pointer"
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
                size="lg"
                onClick={handleOpenCreateInvoice}
                className="cursor-pointer font-semibold shadow-lg hover:shadow-primary/20"
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
                      {formatCurrency(inv.totalAmount, inv.currency)}
                      <span className="ml-1 text-[10px] text-muted-foreground font-mono uppercase">
                        {inv.currency || 'USD'}
                      </span>
                    </TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right">
                      {inv.status === 'DRAFT' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditDraft(inv.id)}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePostDraftInvoice(inv.id, inv.issueDate)}
                            disabled={postingInvoiceId === inv.id}
                            className="h-8 text-xs text-primary cursor-pointer"
                          >
                            {postingInvoiceId === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <Send className="w-3.5 h-3.5 mr-1" />
                            )}
                            Post to Ledger
                          </Button>
                        </div>
                      ) : inv.status === 'POSTED' || inv.status === 'OVERDUE' ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            In Ledger
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVoidInvoice(inv.id, inv.invoiceNumber)}
                            disabled={voidingInvoiceId === inv.id}
                            className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                            title="Void invoice to create reversing general ledger entry"
                          >
                            {voidingInvoiceId === inv.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Ban className="w-3 h-3 mr-1" />
                            )}
                            Void
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          {inv.status}
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
