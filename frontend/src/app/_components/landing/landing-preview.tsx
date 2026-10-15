'use client';

import * as React from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Building2,
  DollarSign,
  Activity,
  Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function LandingPreview() {
  const [activeTab, setActiveTab] = React.useState<'ingestion' | 'clustering' | 'ledger'>(
    'clustering',
  );

  return (
    <section id="preview" className="py-16 bg-muted/20 border-y border-border/60 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Interactive Product Preview
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            See the Autonomous Back-Office in Action
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Experience how our coordinated AI agents turn messy raw statements into clean, audited
            general ledger entries in seconds.
          </p>

          {/* Interactive Feature Tabs */}
          <div className="mt-8 inline-flex items-center p-1.5 rounded-xl bg-background border border-border shadow-xs">
            <button
              onClick={() => setActiveTab('ingestion')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'ingestion'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              1. Statement Ingestion
            </button>
            <button
              onClick={() => setActiveTab('clustering')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'clustering'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              2. Smart Payee Clustering
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              3. Balanced General Ledger
            </button>
          </div>
        </div>

        {/* Mockup Window Container */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden max-w-5xl mx-auto">
          {/* Mockup Window Titlebar */}
          <div className="h-10 bg-muted/50 border-b border-border/70 px-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="text-[11px] font-mono text-muted-foreground/80 font-medium">
              agentic-os.local / {activeTab}
            </div>
            <div className="w-12" />
          </div>

          {/* Window Body */}
          <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-[380px] flex flex-col justify-center">
            {activeTab === 'ingestion' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="p-6 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-center flex flex-col items-center">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary mb-3">
                    <FileSpreadsheet className="w-8 h-8" />
                  </div>
                  <h4 className="font-semibold text-base text-foreground">
                    Bank_Statement_October_2026.pdf
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    Multi-page PDF extracted: 452 transactions identified. Checksums balanced:
                    $124,590.20 opening = $188,310.45 closing.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5 text-xs"
                    >
                      ✓ Mathematical Integrity Validated
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-primary/30 text-primary bg-primary/5 text-xs"
                    >
                      ✓ 0 Duplicates Detected
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <div className="text-muted-foreground">Extracted Lines</div>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">452 Rows</div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      100% Parsed
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <div className="text-muted-foreground">Auto-Reconciled Invoices</div>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">
                      398 Items
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Matched with AR/AP
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border/70 bg-card">
                    <div className="text-muted-foreground">Review Queue Items</div>
                    <div className="text-lg font-bold font-mono text-primary mt-1">
                      54 Exceptions
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Routed to Triage</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'clustering' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary text-primary-foreground">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">
                        AI Payee Clusters (Smart Bulk Review)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Instead of reviewing 54 transactions row-by-row, group them into 3 merchant
                        clusters:
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-primary/15 text-primary text-xs">
                    3 Clusters · 54 Transactions
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">Google Cloud / Workspace</span>
                        <Badge variant="outline" className="text-[11px] font-mono">
                          18 items
                        </Badge>
                      </div>
                      <div className="text-lg font-bold font-mono mt-2">$2,410.00</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          6010 — Cloud Software
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-500/30"
                        >
                          99% Match
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" className="mt-3.5 h-8 text-xs font-semibold gap-1">
                      <Check className="w-3.5 h-3.5" /> Approve All (18)
                    </Button>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">Amazon Web Services</span>
                        <Badge variant="outline" className="text-[11px] font-mono">
                          24 items
                        </Badge>
                      </div>
                      <div className="text-lg font-bold font-mono mt-2">$6,840.50</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          6010 — Cloud Hosting
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-500/30"
                        >
                          98% Match
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" className="mt-3.5 h-8 text-xs font-semibold gap-1">
                      <Check className="w-3.5 h-3.5" /> Approve All (24)
                    </Button>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">Stripe Merchant Payouts</span>
                        <Badge variant="outline" className="text-[11px] font-mono">
                          12 items
                        </Badge>
                      </div>
                      <div className="text-lg font-bold font-mono mt-2">$34,120.00</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          4010 — Customer Revenue
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-500/30"
                        >
                          99% Match
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" className="mt-3.5 h-8 text-xs font-semibold gap-1">
                      <Check className="w-3.5 h-3.5" /> Approve All (12)
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ledger' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="text-xs text-muted-foreground font-medium">
                      Reconciled Cash Balance
                    </div>
                    <div className="text-2xl font-bold font-mono text-foreground mt-1">
                      $188,310.45
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> 100% Balanced to Bank Statement
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="text-xs text-muted-foreground font-medium">Verified Runway</div>
                    <div className="text-2xl font-bold font-mono text-primary mt-1">
                      14.2 Months
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Based on trailing 90-day burn
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="text-xs text-muted-foreground font-medium">
                      General Ledger Status
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                      Audit-Ready
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Zero unbalanced suspense lines
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Double-Entry Validation Invariant: Total Debits ($43,370.50) == Total Credits
                      ($43,370.50). Net Imbalance: $0.00.
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-600 bg-background text-[11px] font-mono"
                  >
                    PROVABLY ACCURATE
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
