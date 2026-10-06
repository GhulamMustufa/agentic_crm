"use client"

import * as React from "react"
import { Check, AlertTriangle, FileQuestion, HelpCircle, ChevronRight, Building2, UploadCloud, CheckCircle2 } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { formatCurrency, formatIsoDate } from "@/lib/formatters"
import { 
  exceptionKeys, 
  ExceptionItem, 
  ExceptionType, 
  resolveException 
} from "@/lib/api/exceptions"

// Bot icon import was missing in previous file
import { Bot } from "lucide-react"

export function ExceptionListClient({ initialData }: { initialData: ExceptionItem[] }) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = React.useState<string | null>(initialData[0]?.id || null)
  
  const { data: exceptions = initialData, isLoading } = useQuery({
    queryKey: exceptionKeys.lists(),
    queryFn: async () => {
      // Just re-fetching the initialData logic
      const res = await fetch('http://localhost:3000/exceptions', {
        headers: { 'x-tenant-id': 'default-tenant' }
      })
      const data = (await res.json()) as Array<{
        id: string
        createdAt: string
        reason: string
        type: ExceptionType
        context?: { amount?: number; severity?: "high" | "medium" | "low" }
        aiRecommendation?: string
      }>
      return data.map((item) => ({
        id: item.id,
        date: item.createdAt,
        amount: item.context?.amount || 0,
        description: item.reason,
        type: item.type,
        severity: item.context?.severity || "medium",
        aiProposal: item.aiRecommendation || "",
      })) as ExceptionItem[]
    },
    initialData,
  })

  // Optimistic Mutation
  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveException(id, 'APPROVE'),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: exceptionKeys.lists() })
      const previousData = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists())
      
      queryClient.setQueryData<ExceptionItem[]>(exceptionKeys.lists(), (old) => {
        if (!old) return []
        const filtered = old.filter((item) => item.id !== id)
        return filtered
      })

      // Select next item
      const currentList = queryClient.getQueryData<ExceptionItem[]>(exceptionKeys.lists()) || []
      if (currentList.length > 0) {
        setSelectedId(currentList[0].id)
      } else {
        setSelectedId(null)
      }

      return { previousData }
    },
    onError: (err, id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(exceptionKeys.lists(), context.previousData)
      }
      // If there's a toast library, show error
      console.error('Failed to approve transaction proposal. Please try again.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all })
    }
  })

  const selectedException = exceptions.find(e => e.id === selectedId)

  const handleApprove = () => {
    if (selectedId) {
      resolveMutation.mutate(selectedId)
    }
  }

  const getTypeIcon = (type: ExceptionType) => {
    switch(type) {
      case "unrecognized_vendor":
      case "UNKNOWN_TRANSACTION": return <Building2 className="w-4 h-4 text-orange-500" />
      case "ambiguous_category":
      case "DUPLICATE": return <AlertTriangle className="w-4 h-4 text-amber-500" />
      case "missing_receipt":
      case "MISSING_RECEIPT": return <FileQuestion className="w-4 h-4 text-blue-500" />
      default: return <AlertTriangle className="w-4 h-4 text-amber-500" />
    }
  }

  const getTypeLabel = (type: ExceptionType) => {
    switch(type) {
      case "unrecognized_vendor":
      case "UNKNOWN_TRANSACTION": return "Unknown Transaction"
      case "ambiguous_category":
      case "DUPLICATE": return "Duplicate Transaction"
      case "missing_receipt":
      case "MISSING_RECEIPT": return "Missing Receipt"
      default: return "Exception"
    }
  }

  if (isLoading && exceptions.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] pt-12 items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading exceptions...</p>
      </div>
    )
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col h-full pt-12">
        <EmptyState
          icon={CheckCircle2}
          title="All caught up!"
          description="Your AI accountant has handled everything. There are no exceptions requiring your attention."
          actionLabel="Refresh Exceptions"
          onAction={() => {
            queryClient.invalidateQueries({ queryKey: exceptionKeys.lists() })
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
      {/* Left Pane: List */}
      <div className="w-full md:w-1/3 flex flex-col gap-3 overflow-y-auto pr-1">
        {exceptions.map(exc => (
          <Card 
            key={exc.id} 
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === exc.id ? 'border-primary shadow-sm bg-primary/5 dark:bg-primary/10' : ''}`}
            onClick={() => setSelectedId(exc.id)}
          >
            <CardContent className="p-4 flex gap-3">
              <div className="mt-0.5 shrink-0">
                {getTypeIcon(exc.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold truncate pr-2">{exc.description}</span>
                  <span className="font-mono tabular-nums text-right font-medium whitespace-nowrap">{formatCurrency(exc.amount)}</span>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className="text-muted-foreground">{getTypeLabel(exc.type)}</span>
                  <span className="tabular-nums text-muted-foreground">{formatIsoDate(exc.date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Right Pane: Detail */}
      <div className="w-full md:w-2/3 flex flex-col min-h-0 bg-card border rounded-xl overflow-hidden shadow-sm">
        {selectedException ? (
          <>
            <div className="p-6 border-b shrink-0 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="capitalize">
                    {selectedException.id}
                  </Badge>
                  <Badge variant={selectedException.severity === 'high' ? 'destructive' : 'secondary'}>
                    {selectedException.severity} priority
                  </Badge>
                </div>
                <h2 className="text-2xl font-bold">{selectedException.description}</h2>
                <div className="text-3xl font-mono tabular-nums font-light mt-2">{formatCurrency(selectedException.amount)}</div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>Transaction Date</div>
                <div className="font-medium text-foreground tabular-nums">{formatIsoDate(selectedException.date)}</div>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-muted/10">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Analysis & Proposal</h3>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm leading-relaxed">{selectedException.aiProposal}</p>
                          
                          {selectedException.type === "ambiguous_category" && (
                            <div className="mt-4 p-3 bg-background rounded-md border text-sm grid grid-cols-2 gap-2">
                              <div className="text-muted-foreground">Revenue</div>
                              <div className="text-right font-mono tabular-nums font-medium text-emerald-600">+{formatCurrency(875.00)}</div>
                              <div className="text-muted-foreground">Stripe Fees</div>
                              <div className="text-right font-mono tabular-nums font-medium text-destructive">-{formatCurrency(25.00)}</div>
                            </div>
                          )}
                          
                          {selectedException.type === "missing_receipt" && (
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
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Context</h3>
                  <div className="text-sm text-muted-foreground">
                    This transaction was imported via SVB Corporate Checking on Oct 06, 2026. 
                    No matching invoice or receipt was found in the system.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t shrink-0 flex items-center justify-end gap-3 bg-muted/20">
              <Button variant="ghost" onClick={handleApprove}>Skip for now</Button>
              <Button variant="outline">
                <ChevronRight className="w-4 h-4 mr-2" /> Modify
              </Button>
              <Button 
                onClick={handleApprove} 
                disabled={resolveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" /> 
                {resolveMutation.isPending ? "Approving..." : "Approve Proposal"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <HelpCircle className="w-12 h-12 mb-4 opacity-20" />
            <p>Select an exception from the list to view details.</p>
          </div>
        )}
      </div>
    </div>
  )
}
