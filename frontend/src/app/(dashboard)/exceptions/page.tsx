"use client"

import * as React from "react"
import { Check, X, AlertTriangle, FileQuestion, HelpCircle, ChevronRight, Building2, UploadCloud, Search, CheckCircle2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared/empty-state"

type ExceptionType = "unrecognized_vendor" | "ambiguous_category" | "missing_receipt"

interface ExceptionItem {
  id: string
  date: string
  amount: number
  description: string
  type: ExceptionType
  severity: "high" | "medium" | "low"
  aiProposal: string
}

const initialMockExceptions: ExceptionItem[] = [
  {
    id: "EX-1042",
    date: "Oct 05, 2026",
    amount: 142.50,
    description: "AMZN MKTP US*823",
    type: "unrecognized_vendor",
    severity: "medium",
    aiProposal: "Create new vendor 'Amazon Marketplace' and categorize as 'Office Supplies'."
  },
  {
    id: "EX-1043",
    date: "Oct 04, 2026",
    amount: 850.00,
    description: "STRIPE - transfer",
    type: "ambiguous_category",
    severity: "high",
    aiProposal: "Split into 'Revenue' ($875.00) and 'Stripe Fees' ($25.00)."
  },
  {
    id: "EX-1044",
    date: "Oct 03, 2026",
    amount: 45.00,
    description: "UBER EATS",
    type: "missing_receipt",
    severity: "low",
    aiProposal: "Categorize as 'Meals & Entertainment'. Request receipt from employee."
  }
]

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = React.useState<ExceptionItem[]>(initialMockExceptions)
  const [selectedId, setSelectedId] = React.useState<string | null>(initialMockExceptions[0]?.id || null)
  
  const selectedException = exceptions.find(e => e.id === selectedId)

  const handleApprove = () => {
    const updated = exceptions.filter(e => e.id !== selectedId)
    setExceptions(updated)
    setSelectedId(updated.length > 0 ? updated[0].id : null)
  }

  const getTypeIcon = (type: ExceptionType) => {
    switch(type) {
      case "unrecognized_vendor": return <Building2 className="w-4 h-4 text-orange-500" />
      case "ambiguous_category": return <AlertTriangle className="w-4 h-4 text-amber-500" />
      case "missing_receipt": return <FileQuestion className="w-4 h-4 text-blue-500" />
    }
  }

  const getTypeLabel = (type: ExceptionType) => {
    switch(type) {
      case "unrecognized_vendor": return "Unrecognized Vendor"
      case "ambiguous_category": return "Ambiguous Category"
      case "missing_receipt": return "Missing Receipt"
    }
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] pt-12">
        <EmptyState
          icon={CheckCircle2}
          title="All caught up!"
          description="Your AI accountant has handled everything. There are no exceptions requiring your attention."
          actionLabel="Refresh Exceptions"
          onAction={() => {
            setExceptions(initialMockExceptions)
            setSelectedId(initialMockExceptions[0].id)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exception Center</h1>
          <p className="text-muted-foreground mt-1">Review and approve AI decisions.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search exceptions..."
              className="pl-8 bg-background"
            />
          </div>
          <Button variant="outline">Filter</Button>
        </div>
      </div>

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
                    <span className="font-medium whitespace-nowrap">${exc.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-xs">
                    <span className="text-muted-foreground">{getTypeLabel(exc.type)}</span>
                    <span className="text-muted-foreground">{exc.date}</span>
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
                  <div className="text-3xl font-light mt-2">${selectedException.amount.toFixed(2)}</div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>Transaction Date</div>
                  <div className="font-medium text-foreground">{selectedException.date}</div>
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
                                <div className="text-right font-medium text-emerald-600">+$875.00</div>
                                <div className="text-muted-foreground">Stripe Fees</div>
                                <div className="text-right font-medium text-destructive">-$25.00</div>
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
                <Button onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Check className="w-4 h-4 mr-2" /> Approve Proposal
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
    </div>
  )
}
