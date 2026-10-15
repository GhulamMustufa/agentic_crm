'use client';

import * as React from 'react';
import { ShieldCheck, Lock, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function LandingMathGuarantee() {
  return (
    <section className="py-20 bg-muted/20 border-y border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 mb-3"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Unbreakable Financial Security
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Why Our AI Will Never Hallucinate Your Money
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            We know what business owners fear most: an AI model inventing fake numbers. That is why
            Agentic OS is partitioned into two strictly separated halves.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
          {/* Left Column: AI Advisory Zone */}
          <div className="rounded-2xl border border-primary/25 bg-primary/5 dark:bg-primary/10 p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Zone 1: Advisory & Extraction
                </span>
                <Badge variant="secondary" className="text-xs bg-primary/15 text-primary">
                  Proposals Only
                </Badge>
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2">
                The AI Bookkeeping Assistant
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                Creative and pattern-aware. The AI reads messy PDF statement strings, normalizes
                merchant titles, proposes Chart of Accounts mappings, and writes plain-English
                explanations.
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Cleans raw bank memos (e.g., &ldquo;AWS EMEA *987&rdquo; ➔ &ldquo;Amazon Web
                    Services&rdquo;)
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Proposes expense categories with confidence scores (e.g., 98% Match)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Drafts recommended double-entry journal balance proposals</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-primary/15 text-[11px] text-muted-foreground">
              ⚠️ The AI is physically restricted from writing to ledger tables or modifying bank
              balances.
            </div>
          </div>

          {/* Right Column: Deterministic Mathematical Core */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Zone 2: Authoritative Math Core
                </span>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-500/30 text-emerald-600 bg-emerald-500/10 font-mono"
                >
                  100% Deterministic
                </Badge>
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2">
                The Double-Entry Gatekeeper
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                Unforgiving mathematical code. Enforces strict double-entry invariants, validates
                checksums down to the cent, and halts instantly if any ledger entry fails to
                balance.
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Double-entry balance check: Total Debits must equal Total Credits (ΣDr = ΣCr)
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Opening + Inflows - Outflows == Closing Statement Balance verification
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Append-only, cryptographically verified audit trails for your tax CPA</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              🔒 Inviolable guarantee: No transaction is ever recorded unless verified by
              mathematical proof.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
