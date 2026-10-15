'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LandingPricing() {
  const [isAnnual, setIsAnnual] = React.useState(true);

  const tiers = [
    {
      name: 'Starter',
      badge: null,
      priceMonthly: 49,
      priceAnnual: 39,
      description:
        'Ideal for solo founders and early-stage companies with straightforward banking.',
      features: [
        'Up to 500 transactions / month',
        '1 Company Organization',
        'Native PDF & CSV Bank Statement Extraction',
        'Automated Chart of Accounts classification',
        'Standard double-entry General Ledger',
        '1 User Account',
        'Standard Email Support',
      ],
      ctaText: 'Start Free 14-Day Trial',
      popular: false,
    },
    {
      name: 'Growth',
      badge: 'MOST POPULAR',
      priceMonthly: 129,
      priceAnnual: 99,
      description: 'For growing businesses and agencies wanting full autopilot bookkeeping.',
      features: [
        'Up to 2,500 transactions / month',
        '3 Company Organizations',
        'Smart Payee Clustering (1-Click Bulk Approvals)',
        'Multi-currency & Foreign Exchange conversions',
        'Automated Invoice & Wire Payment Fuzzy Matching',
        'Real-time Cash Runway & Financial Forecasting',
        '5 Team Seats with RBAC permissions',
        'Priority Email & Chat Support',
      ],
      ctaText: 'Start Free 14-Day Trial',
      popular: true,
    },
    {
      name: 'Partner / Scale',
      badge: 'FOR FIRMS & PROS',
      priceMonthly: 299,
      priceAnnual: 239,
      description: 'For accounting firms, fractional CFOs, and multi-entity operations.',
      features: [
        'Unlimited transactions / month',
        'Unlimited Client Organizations',
        'White-label financial exports for CPAs',
        'Cryptographic audit trail verification',
        'Custom Chart of Accounts mapping templates',
        'Unlimited Team Seats',
        'Dedicated Account Manager & Concierge Onboarding',
      ],
      ctaText: 'Start Free 14-Day Trial',
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 bg-muted/20 border-y border-border/60 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Simple, Transparent Pricing
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Invest in Autopilot. Save Thousands in Labor.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            No surprise price hikes, no hidden per-payroll fees, and no lock-in. Switch plans or
            cancel anytime.
          </p>

          {/* Billing Interval Switcher */}
          <div className="mt-8 inline-flex items-center gap-3 p-1 rounded-full bg-background border border-border shadow-xs">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-all cursor-pointer ${
                !isAnnual
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                isAnnual
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Annual Billing</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch max-w-7xl mx-auto">
          {tiers.map((tier) => {
            const price = isAnnual ? tier.priceAnnual : tier.priceMonthly;

            return (
              <div
                key={tier.name}
                className={`relative rounded-3xl border p-7 sm:p-8 flex flex-col justify-between transition-all ${
                  tier.popular
                    ? 'border-primary shadow-xl bg-card ring-1 ring-primary/40 lg:-translate-y-2'
                    : 'border-border/80 bg-card shadow-xs hover:border-border'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-primary text-primary-foreground shadow-sm">
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-foreground">{tier.name}</h3>
                    {!tier.popular && tier.badge && (
                      <Badge variant="outline" className="text-[10px] font-semibold border-border">
                        {tier.badge}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-6 min-h-[36px]">
                    {tier.description}
                  </p>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold font-mono text-foreground">
                      ${price}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">/ month</span>
                    {isAnnual && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium ml-2">
                        (billed annually)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 pt-6 border-t border-border/60 mb-8">
                    {tier.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-2.5 text-xs text-foreground/90"
                      >
                        <div className="p-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Link href="/register">
                    <Button
                      variant={tier.popular ? 'default' : 'outline'}
                      className="w-full h-11 text-xs sm:text-sm font-semibold shadow-xs gap-1.5 cursor-pointer"
                    >
                      <span>{tier.ctaText}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <div className="text-[11px] text-muted-foreground text-center mt-2.5">
                    14-day free trial • Cancel anytime
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
