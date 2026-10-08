'use client';

import * as React from 'react';
import {
  Check,
  AlertTriangle,
  FileQuestion,
  ChevronRight,
  Building2,
  UploadCloud,
  CheckCircle2,
  Bot,
  HelpCircle,
  SkipForward,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency, formatIsoDate } from '@/lib/formatters';
import {
  exceptionKeys,
  ExceptionItem,
  ExceptionType,
  getPendingExceptions,
  resolveException,
} from '@/lib/api/exceptions';

export function ExceptionListClient({
  initialData,
  searchTerm = '',
}: {
  initialData?: ExceptionItem[];
  searchTerm?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(initialData?.[0]?.id || null);
  const [mobileView, setMobileView] = React.useState<'list' | 'detail'>('list');

  const { data: exceptions = [], isLoading } = useQuery<ExceptionItem[]>({
    queryKey: exceptionKeys.lists(),
    queryFn: () => getPendingExceptions(),
    initialData: initialData && initialData.length > 0 ? initialData : undefined,
  });

  const filteredExceptions = React.useMemo(() => {
    if (!searchTerm.trim()) return exceptions;
    const term = searchTerm.toLowerCase();
    return exceptions.filter(
      (e) =>
        e.description.toLowerCase().includes(term) ||
        e.type.toLowerCase().includes(term) ||
        e.aiProposal.toLowerCase().includes(term),
    );
  }, [exceptions, searchTerm]);

  React.useEffect(() => {
    if (
      (!selectedId || !filteredExceptions.some((e) => e.id === selectedId)) &&
      filteredExceptions.length > 0
    ) {
      setSelectedId(filteredExceptions[0].id);
    }
  }, [filteredExceptions, selectedId]);

  // Optimistic Mutation: Approve
  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveException(id, 'APPROVE'),
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
      toast.success('Transaction approved and recorded to books.');
    },
    onError: (err, id, context) => {
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
    mutationFn: (id: string) => resolveException(id, 'REJECT'),
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
      toast.success('Transaction ignored and left unmatched.');
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

  const selectedException = exceptions.find((e) => e.id === selectedId);

  const handleApprove = () => {
    if (selectedId) {
      resolveMutation.mutate(selectedId);
    }
  };

  const handleDismiss = () => {
    if (selectedId) {
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

  const getTypeIcon = (type: ExceptionType) => {
    switch (type) {
      case 'unrecognized_vendor':
      case 'UNKNOWN_TRANSACTION':
      case 'AMBIGUOUS_TRANSACTION':
        return <Building2 className="w-4 h-4 text-orange-500" />;
      case 'ambiguous_category':
      case 'DUPLICATE':
      case 'DUPLICATE_STATEMENT':
      case 'DUPLICATE_TRANSACTION':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'missing_receipt':
      case 'MISSING_RECEIPT':
        return <FileQuestion className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
  };

  const getTypeLabel = (type: ExceptionType) => {
    switch (type) {
      case 'unrecognized_vendor':
      case 'UNKNOWN_TRANSACTION':
        return 'Unrecognized Payee';
      case 'AMBIGUOUS_TRANSACTION':
        return 'Unclear Transaction';
      case 'ambiguous_category':
        return 'Category Needed';
      case 'DUPLICATE':
      case 'DUPLICATE_STATEMENT':
      case 'DUPLICATE_TRANSACTION':
        return 'Duplicate Entry';
      case 'missing_receipt':
      case 'MISSING_RECEIPT':
        return 'Receipt Needed';
      default:
        return 'Needs Review';
    }
  };

  if (isLoading && exceptions.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] pt-12 items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading items for review...</p>
      </div>
    );
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col h-full pt-12">
        <EmptyState
          icon={CheckCircle2}
          title="All caught up!"
          description="Your books are up to date. There are no transactions currently waiting for your review."
          actionLabel="Refresh List"
          onAction={() => {
            queryClient.invalidateQueries({ queryKey: exceptionKeys.lists() });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
      {/* Left Pane: List */}
      <div
        className={`w-full md:w-1/3 flex-col gap-3 overflow-y-auto pr-1 ${
          mobileView === 'detail' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {filteredExceptions.map((exc) => (
          <div
            key={exc.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedId(exc.id);
              setMobileView('detail');
            }}
            className={`w-full shrink-0 text-left p-4 rounded-xl border transition-all cursor-pointer ${
              selectedId === exc.id
                ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                : 'border-border bg-card hover:bg-muted/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{getTypeIcon(exc.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <span className="font-semibold text-sm line-clamp-2 leading-tight text-foreground">
                    {exc.description}
                  </span>
                  {exc.amount > 0 && (
                    <span className="font-mono tabular-nums text-right font-medium text-sm whitespace-nowrap text-foreground shrink-0">
                      {formatCurrency(exc.amount, exc.currency || 'USD')}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className="text-muted-foreground">{getTypeLabel(exc.type)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatIsoDate(exc.date)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Right Pane: Detail */}
      <div
        className={`w-full md:w-2/3 flex-col min-h-0 bg-card border rounded-xl overflow-hidden shadow-sm ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedException ? (
          <>
            <div className="p-4 sm:p-6 border-b shrink-0 flex flex-col gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileView('list')}
                className="md:hidden self-start -ml-2 text-muted-foreground hover:text-foreground h-8 px-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to list
              </Button>
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      REV-{selectedException.id.slice(0, 8).toUpperCase()}
                    </Badge>
                    <Badge
                      variant={selectedException.severity === 'high' ? 'destructive' : 'secondary'}
                    >
                      {selectedException.severity === 'high' ? 'High' : 'Normal'} Priority
                    </Badge>
                  </div>
                  <h2 className="text-xl font-bold leading-snug">
                    {selectedException.description}
                  </h2>
                  {selectedException.amount > 0 && (
                    <div className="text-2xl sm:text-3xl font-mono tabular-nums font-light pt-1">
                      {formatCurrency(
                        selectedException.amount,
                        selectedException.currency || 'USD',
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs sm:text-sm text-muted-foreground shrink-0">
                  <div>Transaction Date</div>
                  <div className="font-medium text-foreground tabular-nums">
                    {formatIsoDate(selectedException.date)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto bg-muted/10">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    AI Suggestion & Reason
                  </h3>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm leading-relaxed">{selectedException.aiProposal}</p>

                          {selectedException.type === 'missing_receipt' && (
                            <Button variant="outline" size="sm" className="mt-4">
                              <UploadCloud className="w-4 h-4 mr-2" /> Upload Receipt
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    What happens when you approve
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    This transaction will be recorded to your accounting books under the category
                    suggested above. Your bank and book balances will update automatically.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t shrink-0 flex flex-wrap items-center justify-between gap-2 bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleDismiss();
                  setMobileView('list');
                }}
                disabled={dismissMutation.isPending || resolveMutation.isPending}
                className="text-muted-foreground hover:text-destructive hover:border-destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                {dismissMutation.isPending ? 'Updating...' : 'Ignore / Unmatched'}
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={dismissMutation.isPending || resolveMutation.isPending}
                >
                  <SkipForward className="w-4 h-4 mr-2" />
                  Decide Later
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    handleApprove();
                    setMobileView('list');
                  }}
                  disabled={resolveMutation.isPending || dismissMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {resolveMutation.isPending ? 'Approving...' : 'Approve & Record'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <HelpCircle className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a transaction from the list to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
