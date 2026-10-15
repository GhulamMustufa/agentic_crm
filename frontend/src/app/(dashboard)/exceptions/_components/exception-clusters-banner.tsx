'use client';

import * as React from 'react';
import {
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  exceptionKeys,
  ExceptionCluster,
  getExceptionClusters,
  resolveExceptionCluster,
} from '@/lib/api/exceptions';
import { formatCurrency } from '@/lib/formatters';
import { useTenantCurrency } from '@/hooks/use-tenant-currency';

export function ExceptionClustersBanner() {
  const queryClient = useQueryClient();
  const tenantCurrency = useTenantCurrency();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement>(null);

  const scrollRail = (direction: 'left' | 'right') => {
    if (railRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      railRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const { data: clusters = [], isLoading } = useQuery<ExceptionCluster[]>({
    queryKey: exceptionKeys.clusters(),
    queryFn: getExceptionClusters,
    staleTime: 60 * 1000,
  });

  const clusterMutation = useMutation({
    mutationFn: (cluster: ExceptionCluster) =>
      resolveExceptionCluster({
        payee: cluster.payee,
        accountId: cluster.suggestedAccountId,
        accountCode: cluster.suggestedAccountCode,
        action: 'APPROVE',
        rememberRule: true,
        exceptionIds: cluster.exceptionIds,
      }),
    onSuccess: (res, cluster) => {
      toast.success(
        `Batch approved ${res.resolvedCount} transactions for "${cluster.payee}" & recorded to General Ledger.`,
      );
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
    onError: (err, cluster) => {
      toast.error(`Could not approve cluster for ${cluster.payee}.`);
      console.error('Cluster resolution failed:', err);
    },
  });

  // Only display if we have clusters with 2 or more transactions
  const meaningfulClusters = clusters.filter((c) => c.count >= 2);
  const totalClusteredTransactions = meaningfulClusters.reduce((acc, c) => acc + c.count, 0);

  if (isLoading || meaningfulClusters.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10 shadow-xs transition-all overflow-hidden shrink-0">
      <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary text-primary-foreground shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-semibold text-foreground tracking-tight">
                AI Payee Clusters Available
              </h3>
              <Badge
                variant="secondary"
                className="text-[11px] bg-primary/15 text-primary border-none font-medium px-2 py-0.5"
              >
                {meaningfulClusters.length}{' '}
                {meaningfulClusters.length === 1 ? 'Merchant' : 'Merchants'} ·{' '}
                {totalClusteredTransactions.toLocaleString()} Transactions
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate hidden sm:block">
              One-click approve recurring merchant clusters instead of reviewing hundreds of
              individual rows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isExpanded && meaningfulClusters.length > 2 && (
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                onClick={() => scrollRail('left')}
                title="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                onClick={() => scrollRail('right')}
                title="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          <Button
            variant={isExpanded ? 'ghost' : 'outline'}
            size="sm"
            className={`h-7 sm:h-8 px-2.5 sm:px-3 text-xs shrink-0 font-medium ${
              isExpanded
                ? 'text-muted-foreground hover:text-foreground'
                : 'border-primary/30 text-primary hover:bg-primary/10'
            }`}
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? (
              <>
                Hide Clusters <ChevronUp className="w-3.5 h-3.5 ml-1" />
              </>
            ) : (
              <>
                Review Clusters ({meaningfulClusters.length}){' '}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <CardContent className="p-3 sm:p-4 pt-2.5 border-t border-primary/10 bg-background/50">
          <div
            ref={railRef}
            className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth"
          >
            {meaningfulClusters.map((cluster) => {
              const amountFloat = Number(cluster.totalAmountCents) / 100;
              const isPendingThis =
                clusterMutation.isPending && clusterMutation.variables?.payee === cluster.payee;

              return (
                <div
                  key={cluster.payee}
                  className="w-[280px] shrink-0 p-3 rounded-xl border border-border/80 bg-background flex flex-col justify-between gap-3 shadow-xs hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="font-medium text-xs sm:text-sm text-foreground line-clamp-1"
                        title={cluster.payee}
                      >
                        {cluster.payee}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[11px] font-mono shrink-0 px-1.5 py-0"
                      >
                        {cluster.count.toLocaleString()} items
                      </Badge>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm sm:text-base font-semibold text-foreground font-mono">
                        {formatCurrency(amountFloat, cluster.currency || tenantCurrency)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">total</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal truncate max-w-[170px] px-1.5 py-0"
                      >
                        {cluster.suggestedCategory}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-1.5 py-0"
                      >
                        {Math.round(cluster.averageConfidence * 100)}% Match
                      </Badge>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="w-full text-xs h-7.5 gap-1.5"
                    disabled={clusterMutation.isPending}
                    onClick={() => clusterMutation.mutate(cluster)}
                  >
                    {isPendingThis ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Approving {cluster.count}...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve All ({cluster.count.toLocaleString()})
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
