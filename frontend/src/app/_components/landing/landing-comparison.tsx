'use client';

import * as React from 'react';
import {
  Check,
  X,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Split,
  Receipt,
  UserCheck,
  Lock,
} from 'lucide-react';
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
    feature: 'Payment Processor Fees (Stripe, PayPal)',
    description: 'When $1,000 invoice pays out as $970.70 after $29.30 gateway fee.',
    agentic: 'Auto-books $29.30 fee (6030) & marks invoice 100% PAID',
    agenticGood: true,
    quickbooks: 'Leaves unpaid $29.30 phantom balance; requires manual entry',
    quickbooksGood: false,
    xero: 'Fails without complex manual bank rules',
    xeroGood: false,
  },
  {
    feature: 'Typo-Tolerant Wire Matching',
    description: 'Matching invoices when wire memos have typos (e.g. Staright vs Starlight).',
    agentic: 'Fuzzy Levenshtein matching + suffix stripping (89%+)',
    agenticGood: true,
    quickbooks: 'Rigid exact match only; fails on single-character typo',
    quickbooksGood: false,
    xero: 'Rigid exact match only; strands payment as uncategorized',
    xeroGood: false,
  },
  {
    feature: 'Multi-Invoice Batch Settlements',
    description: 'A single $10,000 wire clearing 3 separate milestone invoices ($5k + $3k + $2k).',
    agentic: 'Automated subset-sum solver clears all 3 in 1 click',
    agenticGood: true,
    quickbooks: 'Manual search & tedious multi-checkbox selection',
    quickbooksGood: false,
    xero: 'Requires manual multi-line match linking',
    xeroGood: false,
  },
  {
    feature: 'Mixed Receipt Splitting (Costco, Amazon)',
    description: 'Dividing a single card swipe across supplies, groceries, and travel.',
    agentic: 'Interactive split modal with real-time balance validation',
    agenticGood: true,
    quickbooks: 'Manual multi-row journal entry with mental arithmetic',
    quickbooksGood: false,
    xero: 'Multi-line manual allocation form',
    xeroGood: false,
  },
  {
    feature: 'Accidental Personal Card Charges',
    description: 'Swiping company card for personal coffee, gifts, or pharmacy.',
    agentic: '1-Click "Personal Draw" (Account 3020) protects tax deductions',
    agenticGood: true,
    quickbooks: 'Mistakenly categorized as business expense; risks tax audits',
    quickbooksGood: false,
    xero: 'Requires manual equity journal distribution',
    xeroGood: false,
  },
  {
    feature: 'Day-1 Merchant Intelligence',
    description: 'Pre-trained recognition for 100+ vendors (AWS, Google, Slack, Uber, Stripe).',
    agentic: 'Instant Day-1 auto-categorization (0.96 confidence)',
    agenticGood: true,
    quickbooks: 'Zero vendors pre-trained; weeks spent creating regex rules',
    quickbooksGood: false,
    xero: 'Zero vendors pre-trained; manual rule creation',
    xeroGood: false,
  },
  {
    feature: 'Bank Statement PDF Processing',
    description:
      'Reads multi-page scanned & digital PDF statements directly without CSV formatting.',
    agentic: 'Native multi-page PDF OCR & cryptographic balance check',
    agenticGood: true,
    quickbooks: 'Requires 3rd-party paid add-ons or manual typing',
    quickbooksGood: false,
    xero: 'Requires manual CSV conversion and template hacking',
    xeroGood: false,
  },
  {
    feature: 'Audit Protection & Period Locking',
    description: 'Locking past fiscal months so closed tax returns are never altered.',
    agentic: 'Tamper-proof period lock + backdated statement quarantine',
    agenticGood: true,
    quickbooks: 'Allows silent historical edits that break prior tax filings',
    quickbooksGood: false,
    xero: 'Soft warning password that users easily bypass',
    xeroGood: false,
  },
  {
    feature: 'AI Safety & Zero Hallucinations',
    description: 'Preventing AI models from inventing balances or altering ledger state.',
    agentic: '100% Strict math core (ΣDebits = ΣCredits enforced by code)',
    agenticGood: true,
    quickbooks: 'Superficial chat widget with no autonomy',
    quickbooksGood: false,
    xero: 'Generic assist prompt with no auto-post capabilities',
    xeroGood: false,
  },
  {
    feature: 'Time to Close Monthly Books',
    description:
      'Average time required to reconcile bank accounts and finalize financial statements.',
    agentic: '< 15 minutes / month',
    agenticGood: true,
    quickbooks: '10 to 14 days of tedious manual work',
    quickbooksGood: false,
    xero: '8 to 12 days of manual matching',
    xeroGood: false,
  },
];

const QUICKBOOKS_TRAPS = [
  {
    icon: Receipt,
    title: 'The Stripe "$29.30 Fee Trap"',
    subtitle: 'Where QuickBooks leaves phantom invoice balances',
    legacy:
      'Customer pays a $1,000 invoice via Stripe. Bank receives $970.70. QuickBooks gets confused by the $29.30 difference and leaves the invoice open with an unpaid balance.',
    agentic:
      'Agentic OS detects the merchant fee, auto-books $29.30 to Account 6030 (Merchant Processing Fees), and marks the $1,000 invoice as 100% PAID automatically.',
    badge: 'Auto-Fee Accounting',
  },
  {
    icon: AlertTriangle,
    title: 'The Single-Letter "Typo Trap"',
    subtitle: 'Where QuickBooks strands wire transfers',
    legacy:
      'You invoice "Staright Corp". The client wires $5,000 from "Starlight Corp". QuickBooks exact match fails. The wire sits stranded in bank feeds for weeks.',
    agentic:
      'Our Levenshtein engine strips corporate suffixes, identifies 89% similarity, verifies the unique $5,000 amount, and auto-settles the payment in seconds.',
    badge: 'Typo-Tolerant Matching',
  },
  {
    icon: Split,
    title: 'The Mixed Receipt "Costco Trap"',
    subtitle: 'Where QuickBooks forces mental arithmetic',
    legacy:
      'You spend $650 at Costco on office paper and team snacks. In QuickBooks, you have to create a complex multi-line journal entry and manually do the math.',
    agentic:
      'Our interactive Split Modal lets you divide charges across categories with live real-time math balancing. Zero manual journal entry required.',
    badge: '1-Click Split Modal',
  },
  {
    icon: UserCheck,
    title: 'The Accidental "Personal Coffee Trap"',
    subtitle: 'Where QuickBooks triggers tax audit headaches',
    legacy:
      'The founder accidentally swipes the company debit card for personal groceries or coffee. QuickBooks codes it as a business expense, risking IRS tax audit penalties.',
    agentic:
      'One click on "Personal Draw" tags the charge to Account 3020 (Owner Equity). It cleanly bypasses company expenses and protects your tax deductions.',
    badge: 'Tax Audit Protection',
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
            Competitive Breakdown
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Why Modern Businesses Fire QuickBooks & Xero for Agentic OS
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            QuickBooks was built 25 years ago as a passive digital filing cabinet where YOU do all
            the work. Agentic Business OS acts like an autonomous, mathematically guaranteed digital
            bookkeeper.
          </p>
        </div>

        {/* 4 QuickBooks Traps Visual Cards Grid */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h3 className="text-lg sm:text-2xl font-bold text-foreground">
              The 4 QuickBooks Traps We Eliminate Forever
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Real-world accounting headaches that waste hours every month in legacy software.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {QUICKBOOKS_TRAPS.map((trap) => {
              const Icon = trap.icon;
              return (
                <div
                  key={trap.title}
                  className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                        {trap.badge}
                      </Badge>
                    </div>

                    <h4 className="text-base sm:text-lg font-bold text-foreground mb-1">
                      {trap.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-4">{trap.subtitle}</p>

                    {/* Before & After comparison boxes */}
                    <div className="space-y-3 text-xs">
                      <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive/90 flex items-start gap-2.5">
                        <X className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                        <div>
                          <strong className="block text-foreground font-semibold mb-0.5">
                            QuickBooks / Legacy:
                          </strong>
                          <span>{trap.legacy}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200 flex items-start gap-2.5">
                        <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <strong className="block text-foreground font-semibold mb-0.5">
                            Agentic Business OS:
                          </strong>
                          <span>{trap.agentic}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature Comparison Table Container */}
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
