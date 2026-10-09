'use client';

import * as React from 'react';
import {
  Check,
  AlertTriangle,
  FileQuestion,
  Building2,
  CheckCircle2,
  Bot,
  HelpCircle,
  XCircle,
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  BookmarkCheck,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Table2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';
import {
  exceptionKeys,
  ExceptionItem,
  ExceptionType,
  getPendingExceptions,
  resolveException,
  batchResolveExceptions,
} from '@/lib/api/exceptions';

const STANDARD_CATEGORIES = [
  { code: '5020', name: 'Subcontractor & Freelancer Fees', type: 'EXPENSE' },
  { code: '5010', name: 'Cost of Goods Sold & Operating Supplies', type: 'EXPENSE' },
  { code: '6010', name: 'Software, Cloud & SaaS Subscriptions', type: 'EXPENSE' },
  { code: '6020', name: 'Office Supplies & Equipment', type: 'EXPENSE' },
  { code: '6030', name: 'Bank Charges & Payment Processing Fees', type: 'EXPENSE' },
  { code: '6040', name: 'Professional Legal & Accounting Services', type: 'EXPENSE' },
  { code: '6050', name: 'Travel, Meals & Entertainment', type: 'EXPENSE' },
  { code: '1200', name: 'Customer Accounts Receivable (AR Match)', type: 'ASSET' },
  { code: '4010', name: 'Direct Customer Revenue', type: 'REVENUE' },
];

export function ExceptionListClient({
  initialData,
  searchTerm = '',
}: {
  initialData?: ExceptionItem[];
  searchTerm?: string;
}) {
  const queryClient = useQueryClient();
  const tenantCurrency = useTenantCurrency();
  const [selectedId, setSelectedId] = React.useState<string | null>(initialData?.[0]?.id || null);
  const [mobileView, setMobileView] = React.useState<'list' | 'detail'>('list');
  const [showRawMemo, setShowRawMemo] = React.useState(false);
  const [selectedCategoryCode, setSelectedCategoryCode] = React.useState<string>('5020');
  const [rememberRule, setRememberRule] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'NEW_PAYEE' | 'NEEDS_CATEGORY'>(
    'ALL',
  );
  const [viewMode, setViewMode] = React.useState<'split' | 'table'>('split');
  type ExceptionSortColumn =
    'date' | 'cleanPayee' | 'friendlyTypeLabel' | 'amount' | 'confidenceScore';

  const [columnSort, setColumnSort] = React.useState<{
    column: ExceptionSortColumn | null;
    direction: 'asc' | 'desc';
  }>({ column: null, direction: 'asc' });

  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 20;

  const toggleColumnSort = (col: ExceptionSortColumn) => {
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

  const renderSortIcon = (col: ExceptionSortColumn) => {
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

  const { data: exceptions = [], isLoading } = useQuery<ExceptionItem[]>({
    queryKey: [...exceptionKeys.lists(), tenantCurrency],
    queryFn: () => getPendingExceptions(tenantCurrency),
    initialData: initialData && initialData.length > 0 ? initialData : undefined,
  });

  const filteredExceptions = React.useMemo(() => {
    let result = exceptions;
    if (statusFilter === 'NEW_PAYEE') {
      result = result.filter((e) => e.friendlyTypeLabel === 'New Payee');
    } else if (statusFilter === 'NEEDS_CATEGORY') {
      result = result.filter(
        (e) => e.friendlyTypeLabel === 'Category Needed' || e.friendlyTypeLabel === 'Subscription',
      );
    }

    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(
      (e) =>
        e.cleanPayee.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term) ||
        e.friendlyTypeLabel.toLowerCase().includes(term) ||
        e.aiProposal.toLowerCase().includes(term),
    );
  }, [exceptions, searchTerm, statusFilter]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, columnSort]);

  const sortedExceptions = React.useMemo(() => {
    const list = [...filteredExceptions];
    if (!columnSort.column) return list;
    return list.sort((a, b) => {
      let cmp = 0;
      switch (columnSort.column) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'cleanPayee':
          cmp = a.cleanPayee.localeCompare(b.cleanPayee);
          break;
        case 'friendlyTypeLabel':
          cmp = a.friendlyTypeLabel.localeCompare(b.friendlyTypeLabel);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'confidenceScore':
          cmp = a.confidenceScore - b.confidenceScore;
          break;
      }
      return columnSort.direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredExceptions, columnSort]);

  const totalPages = Math.max(1, Math.ceil(sortedExceptions.length / pageSize));
  const paginatedExceptions = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedExceptions.slice(start, start + pageSize);
  }, [sortedExceptions, currentPage, pageSize]);

  React.useEffect(() => {
    if (
      (!selectedId || !sortedExceptions.some((e) => e.id === selectedId)) &&
      sortedExceptions.length > 0
    ) {
      setSelectedId(sortedExceptions[0].id);
    }
  }, [sortedExceptions, selectedId]);

  const selectedException = exceptions.find((e) => e.id === selectedId);

  // Auto-sync category selection when selected item changes
  React.useEffect(() => {
    if (selectedException) {
      setSelectedCategoryCode(selectedException.suggestedAccountCode || '5020');
      setShowRawMemo(false);
    }
  }, [selectedException?.id]);

  // Optimistic Mutation: Approve
  const resolveMutation = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) =>
      resolveException(
        id,
        'APPROVE',
        `Approved under category ${category}. Rule remembered: ${rememberRule}`,
      ),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: exceptionKeys.lists() });
      const previousData = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists());

      queryClient.setQueryData<ExceptionItem[]>(exceptionKeys.lists(), (old) => {
        if (!old) return [];
        return old.filter((item) => item.id !== id);
      });

      const currentList = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists()) || [];
      if (currentList.length > 0) {
        setSelectedId(currentList[0].id);
      } else {
        setSelectedId(null);
      }

      return { previousData };
    },
    onSuccess: () => {
      toast.success('Approved & recorded to General Ledger');
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(exceptionKeys.lists(), context.previousData);
      }
      toast.error('Failed to approve transaction.');
      console.error('Failed to resolve exception item:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all });
    },
  });

  // Optimistic Mutation: Dismiss
  const dismissMutation = useMutation({
    mutationFn: (id: string) =>
      resolveException(id, 'REJECT', 'Ignored and excluded from General Ledger.'),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: exceptionKeys.lists() });
      const previousData = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists());

      queryClient.setQueryData<ExceptionItem[]>(exceptionKeys.lists(), (old) => {
        if (!old) return [];
        return old.filter((item) => item.id !== id);
      });

      const currentList = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists()) || [];
      if (currentList.length > 0) {
        setSelectedId(currentList[0].id);
      } else {
        setSelectedId(null);
      }

      return { previousData };
    },
    onSuccess: () => {
      toast.success('Transaction excluded and left unmatched.');
    },
    onError: (err, id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(exceptionKeys.lists(), context.previousData);
      }
      toast.error('Failed to update transaction.');
      console.error('Failed to dismiss exception item:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all });
    },
  });

  // Batch Selection State
  const [selectedExceptionIds, setSelectedExceptionIds] = React.useState<Set<string>>(new Set());

  // Batch Mutation
  const batchResolveMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'APPROVE' | 'REJECT' }) =>
      batchResolveExceptions(
        ids,
        action,
        action === 'APPROVE'
          ? `Batch approved by supervisor`
          : 'Batch ignored and excluded from General Ledger',
      ),
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: exceptionKeys.lists() });
      const previousData = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists());
      const idSet = new Set(ids);

      queryClient.setQueryData<ExceptionItem[]>(exceptionKeys.lists(), (old) => {
        if (!old) return [];
        return old.filter((item) => !idSet.has(item.id));
      });

      setSelectedExceptionIds(new Set());
      return { previousData };
    },
    onSuccess: (_, variables) => {
      const count = variables.ids.length;
      if (variables.action === 'APPROVE') {
        toast.success(
          `Batch approved ${count} ${count === 1 ? 'exception' : 'exceptions'} & recorded to General Ledger.`,
        );
      } else {
        toast.success(`Excluded ${count} ${count === 1 ? 'exception' : 'exceptions'} from books.`);
      }
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(exceptionKeys.lists(), context.previousData);
      }
      toast.error('Failed to complete batch resolution.');
      console.error('Batch resolution error:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all });
    },
  });

  const isAllOnPageSelected =
    paginatedExceptions.length > 0 &&
    paginatedExceptions.every((e) => selectedExceptionIds.has(e.id));

  const toggleSelectAllOnPage = () => {
    setSelectedExceptionIds((prev) => {
      const next = new Set(prev);
      if (isAllOnPageSelected) {
        paginatedExceptions.forEach((e) => next.delete(e.id));
      } else {
        paginatedExceptions.forEach((e) => next.add(e.id));
      }
      return next;
    });
  };

  const toggleSelectException = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setSelectedExceptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const highConfidenceExceptions = React.useMemo(() => {
    return filteredExceptions.filter((e) => e.confidenceScore >= 90);
  }, [filteredExceptions]);

  const selectAllHighConfidence = () => {
    setSelectedExceptionIds((prev) => {
      const next = new Set(prev);
      highConfidenceExceptions.forEach((e) => next.add(e.id));
      return next;
    });
    toast.info(`Selected ${highConfidenceExceptions.length} high-confidence exceptions (≥90%).`);
  };

  const selectedTotalAmount = React.useMemo(() => {
    return Array.from(selectedExceptionIds).reduce((sum, id) => {
      const exc = exceptions.find((e) => e.id === id);
      return sum + (exc ? exc.amount : 0);
    }, 0);
  }, [selectedExceptionIds, exceptions]);

  const handleBatchApproveSelected = () => {
    if (selectedExceptionIds.size === 0 || batchResolveMutation.isPending) return;
    batchResolveMutation.mutate({
      ids: Array.from(selectedExceptionIds),
      action: 'APPROVE',
    });
  };

  const handleBatchDismissSelected = () => {
    if (selectedExceptionIds.size === 0 || batchResolveMutation.isPending) return;
    batchResolveMutation.mutate({
      ids: Array.from(selectedExceptionIds),
      action: 'REJECT',
    });
  };

  const handleBatchApproveHighConfidence = () => {
    if (highConfidenceExceptions.length === 0 || batchResolveMutation.isPending) return;
    batchResolveMutation.mutate({
      ids: highConfidenceExceptions.map((e) => e.id),
      action: 'APPROVE',
    });
  };

  const handleApprove = () => {
    if (selectedId && !resolveMutation.isPending) {
      resolveMutation.mutate({ id: selectedId, category: selectedCategoryCode });
    }
  };

  const handleDismiss = () => {
    if (selectedId && !dismissMutation.isPending) {
      dismissMutation.mutate(selectedId);
    }
  };

  const handleSkip = () => {
    if (!selectedId || filteredExceptions.length === 0) return;
    if (filteredExceptions.length === 1) {
      toast.info('This is the only pending item in the queue.');
      return;
    }
    const currentIndex = filteredExceptions.findIndex((e) => e.id === selectedId);
    const nextIndex = (currentIndex + 1) % filteredExceptions.length;
    setSelectedId(filteredExceptions[nextIndex].id);
    toast.info(`Skipped to next item (${nextIndex + 1} of ${filteredExceptions.length})`);
  };

  // Keyboard shortcut listener (Enter = Approve, S = Skip)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedCategoryCode, filteredExceptions]);

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 shrink-0"
        >
          🟢 {confidence}% High Match
        </Badge>
      );
    }
    if (confidence >= 55) {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium border-amber-500/30 text-amber-600 bg-amber-500/10 dark:text-amber-400 shrink-0"
        >
          🟡 {confidence}% Suggested
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-medium border-rose-500/30 text-rose-600 bg-rose-500/10 dark:text-rose-400 shrink-0"
      >
        🔴 {confidence}% Review
      </Badge>
    );
  };

  const getTypeIcon = (type: ExceptionType) => {
    switch (type) {
      case 'unrecognized_vendor':
      case 'UNKNOWN_TRANSACTION':
        return <Building2 className="w-4 h-4 text-primary" />;
      case 'ambiguous_category':
      case 'AMBIGUOUS_TRANSACTION':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      case 'DUPLICATE':
      case 'DUPLICATE_TRANSACTION':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'missing_receipt':
      case 'MISSING_RECEIPT':
        return <FileQuestion className="w-4 h-4 text-blue-500" />;
      default:
        return <HelpCircle className="w-4 h-4 text-primary" />;
    }
  };

  if (isLoading && exceptions.length === 0) {
    return (
      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        <div className="w-full md:w-5/12 flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-xl border border-border/70 bg-card space-y-2.5">
              <div className="flex justify-between items-center">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-3 w-48 bg-muted/60 animate-pulse rounded" />
              <div className="flex justify-between items-center pt-1">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-3 w-14 bg-muted/60 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:flex w-full md:w-7/12 flex-col bg-card border border-border/80 rounded-2xl p-6 space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted/60 animate-pulse rounded" />
          <div className="h-28 bg-muted/40 animate-pulse rounded-xl" />
          <div className="h-10 w-full bg-muted animate-pulse rounded-lg mt-auto" />
        </div>
      </div>
    );
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col h-full pt-12">
        <EmptyState
          icon={CheckCircle2}
          title="All Caught Up!"
          description="Your accounting books are 100% reconciled. There are no transactions currently waiting for your review."
          actionLabel="Refresh Queue"
          onAction={() => {
            queryClient.invalidateQueries({ queryKey: exceptionKeys.lists() });
          }}
        />
      </div>
    );
  }

  const selectedCategoryObj =
    STANDARD_CATEGORIES.find((c) => c.code === selectedCategoryCode) || STANDARD_CATEGORIES[0];

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      {/* Filter Tabs Bar (Scrollable on Mobile) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          <Button
            variant={statusFilter === 'ALL' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
            className="h-7 text-xs font-semibold rounded-lg shrink-0"
          >
            All Items ({exceptions.length})
          </Button>
          <Button
            variant={statusFilter === 'NEW_PAYEE' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('NEW_PAYEE')}
            className="h-7 text-xs font-semibold rounded-lg shrink-0"
          >
            👤 New Payees
          </Button>
          <Button
            variant={statusFilter === 'NEEDS_CATEGORY' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('NEEDS_CATEGORY')}
            className="h-7 text-xs font-semibold rounded-lg shrink-0"
          >
            ⚡ Category Needed
          </Button>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted/70 p-0.5 rounded-lg border border-border/60">
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('split')}
              className="h-6 text-[11px] px-2.5 gap-1 rounded-md"
            >
              <LayoutList className="w-3 h-3" />
              Triage Split
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-6 text-[11px] px-2.5 gap-1 rounded-md"
            >
              <Table2 className="w-3 h-3" />
              Table View
            </Button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground border-l border-border/60 pl-2.5">
            <span>Shortcuts:</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border">
              Enter
            </kbd>
            <span>Approve</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border">
              S
            </kbd>
            <span>Skip</span>
          </div>
        </div>
      </div>

      {/* ⚡ High-Confidence AI Sweep Banner (Approach 2) */}
      {highConfidenceExceptions.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground">
              <strong>{highConfidenceExceptions.length} exceptions</strong> have high AI confidence
              (≥ 90%) with unambiguous vendor categorization.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 border-primary/30 text-primary hover:bg-primary/20"
              onClick={selectAllHighConfidence}
            >
              Select High Confidence ({highConfidenceExceptions.length})
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs px-3 bg-primary text-primary-foreground font-medium shadow-xs"
              onClick={handleBatchApproveHighConfidence}
              disabled={batchResolveMutation.isPending}
            >
              {batchResolveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1" />
              )}
              Approve All {highConfidenceExceptions.length}
            </Button>
          </div>
        </div>
      )}

      {sortedExceptions.length === 0 ? (
        <Card className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
          <HelpCircle className="w-10 h-10 text-muted-foreground/60" />
          <div>
            <h4 className="font-semibold text-sm">No Matching Review Items</h4>
            <p className="text-xs text-muted-foreground mt-1">
              No transactions match your current search criteria or filter.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusFilter('ALL');
            }}
          >
            Reset Filters
          </Button>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="p-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px] px-3">
                    <input
                      type="checkbox"
                      checked={
                        paginatedExceptions.length > 0 &&
                        paginatedExceptions.every((e) => selectedExceptionIds.has(e.id))
                      }
                      onChange={toggleSelectAllOnPage}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground select-none group w-[120px]"
                    onClick={() => toggleColumnSort('date')}
                  >
                    <div className="flex items-center">Date {renderSortIcon('date')}</div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground select-none group"
                    onClick={() => toggleColumnSort('cleanPayee')}
                  >
                    <div className="flex items-center">
                      Counterparty & Inquiry {renderSortIcon('cleanPayee')}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground select-none group"
                    onClick={() => toggleColumnSort('friendlyTypeLabel')}
                  >
                    <div className="flex items-center">
                      Type {renderSortIcon('friendlyTypeLabel')}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:text-foreground select-none group"
                    onClick={() => toggleColumnSort('amount')}
                  >
                    <div className="flex items-center justify-end">
                      Amount {renderSortIcon('amount')}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground select-none group w-[150px]"
                    onClick={() => toggleColumnSort('confidenceScore')}
                  >
                    <div className="flex items-center">
                      Confidence {renderSortIcon('confidenceScore')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedExceptions.map((exc) => {
                  const isOutflow = exc.direction === 'OUTFLOW';
                  const isChecked = selectedExceptionIds.has(exc.id);
                  return (
                    <TableRow
                      key={exc.id}
                      className={`hover:bg-muted/40 transition-colors ${
                        isChecked ? 'bg-primary/5' : ''
                      }`}
                    >
                      <TableCell className="w-[44px] px-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectException(exc.id)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                          aria-label={`Select exception ${exc.cleanPayee}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatIsoDate(exc.date)}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          {getTypeIcon(exc.type)}
                          <span>{exc.cleanPayee}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-sm truncate">
                          {exc.friendlyQuestion}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
                          {exc.friendlyTypeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-xs tabular-nums whitespace-nowrap">
                        <span
                          className={
                            isOutflow ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {isOutflow ? '-' : '+'}
                          {formatCurrency(exc.amount, exc.currency || tenantCurrency)}
                        </span>
                      </TableCell>
                      <TableCell>{getConfidenceBadge(exc.confidenceScore)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedId(exc.id);
                              setViewMode('split');
                            }}
                            className="h-7 text-xs px-2.5"
                          >
                            Review
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              resolveMutation.mutate({
                                id: exc.id,
                                category: exc.suggestedAccountCode || '5020',
                              });
                            }}
                            disabled={resolveMutation.isPending}
                            className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>

          {/* Table Pagination Footer */}
          {sortedExceptions.length > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 border-t bg-muted/20 shrink-0">
              <div className="text-xs text-muted-foreground">
                Showing{' '}
                <span className="font-medium text-foreground">
                  {(currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium text-foreground">
                  {Math.min(currentPage * pageSize, sortedExceptions.length)}
                </span>{' '}
                of <span className="font-medium text-foreground">{sortedExceptions.length}</span>{' '}
                exceptions
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-7 px-2.5 text-xs"
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
                  className="h-7 px-2.5 text-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        /* Main Master-Detail Split Screen */
        <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
          {/* Left Pane: Triage Cards List (40% Width) */}
          <div
            className={`w-full md:w-5/12 flex-col gap-2 overflow-y-auto pr-1.5 ${
              mobileView === 'detail' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="flex items-center justify-between px-1 py-0.5 text-xs text-muted-foreground shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground select-none">
                <input
                  type="checkbox"
                  checked={
                    paginatedExceptions.length > 0 &&
                    paginatedExceptions.every((e) => selectedExceptionIds.has(e.id))
                  }
                  onChange={toggleSelectAllOnPage}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
                <span>Select all on page ({paginatedExceptions.length})</span>
              </label>
              {selectedExceptionIds.size > 0 && (
                <span className="font-medium text-primary text-[11px]">
                  {selectedExceptionIds.size} selected
                </span>
              )}
            </div>
            {paginatedExceptions.map((exc) => {
              const isSelected = selectedId === exc.id;
              const isOutflow = exc.direction === 'OUTFLOW';
              const isChecked = selectedExceptionIds.has(exc.id);

              return (
                <div
                  key={exc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(exc.id);
                    setMobileView('detail');
                  }}
                  className={`w-full shrink-0 text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40'
                      : isChecked
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/80 bg-card hover:bg-muted/40 hover:border-border'
                  }`}
                >
                  {/* Active Indicator Strip */}
                  {isSelected && (
                    <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary rounded-r" />
                  )}

                  <div className="flex items-start gap-2.5">
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleSelectException(exc.id, e)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
                        aria-label={`Select ${exc.cleanPayee}`}
                      />
                    </div>
                    <div className="p-1.5 rounded-lg bg-muted/60 shrink-0 mt-0.5">
                      {getTypeIcon(exc.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top Row: Clean Payee & Prominent Amount */}
                      <div className="flex justify-between items-start gap-2 mb-0.5">
                        <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {exc.cleanPayee}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-semibold text-xs sm:text-sm whitespace-nowrap shrink-0 ${
                            isOutflow ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isOutflow ? '-' : '+'}
                          {formatCurrency(exc.amount, exc.currency || tenantCurrency)}
                        </span>
                      </div>

                      {/* Middle Row: Plain-English Question */}
                      <p className="text-[11px] text-muted-foreground truncate mb-2">
                        {exc.friendlyQuestion}
                      </p>

                      {/* Bottom Row: Badges & Date */}
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-medium px-1.5 py-0"
                          >
                            {exc.friendlyTypeLabel}
                          </Badge>
                          {getConfidenceBadge(exc.confidenceScore)}
                        </div>
                        <span className="tabular-nums text-muted-foreground text-[10px] shrink-0">
                          {formatIsoDate(exc.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Split View Left Pane Mini Pagination */}
            {sortedExceptions.length > pageSize && (
              <div className="flex items-center justify-between p-2 pt-3 border-t border-border/60 text-xs text-muted-foreground shrink-0 mt-auto">
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Pane: Action & Decision Pane (60% Width) - Responsive & Accessible */}
          <div
            className={`w-full md:w-7/12 flex-col min-h-0 bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm ${
              mobileView === 'list' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {selectedException ? (
              <>
                {/* Header Hero (Mobile-Responsive Amount & Labels) */}
                <div className="p-4 sm:p-5 border-b border-border/60 bg-muted/20 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileView('list')}
                    className="md:hidden self-start -ml-2 text-muted-foreground hover:text-foreground h-7 px-2 mb-2 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to review list
                  </Button>

                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] bg-background shrink-0"
                        >
                          ID: {selectedException.id.slice(0, 8).toUpperCase()}
                        </Badge>
                        {getConfidenceBadge(selectedException.confidenceScore)}
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          • {formatIsoDate(selectedException.date)}
                        </span>
                      </div>
                      <h2 className="text-lg sm:text-2xl font-bold text-foreground tracking-tight truncate">
                        {selectedException.cleanPayee}
                      </h2>
                    </div>

                    <div className="sm:text-right shrink-0 flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                        Amount
                      </div>
                      <div
                        className={`text-xl sm:text-3xl font-mono tabular-nums font-bold tracking-tight ${
                          selectedException.direction === 'OUTFLOW'
                            ? 'text-foreground'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {selectedException.direction === 'OUTFLOW' ? '-' : '+'}
                        {formatCurrency(
                          selectedException.amount,
                          selectedException.currency || tenantCurrency,
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Raw Memo Drawer Toggle */}
                  <div className="mt-2.5 pt-2 border-t border-border/40">
                    <button
                      type="button"
                      onClick={() => setShowRawMemo(!showRawMemo)}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <span>
                        {showRawMemo ? 'Hide raw bank memo' : '🔍 View raw bank statement memo'}
                      </span>
                      {showRawMemo ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {showRawMemo && (
                      <div className="mt-2 p-2.5 rounded-lg bg-background/80 border border-border/70 font-mono text-[11px] text-muted-foreground break-all leading-relaxed">
                        {selectedException.rawMemo}
                      </div>
                    )}
                  </div>
                </div>

                {/* Body: Unified View */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4 bg-background/40 overflow-y-auto">
                  {/* 1. Compact AI Assistant Recommendation */}
                  <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2.5 shrink-0">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="text-xs text-foreground leading-relaxed">
                      <span className="font-semibold text-primary">AI Recommendation: </span>
                      {selectedException.aiProposal}
                    </div>
                  </div>

                  {/* 2. Interactive Category & Rule Configuration */}
                  <div className="p-3.5 sm:p-4 rounded-xl border border-border/80 bg-card space-y-3 shrink-0 shadow-none">
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                        <span>Assign General Ledger Category:</span>
                        <span className="text-[11px] font-normal text-muted-foreground font-mono">
                          Code: {selectedCategoryCode}
                        </span>
                      </label>
                      <select
                        value={selectedCategoryCode}
                        onChange={(e) => setSelectedCategoryCode(e.target.value)}
                        className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                      >
                        {STANDARD_CATEGORIES.map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {cat.code} — {cat.name} ({cat.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <input
                        type="checkbox"
                        id="rememberRule"
                        checked={rememberRule}
                        onChange={(e) => setRememberRule(e.target.checked)}
                        className="w-3.5 h-3.5 text-primary rounded border-border focus:ring-primary cursor-pointer"
                      />
                      <label
                        htmlFor="rememberRule"
                        className="text-xs text-foreground font-medium cursor-pointer"
                      >
                        Always remember this category for future &ldquo;
                        {selectedException.cleanPayee}
                        &rdquo; transfers
                      </label>
                    </div>

                    {/* Double-Entry Ledger Guarantee */}
                    <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>
                        Records Debit <strong>{selectedCategoryObj.name}</strong> & Credit{' '}
                        <strong>Operating Cash (1010)</strong>.
                      </span>
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />
                </div>

                {/* Footer Actions (Responsive Buttons & Sticky on Mobile) */}
                <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/20 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    disabled={dismissMutation.isPending || resolveMutation.isPending}
                    className="text-xs text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer h-8 px-2.5 justify-center sm:justify-start order-3 sm:order-1"
                    title="Exclude from books without recording to General Ledger"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Ignore / Exclude
                  </Button>

                  <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSkip}
                      disabled={resolveMutation.isPending}
                      className="text-xs cursor-pointer h-8 px-3 flex-1 sm:flex-initial"
                    >
                      Skip (S)
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApprove}
                      disabled={resolveMutation.isPending}
                      className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-8 px-4 cursor-pointer shadow-sm flex-1 sm:flex-initial"
                    >
                      {resolveMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          Recording...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          Approve & Record
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground text-xs">
                <p>Select a transaction from the list on the left to review details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Batch Action Bar (Approach 1) */}
      {selectedExceptionIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 sm:gap-3 bg-card/95 backdrop-blur-md border border-border/80 px-4 py-2.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 duration-200 max-w-[95vw] sm:max-w-none">
          <div className="flex items-center gap-2 pr-2.5 sm:pr-3 border-r border-border/60 shrink-0">
            <Badge variant="default" className="text-xs px-2 py-0.5 font-medium">
              {selectedExceptionIds.size} Selected
            </Badge>
            <span className="text-xs font-mono font-bold text-foreground tabular-nums hidden sm:inline">
              {formatCurrency(selectedTotalAmount, tenantCurrency)}
            </span>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm cursor-pointer"
            disabled={batchResolveMutation.isPending}
            onClick={handleBatchApproveSelected}
          >
            {batchResolveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Approve Selected ({selectedExceptionIds.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-2.5 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5 cursor-pointer"
            disabled={batchResolveMutation.isPending}
            onClick={handleBatchDismissSelected}
          >
            <XCircle className="w-3.5 h-3.5" />
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setSelectedExceptionIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
