'use client';

import * as React from 'react';
import Link from 'next/link';
import { Calculator, ArrowRight, Clock, DollarSign, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LandingRoiCalculator() {
  const [transactionCount, setTransactionCount] = React.useState(500);
  const hourlyRate = 55; // Average hourly rate for bookkeeping / founder operational time ($55/hr)

  // Calculations:
  // Legacy software (QBO/Xero): ~2.5 minutes per transaction (extract, match, fix errors, categorize)
  const legacyHoursPerMonth = Math.round((transactionCount * 2.4) / 60);
  // Agentic OS: ~0.15 minutes per transaction (almost all automated, 1-click clusters)
  const agenticHoursPerMonth = Math.max(
    0.25,
    Math.round(((transactionCount * 0.12) / 60) * 10) / 10,
  );
  const hoursSavedPerMonth = Math.max(1, Math.round(legacyHoursPerMonth - agenticHoursPerMonth));
  const annualDollarSavings = Math.round(hoursSavedPerMonth * hourlyRate * 12);

  return (
    <section id="roi-calculator" className="py-20 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Calculator className="w-3 h-3 mr-1" />
            Interactive ROI Calculator
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Calculate Your Time & Dollar Savings
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            See how much time and money your company reclaims every month by replacing manual
            bookkeeping with autonomous AI execution.
          </p>
        </div>

        <div className="max-w-4xl mx-auto rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Slider Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="tx-slider" className="text-sm font-semibold text-foreground">
                    Monthly Bank Transactions:
                  </label>
                  <span className="text-xl sm:text-2xl font-bold font-mono text-primary">
                    {transactionCount.toLocaleString()}
                  </span>
                </div>
                <input
                  id="tx-slider"
                  type="range"
                  min="100"
                  max="5000"
                  step="50"
                  value={transactionCount}
                  onChange={(e) => setTransactionCount(Number(e.target.value))}
                  className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5 font-mono">
                  <span>100 / mo</span>
                  <span>1,000 / mo</span>
                  <span>2,500 / mo</span>
                  <span>5,000+ / mo</span>
                </div>
              </div>

              {/* Comparison breakdown mini-cards */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20">
                  <div className="text-xs text-muted-foreground font-medium">QuickBooks / Xero</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-foreground mt-1">
                    ~{legacyHoursPerMonth} hrs/mo
                  </div>
                  <div className="text-[11px] text-destructive mt-0.5">
                    Manual typing & clicking
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/5">
                  <div className="text-xs text-primary font-semibold">Agentic Business OS</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-primary mt-1">
                    &lt; {agenticHoursPerMonth} hrs/mo
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    1-click approvals only
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                💡 Calculated at an average founder / bookkeeping rate of{' '}
                <strong>${hourlyRate}/hour</strong>. Does not include additional savings from
                eliminated 3rd-party OCR subscriptions.
              </div>
            </div>

            {/* Calculated Results Card (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-6 sm:p-7 flex flex-col justify-between text-center lg:text-left space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Your Projected Annual Savings
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-foreground font-mono mt-2">
                  ${annualDollarSavings.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground"> / year</span>
                </div>
                <div className="mt-3 flex items-center justify-center lg:justify-start gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                  <span>Reclaim {hoursSavedPerMonth} hours every single month</span>
                </div>
              </div>

              <div className="pt-4 border-t border-primary/15">
                <Link href="/register">
                  <Button className="w-full h-11 text-sm font-semibold shadow-md gap-2 cursor-pointer">
                    <span>Reclaim Your Time Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <div className="text-[11px] text-muted-foreground mt-2 text-center">
                  14-day free trial • Cancel anytime
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
