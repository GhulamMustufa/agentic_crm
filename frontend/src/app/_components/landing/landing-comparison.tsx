'use client';

import * as React from 'react';
import { Check, X, Sparkles, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ComparisonRow {
  feature: string;
  description: string;
  agentic: string;
  agenticGood: boolean;
  quickbooks: string;
  quickbooksGood: boolean;
  xero: string;
  xeroGood: boolean;
}

const COMPARISON_DATA: ComparisonRow[] = [
  {
    feature: 'Bank Statement PDF Processing',
    description: 'Reads multi-page PDF statements directly without CSV formatting.',
    agentic: 'Native multi-page PDF OCR & validation',
    agenticGood: true,
    quickbooks: 'Requires 3rd-party paid add-ons or manual typing',
    quickbooksGood: false,
    xero: 'Requires manual CSV conversion',
    xeroGood: false,
  },
  {
    feature: 'Recurring Merchant Review',
    description: 'Grouping recurring charges so you do not review 13,000 rows one by one.',
    agentic: '1-Click Payee Clusters (15 vendors = 1 click)',
    agenticGood: true,
    quickbooks: 'Review and click every single row manually',
    quickbooksGood: false,
    xero: 'Review and click every single row manually',
    xeroGood: false,
  },
  {
    feature: 'AI Safety & Zero Hallucinations',
    description: 'Preventing AI models from inventing balances or altering records.',
    agentic: '100% Strict math core (ΣDebits = ΣCredits)',
    agenticGood: true,
    quickbooks: 'Superficial chat widget with no autonomy',
    quickbooksGood: false,
    xero: 'Generic assist prompt with no auto-post',
    xeroGood: false,
  },
  {
    feature: 'Time to Close Monthly Books',
    description: 'Average time required to reconcile bank accounts and finalize P&L.',
    agentic: '< 15 minutes / month',
    agenticGood: true,
    quickbooks: '10 to 14 days of tedious manual work',
    quickbooksGood: false,
    xero: '8 to 12 days of manual matching',
    xeroGood: false,
  },
  {
    feature: 'Invoice-to-Payment Matching',
    description: 'Linking incoming bank wires and merchant payouts to open customer invoices.',
    agentic: 'AI Fuzzy matching + exact reference detection',
    agenticGood: true,
    quickbooks: 'Rigid exact match only; fails on fee deductions',
    quickbooksGood: false,
    xero: 'Rigid exact match only',
    xeroGood: false,
  },
  {
    feature: 'Setup Time & Usability',
    description: 'How quickly your team can get running without accounting degrees.',
    agentic: 'Instant (Under 2 minutes, zero training needed)',
    agenticGood: true,
    quickbooks: 'Weeks of setup, complex chart of accounts',
    quickbooksGood: false,
    xero: 'Steep learning curve, confusing menus',
    xeroGood: false,
  },
  {
    feature: 'Pricing & Cost Predictability',
    description: 'Transparent pricing with no unexpected price hikes.',
    agentic: 'Flat, honest tiers with generous limits',
    agenticGood: true,
    quickbooks: 'Frequent price hikes & costly per-seat add-ons',
    quickbooksGood: false,
    xero: 'Strict bill and transaction caps on starter tiers',
    xeroGood: false,
  },
];

export function LandingComparison() {
  return (
    <section id="comparison" className="py-20 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Direct Comparison
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Why Fast-Growing Companies Choose Agentic OS Over QuickBooks & Xero
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Traditional accounting software acts like a digital filing cabinet where YOU do all the
            work. Agentic Business OS acts like a self-driving digital finance team.
          </p>
        </div>

        {/* Comparison Table Container */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/70 bg-muted/30">
                  <th className="p-4 sm:p-5 text-sm font-semibold text-foreground w-[32%]">
                    Capability & Operational Impact
                  </th>
                  <th className="p-4 sm:p-5 text-sm font-bold text-primary bg-primary/5 border-x border-primary/20 w-[28%]">
                    <div className="flex items-center gap-1.5">
                      <span>Agentic Business OS</span>
                      <Badge className="bg-primary text-xs text-primary-foreground px-2 py-0.5 font-semibold">
                        Autonomous
                      </Badge>
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 text-sm font-semibold text-muted-foreground w-[20%]">
                    QuickBooks Online
                  </th>
                  <th className="p-4 sm:p-5 text-sm font-semibold text-muted-foreground w-[20%]">
                    Xero
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs sm:text-sm">
                {COMPARISON_DATA.map((row, idx) => (
                  <tr key={row.feature} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                    <td className="p-4 sm:p-5">
                      <div className="font-semibold text-foreground">{row.feature}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{row.description}</div>
                    </td>

                    {/* Agentic OS Column */}
                    <td className="p-4 sm:p-5 bg-primary/5 border-x border-primary/20 font-medium text-foreground">
                      <div className="flex items-start gap-2">
                        <div className="p-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">{row.agentic}</span>
                      </div>
                    </td>

                    {/* QuickBooks Column */}
                    <td className="p-4 sm:p-5 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="p-0.5 rounded-full bg-destructive/10 text-destructive shrink-0 mt-0.5">
                          <X className="w-3.5 h-3.5" />
                        </div>
                        <span>{row.quickbooks}</span>
                      </div>
                    </td>

                    {/* Xero Column */}
                    <td className="p-4 sm:p-5 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="p-0.5 rounded-full bg-destructive/10 text-destructive shrink-0 mt-0.5">
                          <X className="w-3.5 h-3.5" />
                        </div>
                        <span>{row.xero}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
