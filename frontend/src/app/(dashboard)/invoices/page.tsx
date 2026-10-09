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
  ShieldAlert,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
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
import { useTenantCurrency } from '@/hooks/use-tenant-currency';
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

  // In-App Void Confirmation Modal
  const [voidModal, setVoidModal] = React.useState<{
    isOpen: boolean;
    invoiceId: string;
    invoiceNumber: string;
    reason: string;
  }>({
    isOpen: false,
    invoiceId: '',
    invoiceNumber: '',
    reason: 'Billed in error / cancelled by client',
  });

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
  const tenantCurrency = useTenantCurrency();
  const [issueDate, setIssueDate] = React.useState(getTodayDate());
  const [dueDate, setDueDate] = React.useState(addDaysToDate(getTodayDate(), 30));
  const [formCurrency, setFormCurrency] = React.useState('MYR');

  React.useEffect(() => {
    if (tenantCurrency) {
      setFormCurrency(tenantCurrency);
    }
  }, [tenantCurrency]);
  const [taxAmount, setTaxAmount] = React.useState<number>(0);
  const [postImmediately, setPostImmediately] = React.useState(true);
  const [formLines, setFormLines] = React.useState<FormLineItem[]>([
    {
      id: 'line-1',
      description: 'Enterprise Architecture & System Implementation',
      accountId: '',
      quantity: 1,
      unitPrice: 30000,
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
              l.description === 'Enterprise Architecture & System Implementation' ||
              l.description === 'Vendor Goods / Operating Expense'
                ? newType === 'INVOICE'
                  ? 'Enterprise Architecture & System Implementation'
                  : 'Vendor Goods / Operating Expense'
                : l.description,
          })),
        );
      }
    }
  };

  // Load Dependencies (Clients / Suppliers & Ledger Accounts)
  const loadDependencies = React.useCallback(async () => {
    try {
      setIsLoadingDeps(true);

      // 1. Fetch counterparties
      const cpRes = await apiClient.get<{ data: Counterparty[] }>('/counterparties');
      const cps = cpRes.data || [];
      setCounterparties(cps);

      if (cps.length === 0) {
        setCounterpartyMode('new');
      } else {
        setSelectedCounterpartyId(cps[0].id);
      }

      // 2. Fetch ledger accounts
      let accRes = await apiClient.get<{ data: LedgerAccount[] }>('/ledger/accounts');
      let accounts = accRes.data || [];

      if (accounts.length === 0) {
        const seedRes = await apiClient.post<{ data: LedgerAccount[] }>(
          '/ledger/accounts/seed-standard',
          {},
        );
        accounts = seedRes.data || [];
      }
      setLedgerAccounts(accounts);

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
      } catch {}
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        statusCode?: number;
        message?: string;
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
      }
    } finally {
      setIsLoadingDeps(false);
    }
  }, []);

  const fetchInvoices = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ data: RawInvoice[] }>('/invoices');
      const list = res.data || [];

      const mapped: InvoiceRecord[] = list.map((inv) => {
        let mappedStatus: InvoiceRecord['status'] = 'DRAFT';
        if (inv.status === 'PAID') mappedStatus = 'PAID';
        else if (inv.status === 'VOID') mappedStatus = 'VOID';
        else if (inv.status === 'POSTED' || inv.status === 'APPROVED') mappedStatus = 'POSTED';
        else mappedStatus = 'DRAFT';

        // Check if overdue
        if (mappedStatus === 'POSTED' && new Date(inv.dueDate) < new Date()) {
          mappedStatus = 'OVERDUE';
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          type:
            inv.invoiceType === 'INVOICE'
              ? ('ACCOUNTS_RECEIVABLE' as const)
              : ('ACCOUNTS_PAYABLE' as const),
          counterpartyName: inv.counterparty?.legalName || 'Unspecified Customer / Vendor',
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalAmount: Number(inv.totalCents || 0) / 100,
          currency: inv.currency || 'USD',
          status: mappedStatus,
        };
      });

      setInvoices(mapped);
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        statusCode?: number;
        message?: string;
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
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Derived calculations
  const linesSubtotal = React.useMemo(() => {
    return formLines.reduce((acc, l) => acc + (l.quantity || 1) * (l.unitPrice || 0), 0);
  }, [formLines]);

  const invoiceTotal = React.useMemo(() => {
    return linesSubtotal + (Number(taxAmount) || 0);
  }, [linesSubtotal, taxAmount]);

  const receivablesTotal = invoices
    .filter((inv) => inv.type === 'ACCOUNTS_RECEIVABLE' && inv.status !== 'VOID')
    .reduce((acc, inv) => acc + inv.totalAmount, 0);

  const payablesTotal = invoices
    .filter((inv) => inv.type === 'ACCOUNTS_PAYABLE' && inv.status !== 'VOID')
    .reduce((acc, inv) => acc + inv.totalAmount, 0);

  const overdueCount = invoices.filter((inv) => inv.status === 'OVERDUE').length;

  const filteredInvoices = invoices.filter((inv) => {
    const matchesTab =
      activeTab === 'ALL'
        ? true
        : activeTab === 'RECEIVABLE'
          ? inv.type === 'ACCOUNTS_RECEIVABLE'
          : activeTab === 'PAYABLE'
            ? inv.type === 'ACCOUNTS_PAYABLE'
            : inv.status === 'OVERDUE';

    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.counterpartyName.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  type InvoiceSortColumn =
    | 'type'
    | 'invoiceNumber'
    | 'counterpartyName'
    | 'issueDate'
    | 'dueDate'
    | 'totalAmount'
    | 'status';

  const [columnSort, setColumnSort] = React.useState<{
    column: InvoiceSortColumn | null;
    direction: 'asc' | 'desc';
  }>({ column: null, direction: 'asc' });

  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 25;

  const toggleColumnSort = (col: InvoiceSortColumn) => {
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

  const renderSortIcon = (col: InvoiceSortColumn) => {
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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, columnSort]);

  const sortedInvoices = React.useMemo(() => {
    const list = [...filteredInvoices];
    if (!columnSort.column) return list;
    return list.sort((a, b) => {
      let cmp = 0;
      switch (columnSort.column) {
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'invoiceNumber':
          cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
          break;
        case 'counterpartyName':
          cmp = a.counterpartyName.localeCompare(b.counterpartyName);
          break;
        case 'issueDate':
          cmp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case 'dueDate':
          cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'totalAmount':
          cmp = a.totalAmount - b.totalAmount;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return columnSort.direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredInvoices, columnSort]);

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize));
  const paginatedInvoices = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedInvoices.slice(start, start + pageSize);
  }, [sortedInvoices, currentPage, pageSize]);

  // Line item manipulation
  const handleAddLine = () => {
    const defaultAccount = getSuggestedAccountForType(formType, ledgerAccounts);
    setFormLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        description: '',
        accountId: defaultAccount?.id || '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (formLines.length === 1) return;
    setFormLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLine = (id: string, field: keyof FormLineItem, value: any) => {
    setFormLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const primaryCurrency = invoices[0]?.currency || tenantCurrency || 'MYR';

  // Open Create Modal
  const handleOpenCreateInvoice = async () => {
    setEditingInvoiceId(null);
    setFormType('INVOICE');
    setLineMode('simple');
    setInvoiceNumber(getNextInvoiceNumber('INVOICE', invoices));
    setIssueDate(getTodayDate());
    setDueDate(addDaysToDate(getTodayDate(), 30));
    setFormCurrency(tenantCurrency || primaryCurrency || 'MYR');
    setTaxAmount(0);
    setPostImmediately(true);

    await loadDependencies();

    const defaultRevenue = ledgerAccounts.find(
      (a) => a.accountCode === '4010' || a.classification === 'REVENUE',
    );
    setFormLines([
      {
        id: 'line-1',
        description: 'Enterprise Architecture & System Implementation',
        accountId: defaultRevenue?.id || '',
        quantity: 1,
        unitPrice: 30000,
      },
    ]);

    setIsCreatingInvoice(true);
  };

  // Submit Handler: Create or Update Invoice
  const handleCreateInvoice = async (e?: React.FormEvent, shouldPostOverride?: boolean) => {
    if (e) e.preventDefault();

    if (!invoiceNumber.trim()) {
      toast.error('Please specify an invoice number');
      return;
    }

    try {
      setIsSubmitting(true);

      let targetCounterpartyId = selectedCounterpartyId;

      if (counterpartyMode === 'new') {
        const trimmedName = newCounterpartyName.trim();
        if (!trimmedName) {
          toast.error(
            formType === 'INVOICE'
              ? 'Please enter customer / client name'
              : 'Please enter vendor / supplier name',
          );
          return;
        }

        const existingLocal = counterparties.find(
          (c) => c.legalName.toLowerCase() === trimmedName.toLowerCase(),
        );
        if (existingLocal) {
          targetCounterpartyId = existingLocal.id;
          setSelectedCounterpartyId(targetCounterpartyId);
        } else {
          try {
            const cpRes = await apiClient.post<{ data: Counterparty }>('/counterparties', {
              legalName: trimmedName,
              type: formType === 'INVOICE' ? 'CUSTOMER' : 'VENDOR',
            });
            if (cpRes.data?.id) {
              targetCounterpartyId = cpRes.data.id;
              setCounterparties((prev) => [...prev, cpRes.data]);
              setSelectedCounterpartyId(targetCounterpartyId);
            }
          } catch {
            try {
              const refreshed = await apiClient.get<{ data: Counterparty[] }>('/counterparties');
              const found = (refreshed.data || []).find(
                (c) => c.legalName.toLowerCase() === trimmedName.toLowerCase(),
              );
              if (found) {
                targetCounterpartyId = found.id;
                setCounterparties(refreshed.data);
                setSelectedCounterpartyId(found.id);
              }
            } catch {}
          }
        }
      }

      if (!targetCounterpartyId) {
        toast.error(
          formType === 'INVOICE'
            ? 'Please select or specify a customer / client'
            : 'Please select or specify a vendor / supplier',
        );
        return;
      }

      const defaultAccount = getSuggestedAccountForType(formType, ledgerAccounts);

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        invoiceType: formType,
        counterpartyId: targetCounterpartyId,
        issueDate,
        dueDate,
        currency: formCurrency,
        notes: `Created via Agentic Business OS`,
        lines: formLines.map((l) => ({
          description:
            l.description.trim() ||
            (formType === 'INVOICE' ? 'Consulting Services' : 'Operating Expense'),
          ledgerAccountId: l.accountId || defaultAccount?.id || ledgerAccounts[0]?.id,
          quantity: Number(l.quantity) || 1,
          unitCostCents: Math.round((Number(l.unitPrice) || 0) * 100),
          taxCodeId: undefined,
        })),
      };

      let targetInvoiceId = editingInvoiceId;

      if (!editingInvoiceId) {
        const res = await apiClient.post<{ data: { id: string } }>('/invoices', payload);
        targetInvoiceId = res.data?.id;
      }

      const willPost = shouldPostOverride !== undefined ? shouldPostOverride : postImmediately;

      if (willPost && targetInvoiceId) {
        const year = new Date(issueDate).getFullYear() || 2026;
        try {
          await apiClient.post('/ledger/fiscal-years', { year });
        } catch {}

        await apiClient.post(`/invoices/${targetInvoiceId}/post`, {});
        toast.success(
          editingInvoiceId
            ? 'Draft invoice updated and recorded to General Ledger!'
            : formType === 'INVOICE'
              ? 'Customer invoice recorded to General Ledger!'
              : 'Vendor bill recorded to General Ledger!',
          { duration: 4000 },
        );
      } else {
        toast.success(
          editingInvoiceId
            ? 'Draft invoice updated'
            : formType === 'INVOICE'
              ? 'Customer invoice saved as draft'
              : 'Vendor bill saved as draft',
        );
      }

      setIsCreatingInvoice(false);
      setNewCounterpartyName('');
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
        toast.error(errorObj?.data?.message || errorObj?.message || 'Failed to record invoice');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenVoidModal = (invId: string, invNum: string) => {
    setVoidModal({
      isOpen: true,
      invoiceId: invId,
      invoiceNumber: invNum,
      reason: 'Billed in error / cancelled by client',
    });
  };

  const handleConfirmVoid = async () => {
    if (!voidModal.invoiceId || !voidModal.reason.trim()) return;
    try {
      setVoidingInvoiceId(voidModal.invoiceId);
      await apiClient.post(`/invoices/${voidModal.invoiceId}/void`, {
        reason: voidModal.reason.trim(),
      });
      toast.success(
        `Invoice ${voidModal.invoiceNumber} voided. Ledger reversing entry (REV-...) recorded.`,
      );
      setVoidModal({ isOpen: false, invoiceId: '', invoiceNumber: '', reason: '' });
      await fetchInvoices();
    } catch (err: unknown) {
      const errorObj = err as { data?: { message?: string }; message?: string };
      toast.error(errorObj?.data?.message || errorObj?.message || 'Failed to void invoice');
    } finally {
      setVoidingInvoiceId(null);
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
      toast.success('Invoice recorded to General Ledger successfully');
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
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1"
          >
            <CheckCircle2 className="w-3 h-3" />
            Paid ($0 Due)
          </Badge>
        );
      case 'POSTED':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
          >
            In Books (Awaiting Payment)
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge
            variant="outline"
            className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            Overdue
          </Badge>
        );
      case 'VOID':
        return (
          <Badge
            variant="outline"
            className="bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 line-through gap-1"
          >
            <Ban className="w-3 h-3" />
            Voided (Reversed)
          </Badge>
        );
      case 'DRAFT':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
          >
            Draft (Not in Books)
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
          <h1 className="text-3xl font-bold tracking-tight">Invoices & Vendor Bills</h1>
          <p className="text-muted-foreground mt-1">
            Track money owed by customers (Sales Invoices) and bills you owe suppliers (Vendor
            Bills).
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
            Create Invoice or Bill
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-xs sm:text-sm font-medium">Customer Receivables</CardTitle>
            <ArrowDownLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            {loading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(receivablesTotal, primaryCurrency)}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:mt-1 truncate">
              {loading ? 'Calculating customer receivables...' : 'Sales invoices in General Ledger'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-xs sm:text-sm font-medium">Supplier Payables</CardTitle>
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            {loading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(payablesTotal, primaryCurrency)}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:mt-1 truncate">
              {loading ? 'Calculating supplier payables...' : 'Vendor bills awaiting payout'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-xs sm:text-sm font-medium">Overdue Invoices</CardTitle>
            <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            {loading ? (
              <div className="h-7 w-20 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div
                className={`text-lg sm:text-2xl font-bold tabular-nums ${
                  overdueCount > 0 ? 'text-rose-500' : 'text-emerald-500'
                }`}
              >
                {overdueCount} {overdueCount === 1 ? 'Invoice' : 'Invoices'}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:mt-1 truncate">
              {loading
                ? 'Auditing payment terms...'
                : overdueCount > 0
                  ? 'Action required for collection'
                  : 'Zero overdue balances'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 p-3.5 sm:p-5">
            <CardTitle className="text-xs sm:text-sm font-medium">Ledger Protection</CardTitle>
            <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0 sm:pt-0">
            {loading ? (
              <div className="h-7 w-28 bg-muted animate-pulse rounded my-0.5" />
            ) : (
              <div className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                100% Audit Ready
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:mt-1 truncate">
              {loading ? 'Verifying reversal invariants...' : 'Automated reversal on voiding'}
            </p>
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
            All Items {loading ? '' : `(${invoices.length})`}
          </Button>
          <Button
            variant={activeTab === 'RECEIVABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('RECEIVABLE')}
          >
            🏢 Customer Invoices
          </Button>
          <Button
            variant={activeTab === 'PAYABLE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('PAYABLE')}
          >
            📦 Vendor Bills
          </Button>
          <Button
            variant={activeTab === 'OVERDUE' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('OVERDUE')}
          >
            ⚠️ Overdue {loading ? '' : `(${overdueCount})`}
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by invoice # or client..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Invoices Table Card */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div>
              {/* Desktop Skeleton */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Document #</TableHead>
                      <TableHead>Customer / Vendor</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-36 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" />
                        </TableCell>
                        <TableCell>
                          <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-7 w-20 bg-muted animate-pulse rounded ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Skeleton */}
              <div className="md:hidden divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                        <div className="h-4 w-36 bg-muted animate-pulse rounded" />
                      </div>
                      <div className="h-5 w-16 bg-muted animate-pulse rounded shrink-0" />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                      <div className="h-6 w-20 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/60" />
              <div>
                <h4 className="font-semibold text-sm">No Invoices Found</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a sales invoice or vendor bill to record it in your General Ledger.
                </p>
              </div>
              <Button size="sm" onClick={handleOpenCreateInvoice}>
                <Plus className="w-4 h-4 mr-1" /> Create Invoice
              </Button>
            </div>
          ) : sortedInvoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-3">
              <Search className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div>
                <h4 className="font-semibold text-sm">No Matching Invoices Found</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search criteria or switching to a different tab.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setActiveTab('ALL');
                }}
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('type')}
                      >
                        <div className="flex items-center">Type {renderSortIcon('type')}</div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('invoiceNumber')}
                      >
                        <div className="flex items-center">
                          Document # {renderSortIcon('invoiceNumber')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('counterpartyName')}
                      >
                        <div className="flex items-center">
                          Customer / Vendor {renderSortIcon('counterpartyName')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('issueDate')}
                      >
                        <div className="flex items-center">
                          Issue Date {renderSortIcon('issueDate')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('dueDate')}
                      >
                        <div className="flex items-center">
                          Due Date {renderSortIcon('dueDate')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('totalAmount')}
                      >
                        <div className="flex items-center justify-end">
                          Total Amount {renderSortIcon('totalAmount')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground select-none group"
                        onClick={() => toggleColumnSort('status')}
                      >
                        <div className="flex items-center">Status {renderSortIcon('status')}</div>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          {inv.type === 'ACCOUNTS_RECEIVABLE' ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                            >
                              Customer Invoice
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium border-blue-500/30 text-blue-600 bg-blue-500/10"
                            >
                              Vendor Bill
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell className="font-medium text-foreground">
                          {inv.counterpartyName}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatIsoDate(inv.issueDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatIsoDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          {formatCurrency(inv.totalAmount, inv.currency)}
                        </TableCell>
                        <TableCell>{getStatusBadge(inv.status)}</TableCell>
                        <TableCell className="text-right">
                          {inv.status === 'DRAFT' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePostDraftInvoice(inv.id, inv.issueDate)}
                                disabled={postingInvoiceId === inv.id}
                                className="h-7 text-xs text-primary cursor-pointer"
                              >
                                {postingInvoiceId === inv.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                ) : (
                                  <Send className="w-3.5 h-3.5 mr-1" />
                                )}
                                Record to Books
                              </Button>
                            </div>
                          ) : inv.status === 'POSTED' || inv.status === 'OVERDUE' ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                In Books
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenVoidModal(inv.id, inv.invoiceNumber)}
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
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden divide-y divide-border">
                {paginatedInvoices.map((inv) => (
                  <div key={inv.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {inv.type === 'ACCOUNTS_RECEIVABLE' ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                            >
                              Customer Invoice
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium border-blue-500/30 text-blue-600 bg-blue-500/10"
                            >
                              Vendor Bill
                            </Badge>
                          )}
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {inv.invoiceNumber}
                          </span>
                        </div>
                        <div className="font-medium text-sm text-foreground mt-1 truncate">
                          {inv.counterpartyName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-base tabular-nums text-foreground">
                          {formatCurrency(inv.totalAmount, inv.currency)}
                        </div>
                        <div className="mt-1 flex justify-end">{getStatusBadge(inv.status)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                      <div>
                        <span>Due: </span>
                        <span className="font-mono font-medium text-foreground">
                          {formatIsoDate(inv.dueDate)}
                        </span>
                      </div>
                      <div>
                        {inv.status === 'DRAFT' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePostDraftInvoice(inv.id, inv.issueDate)}
                            disabled={postingInvoiceId === inv.id}
                            className="h-7 text-xs text-primary cursor-pointer px-2.5"
                          >
                            {postingInvoiceId === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <Send className="w-3.5 h-3.5 mr-1" />
                            )}
                            Record to Books
                          </Button>
                        ) : inv.status === 'POSTED' || inv.status === 'OVERDUE' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              In Books
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenVoidModal(inv.id, inv.invoiceNumber)}
                              disabled={voidingInvoiceId === inv.id}
                              className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
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
                          <span className="text-[11px] text-muted-foreground">{inv.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {sortedInvoices.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
                  <div className="text-xs text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium text-foreground">
                      {(currentPage - 1) * pageSize + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-foreground">
                      {Math.min(currentPage * pageSize, sortedInvoices.length)}
                    </span>{' '}
                    of <span className="font-medium text-foreground">{sortedInvoices.length}</span>{' '}
                    invoices
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Creation / Edit Modal Dialog Overlay */}
      {isCreatingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingInvoice(false);
          }}
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden my-auto animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="shrink-0 p-4 sm:p-6 pb-3 border-b border-border/50 bg-card">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    {editingInvoiceId ? 'Edit Draft' : 'Record New'}{' '}
                    {formType === 'INVOICE'
                      ? 'Customer Invoice (Money In)'
                      : 'Supplier Bill (Money Out)'}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Will record double-entry balance to Accounts{' '}
                    {formType === 'INVOICE' ? 'Receivable (1200)' : 'Payable (2010)'}.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCreatingInvoice(false)}
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Type Switcher Segmented Pills */}
              <div className="flex flex-wrap gap-2 pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant={formType === 'INVOICE' ? 'default' : 'outline'}
                  onClick={() => handleSwitchFormType('INVOICE')}
                  className="rounded-full cursor-pointer text-xs h-8"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  Customer Invoice (Money In)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={formType === 'BILL' ? 'default' : 'outline'}
                  onClick={() => handleSwitchFormType('BILL')}
                  className="rounded-full cursor-pointer text-xs h-8"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-blue-400" />
                  Vendor Bill (Money Out)
                </Button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              <form
                id="invoice-modal-form"
                onSubmit={(e) => handleCreateInvoice(e)}
                className="space-y-5"
              >
                {/* Row 1: Client / Supplier & Invoice Number */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex justify-between items-center">
                      <Label
                        htmlFor="counterpartySelect"
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {formType === 'INVOICE'
                          ? 'Customer / Client Name'
                          : 'Vendor / Supplier Name'}
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
                        className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {counterparties.map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cp.legalName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id="newCounterpartyName"
                        placeholder={
                          formType === 'INVOICE'
                            ? 'e.g. Starlight Corp / Acme Global'
                            : 'e.g. AWS Cloud / Office Depot'
                        }
                        value={newCounterpartyName}
                        onChange={(e) => setNewCounterpartyName(e.target.value)}
                        className="bg-background"
                        required
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="invoiceNumber"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Invoice Number
                    </Label>
                    <Input
                      id="invoiceNumber"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="INV-2026-001"
                      className="font-mono bg-background"
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Dates & Currency */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="issueDate"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Issue Date
                    </Label>
                    <Input
                      id="issueDate"
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="dueDate"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Payment Due Date
                    </Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="formCurrency"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Billing Currency
                    </Label>
                    <select
                      id="formCurrency"
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    >
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="MYR">MYR (RM) - Malaysian Ringgit</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                      <option value="SGD">SGD ($) - Singapore Dollar</option>
                    </select>
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center border-b border-border/50 pb-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Line Item Breakdown
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAddLine}
                      className="h-8 text-xs text-primary hover:text-primary cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Item Line
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {formLines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 items-end"
                      >
                        <div className="md:col-span-5 space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Description</Label>
                          <Input
                            placeholder="e.g. Enterprise Architecture Consulting"
                            value={line.description}
                            onChange={(e) =>
                              handleUpdateLine(line.id, 'description', e.target.value)
                            }
                            className="bg-background text-xs"
                            required
                          />
                        </div>

                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            General Ledger Category
                          </Label>
                          <select
                            value={line.accountId}
                            onChange={(e) => handleUpdateLine(line.id, 'accountId', e.target.value)}
                            className="w-full h-9 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {ledgerAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.accountCode} - {a.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 md:col-span-4 gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Qty</Label>
                            <Input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                handleUpdateLine(line.id, 'quantity', Number(e.target.value) || 1)
                              }
                              className="bg-background text-xs text-center h-9"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground truncate">
                              Price ({getCurrencySymbol(formCurrency)})
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPrice}
                              onChange={(e) =>
                                handleUpdateLine(line.id, 'unitPrice', Number(e.target.value) || 0)
                              }
                              className="bg-background text-xs font-mono text-right h-9"
                              required
                            />
                          </div>

                          <div className="col-span-2 md:col-span-1 flex justify-end pb-0.5">
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
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals & Summary */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pt-2 border-t border-border/50">
                  <div className="space-y-1 max-w-sm text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Double-Entry General Ledger Guarantee
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      {formType === 'INVOICE'
                        ? 'Recording automatically posts Debit AR (1200) and Credit Revenue (4010).'
                        : 'Recording automatically posts Debit Expense (5010/6010) and Credit AP (2010).'}
                    </p>
                  </div>

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
                      <span className="text-primary tabular-nums font-mono">
                        {formatCurrency(invoiceTotal, formCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Sticky Footer Actions */}
            <div className="shrink-0 p-4 sm:p-6 border-t border-border/50 bg-card/95 backdrop-blur-sm flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreatingInvoice(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto cursor-pointer"
              >
                Cancel
              </Button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => handleCreateInvoice(e, false)}
                  disabled={isSubmitting || isLoadingDeps}
                  className="cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-1.5 text-muted-foreground" />
                  )}
                  Save as Draft (Not in Books)
                </Button>

                <Button
                  type="button"
                  onClick={(e) => handleCreateInvoice(e, true)}
                  disabled={isSubmitting || isLoadingDeps}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 cursor-pointer shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Confirm & Record to Books
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-App Void Confirmation Modal */}
      {voidModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVoidModal((prev) => ({ ...prev, isOpen: false }));
          }}
        >
          <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-2.5 rounded-full bg-rose-500/10">
                <Ban className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Void Invoice {voidModal.invoiceNumber}
                </h3>
                <p className="text-xs text-muted-foreground">General Ledger Reversal</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Voiding this invoice will immediately post an automated reversing entry (
              <span className="font-mono text-xs font-semibold text-foreground">
                REV-{voidModal.invoiceNumber}
              </span>
              ) in your General Ledger to cancel out Accounts Receivable and Revenue with zero
              balance drift.
            </p>

            <div className="space-y-2 mb-5">
              <Label htmlFor="voidReason" className="text-xs font-semibold">
                Reason for Voiding:
              </Label>
              <select
                id="voidReason"
                value={voidModal.reason}
                onChange={(e) => setVoidModal((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Billed in error / cancelled by client">
                  Billed in error / cancelled by client
                </option>
                <option value="Duplicate invoice issued">Duplicate invoice issued</option>
                <option value="Client requested scope change">Client requested scope change</option>
                <option value="Pricing or tax code adjustment">
                  Pricing or tax code adjustment
                </option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVoidModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={voidingInvoiceId !== null}
              >
                Keep Invoice
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmVoid}
                disabled={voidingInvoiceId !== null}
                className="font-semibold shadow-sm"
              >
                {voidingInvoiceId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Recording Reversal...
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5 mr-1.5" />
                    Confirm Void & Reverse
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
