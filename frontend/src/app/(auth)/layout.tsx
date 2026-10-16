'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  Scale,
  FileSpreadsheet,
  Lock,
  Sparkles,
  CheckCircle2,
  Quote,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Header */}
      <header className="w-full h-16 border-b border-border/60 bg-background/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between shrink-0 z-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 group cursor-pointer"
          title="Back to Agentic OS Home"
        >
          <BrandLogo size={28} className="shadow-xs group-hover:scale-105 transition-transform" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-foreground">Agentic OS</span>
            <span className="hidden sm:inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3 mr-1" />
              Autonomous Finance
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs sm:text-sm text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Button>
          </Link>
          <div className="w-px h-4 bg-border/80" />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Dual-Pane Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Pane: Interactive Auth Form */}
        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 lg:p-10 xl:p-12 overflow-y-auto">
          <div className="flex-1 flex items-center justify-center py-6 sm:py-8">
            <div className="w-full max-w-md animate-in fade-in duration-200">{children}</div>
          </div>

          {/* Left Pane Footer */}
          <footer className="pt-4 text-center text-xs text-muted-foreground border-t border-border/40">
            © {new Date().getFullYear()} Agentic Business OS. All rights reserved.
          </footer>
        </div>

        {/* Right Pane: Enterprise Trust & Social Proof (Desktop only) */}
        <aside className="hidden lg:flex lg:w-1/2 xl:w-[48%] flex-col justify-between p-8 xl:p-12 border-l border-border/60 bg-gradient-to-br from-primary/[0.04] via-muted/30 to-primary/[0.02] relative overflow-hidden">
          {/* Subtle decorative glow shapes */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Section: Authority Headline */}
          <div className="relative z-1 space-y-4">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border-primary/20 gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Enterprise Financial Autonomy
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                SOC 2 Type II Architecture
              </span>
            </div>

            <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-foreground leading-snug">
              The Self-Balancing Financial Operating System.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Never spend another weekend clicking through bank rows or guessing chart of accounts.
              Drop statements in, resolve exceptions in 1 click, and close your books with
              uncompromising mathematical truth.
            </p>
          </div>

          {/* Middle Section: 3 Core Invariant Pillars */}
          <div className="relative z-1 space-y-3.5 my-8">
            <div className="p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                <Scale className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">
                  100% Strict Double-Entry Core
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  Total Debits must strictly equal Total Credits (ΣDr = ΣCr). The AI engine is
                  physically restricted from writing to the general ledger without passing
                  deterministic math proofs.
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">
                  Native Multi-Page Statement Extraction
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  Ingests PDF and CSV bank statements across Chase, Barclays, Maybank, and more.
                  Automatically catches duplicates, cleans vendor names, and extracts line items.
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">
                  Bank-Grade Cryptographic Isolation
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  AES-256 encrypted storage, strict tenant isolation at the database layer, and
                  append-only immutable audit logs prepared for external CPAs and tax auditors.
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Testimonial & Metrics Strip */}
          <div className="relative z-1 space-y-4 pt-6 border-t border-border/60">
            {/* Testimonial Quote */}
            <div className="p-4 rounded-xl bg-card/80 border border-border/60 shadow-xs space-y-2.5">
              <div className="flex items-center gap-1 text-primary">
                <Quote className="w-4 h-4 fill-primary/20 rotate-180" />
                <span className="text-xs font-semibold">Verified Fractional CFO</span>
              </div>
              <p className="text-xs text-foreground/90 italic leading-relaxed">
                &ldquo;We replaced 15 hours of weekly bank reconciliation grind in QuickBooks.
                Agentic OS clusters recurring merchants automatically and guarantees that general
                ledger balances never hallucinate.&rdquo;
              </p>
              <div className="flex items-center justify-between pt-1 text-xs">
                <div>
                  <span className="font-bold text-foreground">Marcus Vance</span>
                  <span className="text-muted-foreground"> • Partner, LedgerWorks Advisory</span>
                </div>
                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified Customer
                </span>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <div className="text-base font-extrabold font-mono text-foreground">&lt; 2 min</div>
                <div className="text-xs text-muted-foreground">Month-End Close</div>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <div className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  100%
                </div>
                <div className="text-xs text-muted-foreground">Math Invariance</div>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <div className="text-base font-extrabold font-mono text-primary">$0</div>
                <div className="text-xs text-muted-foreground">Hallucinations</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
