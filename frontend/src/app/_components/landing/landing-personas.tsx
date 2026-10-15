'use client';

import * as React from 'react';
import { Users, Briefcase, ShoppingBag, Sparkles, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const PERSONAS = [
  {
    role: 'Founders & CEOs',
    tagline: 'Always know your true runway without doing accounting.',
    description:
      'Stop spending your weekends categorizing transactions or paying $5,000/month for slow bookkeeping agencies. Upload your statements and get instant financial peace of mind.',
    benefits: [
      'Real-time cash balance & burn runway updates',
      'Zero bookkeeping jargon or manual entry',
      'Investor-ready P&L and Balance Sheets anytime',
    ],
    icon: Briefcase,
  },
  {
    role: 'Bookkeepers & Fractional CFOs',
    tagline: '10x your client capacity with 1-click bulk approvals.',
    description:
      'Eliminate the repetitive manual grind of bank reconciliations. Use Payee Clustering to resolve 13,000 transactions across dozens of client organizations effortlessly.',
    benefits: [
      'Multi-tenant client switching from a single screen',
      'Immutable cryptographic audit logs for CPAs',
      'Smart rule learning prevents repetitive triage',
    ],
    icon: Users,
  },
  {
    role: 'Agencies & E-Commerce',
    tagline: 'Effortlessly reconcile high-volume payouts & bills.',
    description:
      'Handle hundreds of supplier invoices, Stripe payouts, PayPal fees, and contractor charges without your books drifting out of sync.',
    benefits: [
      'Fuzzy invoice-to-payment wire matching',
      'Multi-currency and foreign exchange support',
      'Automated deduction & processing fee splits',
    ],
    icon: ShoppingBag,
  },
];

export function LandingPersonas() {
  return (
    <section id="features" className="py-20 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge
            variant="outline"
            className="text-xs font-semibold border-primary/30 text-primary bg-primary/5 mb-3"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Designed For Your Business
          </Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
            Built for Modern Founders, Operators & Bookkeepers
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Whether you are a solo founder closing your first round or a firm managing 50 client
            accounts, Agentic OS adapts to your exact workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.role}
                className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="p-3 rounded-xl bg-primary/10 text-primary w-fit mb-5">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-1">{p.role}</h3>
                  <p className="text-xs font-semibold text-primary mb-3">{p.tagline}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                    {p.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-border/60 space-y-2">
                  {p.benefits.map((b) => (
                    <div key={b} className="flex items-start gap-2 text-xs text-foreground/85">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{b}</span>
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
