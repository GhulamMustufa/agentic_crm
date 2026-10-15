'use client';

import * as React from 'react';
import { UploadCloud, Cpu, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STEPS = [
  {
    step: '01',
    icon: UploadCloud,
    title: 'Drop Your Bank Statements',
    description:
      'Upload PDF or CSV statements from any bank worldwide. No reformatting, no CSV template hacking, and no manual typing required.',
    details: [
      'Multi-page native & scanned PDF OCR',
      'Automatic opening & closing balance check',
      'Zero setup required for standard banks',
    ],
  },
  {
    step: '02',
    icon: Cpu,
    title: 'The AI Autopilot Does the Work',
    description:
      'Our 17-step pipeline cleans messy vendor strings (e.g. AMZN MKTP US*2A81 ➔ Amazon Inc.), categorizes expenses, detects duplicates, and matches customer invoices.',
    details: [
      'Entity resolution & vendor cleanup',
      'Chart of Accounts auto-classification',
      'Fuzzy invoice & wire fee reconciliation',
    ],
  },
  {
    step: '03',
    icon: CheckCircle2,
    title: '1-Click Confirm & Relax',
    description:
      'Review grouped merchant clusters in seconds. Your balanced general ledger, P&L, and balance sheet are instantly ready for your CPA.',
    details: [
      'Approve 100+ recurring charges in 1 click',
      'Permanent counterparty rule learning',
      'Strict double-entry balance verification',
    ],
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-muted/20 border-y border-border/60 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Simple 3-Step Process
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            How Agentic OS Automates Your Entire Bookkeeping
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            From raw statement upload to a balanced General Ledger in under 2 minutes. No accounting
            degree required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative">
          {STEPS.map((s, index) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="relative rounded-2xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-3xl font-extrabold font-mono text-muted-foreground/30">
                      {s.step}
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">{s.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                    {s.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-border/60 space-y-2">
                  {s.details.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-foreground/80">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
