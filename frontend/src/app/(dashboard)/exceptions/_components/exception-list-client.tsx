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
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';
import {
  exceptionKeys,
  ExceptionItem,
  ExceptionType,
  getPendingExceptions,
  resolveException,
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
    if (
      (!selectedId || !filteredExceptions.some((e) => e.id === selectedId)) &&
      filteredExceptions.length > 0
    ) {
      setSelectedId(filteredExceptions[0].id);
    }
  }, [filteredExceptions, selectedId]);

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
      <div className="flex flex-col h-[calc(100vh-10rem)] items-center justify-center space-y-3">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">
          Loading pending review items...
        </p>
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

        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
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

      {/* Main Master-Detail Split Screen */}
      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Left Pane: Triage Cards List (40% Width) */}
        <div
          className={`w-full md:w-5/12 flex-col gap-2 overflow-y-auto pr-1.5 ${
            mobileView === 'detail' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {filteredExceptions.map((exc) => {
            const isSelected = selectedId === exc.id;
            const isOutflow = exc.direction === 'OUTFLOW';

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
                    : 'border-border/80 bg-card hover:bg-muted/40 hover:border-border'
                }`}
              >
                {/* Active Indicator Strip */}
                {isSelected && (
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary rounded-r" />
                )}

                <div className="flex items-start gap-2.5">
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
                        <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
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
                      Always remember this category for future &ldquo;{selectedException.cleanPayee}
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
    </div>
  );
}
